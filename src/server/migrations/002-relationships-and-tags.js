import { parseTags } from '../../shared/tags.js'
import { parseWikiLinks, normalizeLinkTitle } from '../../shared/links.js'
import { extractCanvasText } from '../fts.js'

function titleMap(notes) {
  const map = new Map()
  for (const note of notes) {
    const keys = new Set()
    if (note.title) keys.add(normalizeLinkTitle(note.title))
    if (note.display_title) keys.add(normalizeLinkTitle(note.display_title))
    for (const key of keys) {
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(note)
    }
  }
  return map
}

function resolveLink(link, notesById, titles) {
  if (link.kind === 'id') {
    const note = notesById.get(link.target)
    if (!note) return { targetNoteId: null, status: 'unresolved' }
    return { targetNoteId: note.id, status: note.archived_at ? 'archived' : 'ok' }
  }
  const matches = titles.get(normalizeLinkTitle(link.target)) || []
  if (matches.length === 0) return { targetNoteId: null, status: 'unresolved' }
  if (matches.length > 1) return { targetNoteId: null, status: 'ambiguous' }
  const note = matches[0]
  return { targetNoteId: note.id, status: note.archived_at ? 'archived' : 'ok' }
}

export const migration002RelationshipsAndTags = {
  version: 2,
  name: 'relationships-and-tags',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'inline',
        created_at TEXT NOT NULL,
        PRIMARY KEY (note_id, tag),
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_note_id TEXT NOT NULL,
        source_revision_id TEXT NOT NULL,
        target_note_id TEXT,
        target_label TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        target_kind TEXT NOT NULL DEFAULT 'title',
        raw TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ok',
        source TEXT NOT NULL DEFAULT 'inline',
        created_at TEXT NOT NULL,
        FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_links_source ON note_links(source_note_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON note_links(target_note_id);
    `)

    const notes = db.prepare('SELECT * FROM notes').all()
    const notesById = new Map(notes.map(n => [n.id, n]))
    const titles = titleMap(notes)

    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO note_tags (note_id, tag, source, created_at)
      VALUES (?, ?, 'inline', ?)
    `)
    const insertLink = db.prepare(`
      INSERT INTO note_links
        (source_note_id, source_revision_id, target_note_id, target_label,
         label, target_kind, raw, status, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inline', ?)
    `)

    const now = new Date().toISOString()
    db.exec('DELETE FROM note_tags')
    db.exec('DELETE FROM note_links')

    for (const note of notes) {
      const text = `${note.content || ''}\n${extractCanvasText(note.canvasData)}`
      for (const tag of parseTags(text)) {
        insertTag.run(note.id, tag, now)
      }
      for (const link of parseWikiLinks(text)) {
        const resolved = resolveLink(link, notesById, titles)
        insertLink.run(
          note.id,
          note.head_revision_id || '',
          resolved.targetNoteId,
          link.target,
          link.label,
          link.kind,
          link.raw,
          resolved.status,
          now
        )
      }
    }
  }
}
