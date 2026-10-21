function sanitizeFtsQuery(raw) {
  const tokens = String(raw || '')
    .replace(/["'*^()+\-~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => `"${token}"*`)
  return tokens.join(' ')
}

function normalizeTagList(tags) {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean)
  return String(tags).split(',').map(t => t.trim()).filter(Boolean)
}

export function createSearchService({ db, notes, revisions, tags, renders }) {
  function search({
    query = '',
    tags: tagList = [],
    tagMode = 'any',
    type = null,
    createdAfter = null,
    createdBefore = null,
    updatedAfter = null,
    updatedBefore = null,
    includeArchived = false,
    limit = 20,
    offset = 0
  } = {}) {
    const raw = String(query || '').trim()
    const fts = sanitizeFtsQuery(raw)
    const where = []
    const params = []

    if (!includeArchived) where.push('n.archived_at IS NULL')
    if (type) { where.push('n.type = ?'); params.push(type) }
    if (createdAfter) { where.push('n.createdAt >= ?'); params.push(createdAfter) }
    if (createdBefore) { where.push('n.createdAt <= ?'); params.push(createdBefore) }
    if (updatedAfter) { where.push('n.updatedAt >= ?'); params.push(updatedAfter) }
    if (updatedBefore) { where.push('n.updatedAt <= ?'); params.push(updatedBefore) }

    let rows
    if (fts) {
      const sql = `
        SELECT f.note_id AS note_id,
               snippet(notes_fts, 2, '[', ']', '…', 20) AS snippet,
               bm25(notes_fts) AS score
        FROM notes_fts f
        JOIN notes n ON n.id = f.note_id
        WHERE notes_fts MATCH ?
        ${where.length ? 'AND ' + where.join(' AND ') : ''}
        ORDER BY rank
        LIMIT 500
      `
      rows = db.prepare(sql).all(fts, ...params)
    } else {
      const sql = `
        SELECT n.id AS note_id, '' AS snippet, 0 AS score
        FROM notes n
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY n.updatedAt DESC
        LIMIT 500
      `
      rows = db.prepare(sql).all(...params)
    }

    const wantedTags = normalizeTagList(tagList)
    if (wantedTags.length > 0) {
      const sets = wantedTags.map(tag => tags.noteIdsForTag(tag))
      let tagIds
      if (tagMode === 'all') {
        tagIds = new Set(sets[0] || [])
        for (const set of sets.slice(1)) {
          for (const id of [...tagIds]) {
            if (!set?.has(id)) tagIds.delete(id)
          }
        }
      } else {
        tagIds = new Set()
        for (const set of sets) {
          for (const id of set || []) tagIds.add(id)
        }
      }
      rows = rows.filter(row => tagIds.has(row.note_id))
    }

    const total = rows.length
    const start = Math.max(0, Number(offset) || 0)
    const page = rows.slice(start, start + Math.max(1, Math.min(100, Number(limit) || 20)))

    const results = page.map(row => {
      const note = notes.getNote(row.note_id)
      const headRevision = revisions.getRevision(note.revisionId)
      const render = note.type === 'canvas' ? renders.latest(note.id) : null
      return {
        note_id: note.id,
        revision_id: note.revisionId,
        title: note.title || '',
        display_title: note.displayTitle,
        type: note.type,
        snippet: row.snippet || '',
        tags: note.tags || [],
        created_at: note.createdAt,
        updated_at: note.updatedAt,
        revision_created_at: headRevision?.created_at || note.updatedAt,
        revision_no: note.revisionNo || 1,
        score: row.score ?? 0,
        link_count: note.linkCount || 0,
        backlink_count: note.backlinkCount || 0,
        ...(render ? {
          tile_count: render.tileCount || 0,
          rendered_at: render.renderedAt,
          stale: render.stale
        } : {})
      }
    })

    return { query: raw, results, total, limit, offset: start }
  }

  return { search }
}
