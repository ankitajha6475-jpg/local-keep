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

export function createSearchService({ db, notes, revisions, tags, renders, embeddings }) {
  function enrich(noteId, { snippet = '', score = 0, semanticScore = null, rerankScore = null, chunkIndex = null } = {}) {
    try {
      const note = notes.getNote(noteId)
      const headRevision = revisions.getRevision(note.revisionId)
      const render = note.type === 'canvas' ? renders.latest(note.id) : null
      return {
        note_id: note.id,
        revision_id: note.revisionId,
        title: note.title || '',
        display_title: note.displayTitle,
        type: note.type,
        snippet,
        tags: note.tags || [],
        created_at: note.createdAt,
        updated_at: note.updatedAt,
        archived_at: note.archivedAt || null,
        is_archived: !!note.archivedAt,
        revision_created_at: headRevision?.created_at || note.updatedAt,
        revision_no: note.revisionNo || 1,
        score,
        ...(semanticScore != null ? { semantic_score: semanticScore } : {}),
        ...(rerankScore != null ? { rerank_score: rerankScore, score: rerankScore } : {}),
        ...(chunkIndex != null ? { chunk_index: chunkIndex } : {}),
        link_count: note.linkCount || 0,
        backlink_count: note.backlinkCount || 0,
        ...(render ? {
          tile_count: render.tileCount || 0,
          rendered_at: render.renderedAt,
          stale: render.stale
        } : {})
      }
    } catch (_) {
      return null
    }
  }

  function keywordSearch({
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
    const results = page.map(row => enrich(row.note_id, {
      snippet: row.snippet || '',
      score: row.score ?? 0
    })).filter(Boolean)

    return { query: raw, mode: 'keyword', results, total, limit, offset: start }
  }

  async function semanticSearch({
    query = '',
    tags: tagList = [],
    tagMode = 'any',
    type = null,
    includeArchived = false,
    limit = 20,
    offset = 0
  } = {}) {
    if (!embeddings) {
      const error = new Error('Semantic search is not configured')
      error.status = 400
      error.code = 'embedding_disabled'
      throw error
    }
    const data = await embeddings.searchMatches({
      query,
      limit,
      tags: normalizeTagList(tagList),
      tagMode,
      type,
      includeArchived
    })
    const start = Math.max(0, Number(offset) || 0)
    const page = data.results.slice(start, start + Math.max(1, Math.min(100, Number(limit) || 20)))
    const results = page.map(match => enrich(match.noteId, {
      snippet: match.snippet,
      score: match.rerankScore ?? match.similarity,
      semanticScore: match.similarity,
      rerankScore: match.rerankScore,
      chunkIndex: match.chunkIndex
    })).filter(Boolean)
    return {
      query: String(query || '').trim(),
      mode: 'semantic',
      model: data.model,
      rerank: data.rerank || null,
      results,
      total: data.results.length,
      limit,
      offset: start
    }
  }

  async function hybridSearch(args = {}) {
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 20))
    const offset = Math.max(0, Number(args.offset) || 0)
    const keyword = keywordSearch({ ...args, limit: Math.max(limit * 2, 30), offset: 0 })
    let semantic
    try {
      semantic = await semanticSearch({ ...args, limit: Math.max(limit * 2, 30), offset: 0 })
    } catch (error) {
      return {
        ...keyword,
        mode: 'hybrid',
        notice: `Semantic search unavailable: ${error.message}`
      }
    }

    const scores = new Map()
    const byId = new Map()
    keyword.results.forEach((result, index) => {
      byId.set(result.note_id, { ...result, keyword_score: result.score })
      scores.set(result.note_id, (scores.get(result.note_id) || 0) + 1 / (60 + index + 1))
    })
    semantic.results.forEach((result, index) => {
      const existing = byId.get(result.note_id)
      byId.set(result.note_id, {
        ...(existing || result),
        semantic_score: result.semantic_score,
        ...(result.rerank_score != null ? { rerank_score: result.rerank_score } : {}),
        snippet: result.snippet || existing?.snippet || '',
        score: result.rerank_score ?? existing?.score ?? result.score
      })
      scores.set(result.note_id, (scores.get(result.note_id) || 0) + 1 / (60 + index + 1))
    })

    const merged = [...byId.values()]
      .map(result => ({ ...result, rrf_score: scores.get(result.note_id) || 0 }))
      .sort((a, b) => b.rrf_score - a.rrf_score)
    const page = merged.slice(offset, offset + limit)
    return {
      query: String(args.query || '').trim(),
      mode: 'hybrid',
      model: semantic.model,
      rerank: semantic.rerank || null,
      semantic_count: semantic.results.length,
      keyword_count: keyword.results.length,
      results: page,
      total: merged.length,
      limit,
      offset
    }
  }

  async function search(args = {}) {
    const mode = args.mode || 'keyword'
    if (mode === 'semantic') return semanticSearch(args)
    if (mode === 'hybrid') return hybridSearch(args)
    return keywordSearch(args)
  }

  return { search, keywordSearch, semanticSearch, hybridSearch }
}
