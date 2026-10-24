import {
  parseNoteContent,
  buildNoteContent,
  setProp,
  isValidPropKey
} from '../../shared/noteMeta.js'
import { parseTags, removeTagsFromContent } from '../../shared/tags.js'
import { extractCanvasText } from '../fts.js'
import { snapshotHash, computeCanvasHashFromData } from '../canvas.js'

/**
 * Move note metadata out of the body and into an Obsidian-style properties
 * section (the fence), and add the `note_meta` shadow index.
 *
 * Per note this:
 *   1. derives the fence from existing head-level data (`note_tags` -> `tags`,
 *      `display_title` -> `aliases`);
 *   2. strips legacy inline `#tag` markers from the head body;
 *   3. appends ONE normalization revision (`source: 'property'`) rather than
 *      rewriting history;
 *   4. rebuilds `note_tags`, `notes_fts`, `note_links` and `note_meta`.
 *
 * Notes without tags/aliases and without inline markers need no revision: their
 * canonical content is already correct.
 *
 * Idempotent: re-running finds no inline markers and no missing fence keys, so
 * it appends nothing.
 */
export const migration015NoteMetadata = {
  version: 15,
  name: 'note-metadata',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_meta (
        note_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value_text TEXT,
        value_num REAL,
        value_type TEXT NOT NULL,
        PRIMARY KEY (note_id, key)
      )
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_note_meta_key ON note_meta(key)')

    const notes = db.prepare(`
      SELECT id, title, content, type, canvasData, display_title,
             head_revision_id, revision_no
      FROM notes
    `).all()

    const tagsByNote = new Map()
    for (const row of db.prepare('SELECT note_id, tag FROM note_tags').all()) {
      if (!tagsByNote.has(row.note_id)) tagsByNote.set(row.note_id, [])
      tagsByNote.get(row.note_id).push(row.tag)
    }

    const insertRevision = db.prepare(`
      INSERT INTO note_revisions (
        id, note_id, parent_revision_id, revision_no, title, content,
        display_title, type, canvas_data, thumbnail, snapshot_hash,
        actor, source, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const updateNote = db.prepare(`
      UPDATE notes
      SET content = ?, head_revision_id = ?, revision_no = ?,
          display_title = ?, updatedAt = ?
      WHERE id = ?
    `)
    const deleteInlineTags = db.prepare(
      "DELETE FROM note_tags WHERE note_id = ? AND source = 'inline'"
    )
    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO note_tags (note_id, tag, source, created_at)
      VALUES (?, ?, 'inline', ?)
    `)
    const deleteMeta = db.prepare('DELETE FROM note_meta WHERE note_id = ?')
    const insertMeta = db.prepare(`
      INSERT OR REPLACE INTO note_meta (note_id, key, value_text, value_num, value_type)
      VALUES (?, ?, ?, ?, ?)
    `)

    const now = new Date().toISOString()

    // 4. Rebuild the shadow indexes from a note's head content.
    function refreshIndexes(noteId) {
      const head = db.prepare('SELECT content, canvasData FROM notes WHERE id = ?').get(noteId)
      const current = parseNoteContent(head.content)
      deleteInlineTags.run(noteId)
      const canvasTags = parseTags(extractCanvasText(head.canvasData))
      const tagSource = [
        ...(Array.isArray(current.props.tags) ? current.props.tags : []),
        ...canvasTags
      ]
      for (const tag of new Set(tagSource)) {
        if (tag) insertTag.run(noteId, String(tag), now)
      }

      deleteMeta.run(noteId)
      for (const entry of current.entries) {
        if (!entry || entry.blank || !isValidPropKey(entry.key)) continue
        const isList = entry.type === 'list'
        const isNum = entry.type === 'number'
        const isDate = entry.type === 'date'
        const values = isList ? entry.value : [entry.value]
        for (const value of values) {
          const text = value === null || value === undefined ? '' : String(value)
          insertMeta.run(
            noteId,
            entry.key,
            text,
            isNum ? Number(value) : (isDate ? Date.parse(text) : null),
            entry.type
          )
        }
      }
    }

    for (const note of notes) {
      const parsed = parseNoteContent(note.content)
      let entries = parsed.entries
      const bodyBefore = parsed.body

      // 1. Fold head-level metadata into the fence (never into old revisions).
      const existingTags = tagsByNote.get(note.id) || []
      if (existingTags.length > 0 && parsed.props.tags === undefined) {
        entries = setProp(entries, 'tags', [...existingTags].sort())
      }
      const alias = (note.display_title || '').trim()
      const derivedTitle = (note.title || '').trim()
      const needsAlias = alias !== '' && alias !== derivedTitle
      if (needsAlias && parsed.props.aliases === undefined) {
        entries = setProp(entries, 'aliases', [alias])
      }

      // 2. Strip legacy inline `#tag` markers from the head body.
      const legacy = parseTags(bodyBefore)
      const bodyAfter = legacy.length > 0
        ? removeTagsFromContent(bodyBefore, legacy).content
        : bodyBefore

      const contentChanged = bodyAfter !== bodyBefore
      const fenceChanged = entries.some(entry => entry.raw === null)

      if (!contentChanged && !fenceChanged) {
        // Nothing to normalize; keep the existing revision, refresh indexes.
        refreshIndexes(note.id)
        continue
      }

      // 3. Append exactly one normalization revision.
      const content = buildNoteContent(entries, bodyAfter)
      const revisionId = `rev_norm_${note.id}_${Date.now()}`
      const revisionNo = (note.revision_no || 1) + 1
      const hash = snapshotHash({
        title: note.title || '',
        content,
        canvasHash: note.type === 'canvas'
          ? computeCanvasHashFromData(note.canvasData)
          : null
      })
      insertRevision.run(
        revisionId,
        note.id,
        note.head_revision_id || null,
        revisionNo,
        note.title || '',
        content,
        note.display_title || null,
        note.type || 'text',
        null,
        null,
        hash,
        'system',
        'property',
        'metadata normalization',
        now
      )
      updateNote.run(
        content,
        revisionId,
        revisionNo,
        note.display_title || null,
        now,
        note.id
      )

      refreshIndexes(note.id)
    }
  }
}
