import { parseWikiLinks, normalizeLinkTitle } from '../../shared/links.js'
import { tagMatchesPrefix } from '../../shared/tags.js'
import { extractCanvasText } from '../fts.js'

function snippet(content, raw) {
  const text = String(content || '')
  const index = text.indexOf(raw)
  if (index === -1) return ''
  const start = Math.max(0, index - 70)
  const end = Math.min(text.length, index + raw.length + 70)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function createLinkService({ db }) {
  const insertLink = db.prepare(`
    INSERT INTO note_links
      (source_note_id, source_revision_id, target_note_id, target_label,
       label, target_kind, raw, status, source, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, 'unresolved', 'inline', ?)
  `)

  function titleIndex() {
    const notes = db.prepare(
      'SELECT id, title, display_title, archived_at FROM notes'
    ).all()
    const byId = new Map(notes.map(n => [n.id, n]))
    const byTitle = new Map()
    for (const note of notes) {
      const keys = new Set()
      if (note.title) keys.add(normalizeLinkTitle(note.title))
      if (note.display_title) keys.add(normalizeLinkTitle(note.display_title))
      for (const key of keys) {
        if (!key) continue
        if (!byTitle.has(key)) byTitle.set(key, [])
        if (!byTitle.get(key).some(n => n.id === note.id)) byTitle.get(key).push(note)
      }
    }
    return { byId, byTitle }
  }

  function resolveRow(row, index) {
    if (row.target_kind === 'id') {
      const note = index.byId.get(row.target_label)
      if (!note) return { targetNoteId: null, status: 'unresolved' }
      return { targetNoteId: note.id, status: note.archived_at ? 'archived' : 'ok' }
    }
    const matches = index.byTitle.get(normalizeLinkTitle(row.target_label)) || []
    if (matches.length === 0) return { targetNoteId: null, status: 'unresolved' }
    if (matches.length > 1) return { targetNoteId: null, status: 'ambiguous' }
    const note = matches[0]
    return { targetNoteId: note.id, status: note.archived_at ? 'archived' : 'ok' }
  }

  function resolveAll() {
    const index = titleIndex()
    const rows = db.prepare('SELECT * FROM note_links').all()
    const update = db.prepare(
      'UPDATE note_links SET target_note_id = ?, status = ? WHERE id = ?'
    )
    for (const row of rows) {
      const resolved = resolveRow(row, index)
      update.run(resolved.targetNoteId, resolved.status, row.id)
    }
  }

  function syncNote(noteId, revisionId, content, canvasData) {
    db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId)
    const text = `${content || ''}\n${extractCanvasText(canvasData)}`
    const now = new Date().toISOString()
    for (const link of parseWikiLinks(text)) {
      insertLink.run(
        noteId,
        revisionId || '',
        link.target,
        link.label,
        link.kind,
        link.raw,
        now
      )
    }
    resolveAll()
  }

  function contextForRow(row) {
    const source = db.prepare('SELECT content FROM notes WHERE id = ?').get(row.source_note_id)
    return snippet(source?.content || '', row.raw)
  }

  function outgoing(noteId, { includeArchived = false } = {}) {
    const rows = db.prepare(`
      SELECT l.*, n.title AS target_title, n.type AS target_type,
             n.archived_at AS target_archived
      FROM note_links l
      LEFT JOIN notes n ON n.id = l.target_note_id
      WHERE l.source_note_id = ?
      ORDER BY l.id ASC
    `).all(noteId)
    return rows.map(row => ({
      id: row.id,
      sourceNoteId: row.source_note_id,
      targetNoteId: row.target_note_id,
      targetLabel: row.target_label,
      label: row.label,
      targetKind: row.target_kind,
      raw: row.raw,
      status: row.status,
      targetTitle: row.target_title || null,
      targetType: row.target_type || null,
      context: contextForRow(row)
    }))
  }

  function backlinks(noteId, { includeArchived = false } = {}) {
    const rows = db.prepare(`
      SELECT l.*, n.title AS source_title, n.display_title AS source_display_title,
             n.type AS source_type, n.archived_at AS source_archived,
             n.updatedAt AS source_updated_at, n.content AS source_content
      FROM note_links l
      JOIN notes n ON n.id = l.source_note_id
      WHERE l.target_note_id = ?
      ORDER BY n.updatedAt DESC
    `).all(noteId)
    return rows
      .filter(row => includeArchived || !row.source_archived)
      .map(row => ({
        id: row.id,
        sourceNoteId: row.source_note_id,
        sourceTitle: row.source_title,
        sourceDisplayTitle: row.source_display_title,
        sourceType: row.source_type,
        sourceUpdatedAt: row.source_updated_at,
        targetNoteId: noteId,
        targetLabel: row.target_label,
        label: row.label,
        raw: row.raw,
        status: row.status,
        context: snippet(row.source_content || '', row.raw)
      }))
  }

  function chunk(ids, size = 400) {
    const chunks = []
    for (let index = 0; index < ids.length; index += size) {
      chunks.push(ids.slice(index, index + size))
    }
    return chunks
  }

  function summary(noteIds, { includeArchived = false } = {}) {
    const ids = [...new Set(
      (Array.isArray(noteIds) ? noteIds : []).filter(id => typeof id === 'string' && id)
    )]
    const outgoingByKey = new Map()
    const incomingBySource = new Map()
    if (ids.length === 0) return { noteIds: [], outgoing: [], incoming: [] }

    for (const group of chunk(ids)) {
      const placeholders = group.map(() => '?').join(',')

      const outRows = db.prepare(`
        SELECT l.*, s.title AS source_title, s.display_title AS source_display_title,
               s.content AS source_content,
               t.title AS target_title, t.display_title AS target_display_title,
               t.type AS target_type, t.archived_at AS target_archived
        FROM note_links l
        JOIN notes s ON s.id = l.source_note_id
        LEFT JOIN notes t ON t.id = l.target_note_id
        WHERE l.source_note_id IN (${placeholders})
        ORDER BY s.updatedAt DESC, l.id ASC
      `).all(...group)

      for (const row of outRows) {
        const key = row.target_note_id
          ? `note:${row.target_note_id}`
          : `label:${row.status}:${normalizeLinkTitle(row.target_label)}`
        let entry = outgoingByKey.get(key)
        if (!entry) {
          entry = {
            targetNoteId: row.target_note_id || null,
            title: row.target_title || row.target_label,
            displayTitle: row.target_display_title || null,
            type: row.target_type || 'unresolved',
            status: row.status,
            archived: !!row.target_archived,
            links: []
          }
          outgoingByKey.set(key, entry)
        }
        entry.links.push({
          sourceNoteId: row.source_note_id,
          sourceTitle: row.source_title,
          sourceDisplayTitle: row.source_display_title,
          label: row.label,
          raw: row.raw,
          status: row.status,
          context: snippet(row.source_content || '', row.raw)
        })
      }

      const inRows = db.prepare(`
        SELECT l.*, s.title AS source_title, s.display_title AS source_display_title,
               s.type AS source_type, s.archived_at AS source_archived,
               s.updatedAt AS source_updated_at, s.content AS source_content
        FROM note_links l
        JOIN notes s ON s.id = l.source_note_id
        WHERE l.target_note_id IN (${placeholders})
        ORDER BY s.updatedAt DESC, l.id ASC
      `).all(...group)

      for (const row of inRows) {
        if (!includeArchived && row.source_archived) continue
        let entry = incomingBySource.get(row.source_note_id)
        if (!entry) {
          entry = {
            sourceNoteId: row.source_note_id,
            sourceTitle: row.source_title,
            sourceDisplayTitle: row.source_display_title,
            sourceType: row.source_type,
            sourceUpdatedAt: row.source_updated_at,
            archived: !!row.source_archived,
            links: []
          }
          incomingBySource.set(row.source_note_id, entry)
        }
        entry.links.push({
          targetNoteId: row.target_note_id,
          label: row.label,
          raw: row.raw,
          status: row.status,
          context: snippet(row.source_content || '', row.raw)
        })
      }
    }

    return {
      noteIds: ids,
      outgoing: [...outgoingByKey.values()],
      incoming: [...incomingBySource.values()]
    }
  }

  function countsByNote(noteIds) {
    const result = new Map()
    const ids = [...new Set(noteIds)].filter(Boolean)
    for (const id of ids) result.set(id, { links: 0, backlinks: 0 })
    if (ids.length === 0) return result
    const placeholders = ids.map(() => '?').join(',')
    const outRows = db.prepare(`
      SELECT source_note_id AS noteId, COUNT(*) AS count
      FROM note_links
      WHERE source_note_id IN (${placeholders})
        AND status IN ('ok', 'archived', 'ambiguous', 'unresolved')
      GROUP BY source_note_id
    `).all(...ids)
    const inRows = db.prepare(`
      SELECT target_note_id AS noteId, COUNT(*) AS count
      FROM note_links
      WHERE target_note_id IN (${placeholders}) AND status IN ('ok', 'archived')
      GROUP BY target_note_id
    `).all(...ids)
    for (const row of outRows) result.get(row.noteId).links = row.count
    for (const row of inRows) result.get(row.noteId).backlinks = row.count
    return result
  }

  function graph({ noteId = null, depth = 1, tag = null, limit = 300, includeUnresolved = false } = {}) {
    const active = db.prepare(`
      SELECT id, title, display_title, type, updatedAt, archived_at
      FROM notes WHERE archived_at IS NULL
    `).all()

    let tagIds = null
    if (tag) {
      tagIds = new Set()
      const tagRows = db.prepare(`
        SELECT note_id AS noteId, tag AS tag FROM note_tags
      `).all()
      for (const row of tagRows) {
        if (tagMatchesPrefix(row.tag, tag)) tagIds.add(row.noteId)
      }
    }

    const edgeRows = db.prepare(`
      SELECT l.*, s.archived_at AS source_archived, t.archived_at AS target_archived
      FROM note_links l
      JOIN notes s ON s.id = l.source_note_id
      JOIN notes t ON t.id = l.target_note_id
      WHERE l.status = 'ok'
    `).all()

    const adjacency = new Map()
    for (const edge of edgeRows) {
      if (!adjacency.has(edge.source_note_id)) adjacency.set(edge.source_note_id, new Set())
      if (!adjacency.has(edge.target_note_id)) adjacency.set(edge.target_note_id, new Set())
      adjacency.get(edge.source_note_id).add(edge.target_note_id)
      adjacency.get(edge.target_note_id).add(edge.source_note_id)
    }

    let nodeIds = null
    if (noteId) {
      const start = active.find(n => n.id === noteId)
      if (!start) return { nodes: [], edges: [], center: noteId }
      nodeIds = new Set([noteId])
      let frontier = [noteId]
      const maxDepth = Math.max(1, Math.min(3, Number(depth) || 1))
      for (let d = 0; d < maxDepth; d++) {
        const next = []
        for (const id of frontier) {
          for (const neighbour of adjacency.get(id) || []) {
            if (!nodeIds.has(neighbour)) {
              nodeIds.add(neighbour)
              next.push(neighbour)
            }
          }
        }
        frontier = next
        if (frontier.length === 0) break
      }
    }

    let nodes = active.filter(note => {
      if (nodeIds && !nodeIds.has(note.id)) return false
      if (tagIds && !tagIds.has(note.id)) return false
      return true
    }).slice(0, Math.max(1, Math.min(1000, Number(limit) || 300)))

    const nodeIdSet = new Set(nodes.map(n => n.id))
    const edges = edgeRows
      .filter(edge => nodeIdSet.has(edge.source_note_id) && nodeIdSet.has(edge.target_note_id))
      .map(edge => ({
        source: edge.source_note_id,
        target: edge.target_note_id,
        label: edge.label || edge.target_label,
        raw: edge.raw,
        status: edge.status
      }))

    if (includeUnresolved) {
      const unresolved = db.prepare(`
        SELECT * FROM note_links WHERE status IN ('unresolved', 'ambiguous')
      `).all()
      for (const row of unresolved) {
        if (!nodeIdSet.has(row.source_note_id)) continue
        const id = `unresolved:${row.target_label}`
        if (!nodeIdSet.has(id)) {
          nodes.push({
            id,
            title: row.target_label,
            display_title: row.target_label,
            type: 'unresolved',
            updatedAt: row.created_at,
            archived_at: null,
            unresolved: true
          })
          nodeIdSet.add(id)
        }
        edges.push({
          source: row.source_note_id,
          target: id,
          label: row.label || row.target_label,
          raw: row.raw,
          status: row.status
        })
      }
    }

    const tagsByNote = new Map()
    if (nodes.length > 0) {
      const ids = nodes.map(n => n.id).filter(id => !String(id).startsWith('unresolved:'))
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',')
        const rows = db.prepare(
          `SELECT note_id, tag FROM note_tags WHERE note_id IN (${placeholders})`
        ).all(...ids)
        for (const id of ids) tagsByNote.set(id, [])
        for (const row of rows) tagsByNote.get(row.note_id).push(row.tag)
      }
    }

    return {
      center: noteId || null,
      nodes: nodes.map(note => ({
        id: note.id,
        title: note.title,
        displayTitle: note.display_title,
        type: note.type,
        updatedAt: note.updatedAt,
        archived: !!note.archived_at,
        unresolved: !!note.unresolved,
        tags: tagsByNote.get(note.id) || []
      })),
      edges
    }
  }

  function deleteNote(noteId) {
    db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId)
  }

  return {
    syncNote,
    resolveAll,
    outgoing,
    backlinks,
    summary,
    countsByNote,
    graph,
    deleteNote
  }
}
