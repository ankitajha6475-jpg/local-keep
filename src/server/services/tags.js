import { parseTags, normalizeTag, tagAncestors, tagMatchesPrefix } from '../../shared/tags.js'
import { parseNoteContent } from '../../shared/noteMeta.js'
import { extractCanvasText } from '../fts.js'

export function createTagService({ db }) {
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO note_tags (note_id, tag, source, created_at)
    VALUES (?, ?, 'inline', ?)
  `)

  /**
   * Rebuild a note's tags from its head content. Tags live in the properties
   * fence; canvas notes may also carry tags in their canvas text.
   */
  function syncNote(noteId, content, canvasData) {
    db.prepare("DELETE FROM note_tags WHERE note_id = ? AND source = 'inline'").run(noteId)
    const { props } = parseNoteContent(content || '')
    const fromFence = Array.isArray(props.tags) ? props.tags : []
    const fromCanvas = parseTags(extractCanvasText(canvasData))
    const now = new Date().toISOString()
    const seen = new Set()
    for (const raw of [...fromFence, ...fromCanvas]) {
      const tag = normalizeTag(raw)
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      insertTag.run(noteId, tag, now)
    }
    return seen.size
  }

  function tagsForNote(noteId) {
    return db.prepare(
      'SELECT tag FROM note_tags WHERE note_id = ? ORDER BY tag ASC'
    ).all(noteId).map(row => row.tag)
  }

  function tagsByNote(noteIds) {
    const result = new Map()
    const ids = [...new Set(noteIds)].filter(Boolean)
    if (ids.length === 0) return result
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT note_id, tag FROM note_tags WHERE note_id IN (${placeholders}) ORDER BY tag ASC`
    ).all(...ids)
    for (const id of ids) result.set(id, [])
    for (const row of rows) result.get(row.note_id).push(row.tag)
    return result
  }

  function tagRows() {
    return db.prepare(`
      SELECT t.note_id AS noteId, t.tag AS tag
      FROM note_tags t
      JOIN notes n ON n.id = t.note_id
      WHERE n.archived_at IS NULL
      ORDER BY t.tag ASC
    `).all()
  }

  function tree({ prefix = '', tagMatcher = null } = {}) {
    const nodes = new Map()
    function ensure(path) {
      if (!nodes.has(path)) {
        nodes.set(path, {
          tag: path,
          name: path.split('/').pop(),
          directNotes: new Set(),
          subtreeNotes: new Set(),
          children: []
        })
      }
      return nodes.get(path)
    }

    const rows = tagRows()
    let allowedNoteIds = null
    if (tagMatcher && !tagMatcher.isUnrestricted) {
      const noteTagsMap = new Map()
      for (const row of rows) {
        if (!noteTagsMap.has(row.noteId)) noteTagsMap.set(row.noteId, [])
        noteTagsMap.get(row.noteId).push(row.tag)
      }
      allowedNoteIds = new Set()
      for (const [noteId, noteTags] of noteTagsMap) {
        if (tagMatcher.isAllowed(noteTags)) {
          allowedNoteIds.add(noteId)
        }
      }
    }

    for (const row of rows) {
      if (allowedNoteIds && !allowedNoteIds.has(row.noteId)) continue
      if (prefix && !tagMatchesPrefix(row.tag, prefix)) continue
      for (const ancestor of tagAncestors(row.tag)) {
        const node = ensure(ancestor)
        node.subtreeNotes.add(row.noteId)
        if (ancestor === row.tag) node.directNotes.add(row.noteId)
      }
    }

    const roots = []
    for (const node of nodes.values()) {
      const slash = node.tag.lastIndexOf('/')
      if (slash === -1) roots.push(node)
      else {
        const parent = nodes.get(node.tag.slice(0, slash))
        if (parent) parent.children.push(node)
        else roots.push(node)
      }
    }

    const toDto = node => ({
      tag: node.tag,
      name: node.name,
      direct: node.directNotes.size,
      total: node.subtreeNotes.size,
      children: node.children.map(toDto)
    })

    const sortNodes = list => {
      list.sort((a, b) => a.tag.localeCompare(b.tag))
      for (const node of list) sortNodes(node.children)
      return list.map(toDto)
    }

    let activeNotes = 0
    let untagged = 0
    const activeNoteRows = db.prepare(`
      SELECT n.id, (SELECT group_concat(t.tag, ',') FROM note_tags t WHERE t.note_id = n.id) AS tags_csv
      FROM notes n
      WHERE n.archived_at IS NULL
    `).all()

    for (const row of activeNoteRows) {
      const nTags = row.tags_csv ? row.tags_csv.split(',').filter(Boolean) : []
      if (tagMatcher && !tagMatcher.isUnrestricted && !tagMatcher.isAllowed(nTags)) {
        continue
      }
      activeNotes++
      if (nTags.length === 0) untagged++
    }

    return {
      tags: sortNodes(roots),
      totalNotes: activeNotes,
      untaggedCount: untagged
    }
  }

  function noteIdsForTag(tag, { exact = false } = {}) {
    const wanted = normalizeTag(tag)
    if (!wanted) return null
    const ids = new Set()
    const tagRows = db.prepare(`
      SELECT t.note_id AS noteId, t.tag AS tag
      FROM note_tags t
      JOIN notes n ON n.id = t.note_id
      WHERE n.archived_at IS NULL
    `).all()
    for (const row of tagRows) {
      if (tagMatchesPrefix(row.tag, wanted, { exact })) ids.add(row.noteId)
    }
    return ids
  }

  function deleteNote(noteId) {
    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
  }

  /**
   * Rewrite one tag path to another across the `tags` property of every
   * affected note. Exact-path semantics: renaming `area/project` touches
   * `area/project` and `area/project/*`, never `area/projector`.
   *
   * Returns the ids of the notes changed. Archived notes are skipped and
   * reported so callers can surface them.
   */
  function rewritePath({ from, to, actor = 'ui', message = null }) {
    const source = normalizeTag(from)
    if (!source) throw new Error('A source tag path is required')
    const target = to === null || to === undefined ? null : normalizeTag(to)
    if (target !== null && !target) throw new Error('A target tag path is required')

    const rows = db.prepare(`
      SELECT t.note_id AS noteId, n.archived_at AS archivedAt
      FROM note_tags t
      JOIN notes n ON n.id = t.note_id
      WHERE t.tag = ? OR t.tag LIKE ?
    `).all(source, `${source}/%`)

    const byNote = new Map()
    for (const row of rows) {
      if (!byNote.has(row.noteId)) byNote.set(row.noteId, row.archivedAt || null)
    }

    const changed = []
    const skipped = []
    for (const [noteId, archivedAt] of byNote) {
      if (archivedAt) {
        skipped.push({ noteId, reason: 'note_archived' })
        continue
      }
      const current = tagsForNote(noteId)
      const next = current.map(tag => {
        if (tag === source) return target
        if (tag.startsWith(`${source}/`)) {
          return target === null ? null : `${target}${tag.slice(source.length)}`
        }
        return tag
      }).filter(Boolean)

      // Write through the same property path the editor uses.
      setNoteTags(noteId, next, {
        actor,
        message: message || (target === null
          ? `tag delete: ${source}`
          : `tag rename: ${source} → ${target}`)
      })
      changed.push(noteId)
    }

    return { from: source, to: target, changed, skipped }
  }

  /**
   * Apply a tag list to a note's `tags` property via the revision service, so
   * the change is a `source: 'property'` revision like any other metadata edit.
   * Wired at construction to avoid a service cycle.
   */
  let applyNoteTags = null
  function setApplyNoteTags(fn) {
    applyNoteTags = fn
  }

  function setNoteTags(noteId, nextTags, { actor = 'ui', message = null } = {}) {
    if (!applyNoteTags) throw new Error('Tag rewriting is not wired to the revision service')
    return applyNoteTags(noteId, nextTags, { actor, message })
  }

  return {
    syncNote,
    tagsForNote,
    tagsByNote,
    tree,
    noteIdsForTag,
    deleteNote,
    rewritePath,
    setApplyNoteTags
  }
}
