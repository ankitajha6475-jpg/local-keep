import { parseTags, normalizeTag, tagAncestors, tagMatchesPrefix } from '../../shared/tags.js'
import { extractCanvasText } from '../fts.js'

export function createTagService({ db }) {
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO note_tags (note_id, tag, source, created_at)
    VALUES (?, ?, 'inline', ?)
  `)

  function syncNote(noteId, content, canvasData) {
    db.prepare("DELETE FROM note_tags WHERE note_id = ? AND source = 'inline'").run(noteId)
    const text = `${content || ''}\n${extractCanvasText(canvasData)}`
    const now = new Date().toISOString()
    for (const tag of parseTags(text)) insertTag.run(noteId, tag, now)
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

  function tree({ prefix = '' } = {}) {
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

    for (const row of tagRows()) {
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

    const activeNotes = db.prepare(
      'SELECT COUNT(*) AS count FROM notes WHERE archived_at IS NULL'
    ).get().count
    const untagged = db.prepare(`
      SELECT COUNT(*) AS count
      FROM notes n
      WHERE n.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id)
    `).get().count

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

  return {
    syncNote,
    tagsForNote,
    tagsByNote,
    tree,
    noteIdsForTag,
    deleteNote
  }
}
