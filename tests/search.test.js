import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'
import { createSearchService } from '../src/server/services/search.js'

function makeEmbeddings({ alphaId, betaId, fail = false } = {}) {
  return {
    async searchMatches({ query }) {
      if (fail) throw new Error('embedding provider down')
      const results = [
        { noteId: betaId, similarity: 0.92, snippet: 'beta semantic hit', chunkIndex: 0 },
        { noteId: alphaId, similarity: 0.81, snippet: 'alpha semantic hit', chunkIndex: 0 }
      ]
      return { model: 'fake-embedding', rerank: null, results }
    }
  }
}

function buildSearch(ctx, embeddings) {
  return createSearchService({
    db: ctx.db,
    notes: ctx.notes,
    revisions: ctx.revisions,
    tags: ctx.tags,
    renders: ctx.renders,
    embeddings
  })
}

test('hybrid search preserves RRF ranking across keyword and semantic lists', async () => {
  const ctx = createFreshContext()
  try {
    const alpha = ctx.notes.createNote({ title: 'Alpha', content: 'alpha keyword only' })
    const beta = ctx.notes.createNote({ title: 'Beta', content: 'beta semantic only' })
    ctx.notes.createNote({ title: 'Gamma', content: 'gamma unrelated' })

    const search = buildSearch(ctx, makeEmbeddings({ alphaId: alpha.id, betaId: beta.id }))

    const keyword = await search.search({ query: 'alpha', mode: 'keyword' })
    assert.deepEqual(keyword.results.map(result => result.note_id), [alpha.id])

    const semantic = await search.search({ query: 'concept', mode: 'semantic' })
    assert.deepEqual(semantic.results.map(result => result.note_id).slice(0, 2), [beta.id, alpha.id])
    assert.equal(semantic.results[0].semantic_score, 0.92)

    const hybrid = await search.search({ query: 'alpha', mode: 'hybrid' })
    assert.equal(hybrid.mode, 'hybrid')
    assert.equal(hybrid.semantic_count, 2)
    assert.equal(hybrid.keyword_count, 1)
    assert.deepEqual(hybrid.results.map(result => result.note_id).slice(0, 2), [alpha.id, beta.id])
    assert.equal(hybrid.results[0].rrf_score > hybrid.results[1].rrf_score, true)

    // A query with no lexical match still ranks by vector similarity.
    const semanticOnly = await search.search({ query: 'concept', mode: 'hybrid' })
    assert.deepEqual(semanticOnly.results.map(result => result.note_id).slice(0, 2), [beta.id, alpha.id])
  } finally {
    ctx.cleanup()
  }
})

test('hybrid search falls back to keyword results when embeddings fail', async () => {
  const ctx = createFreshContext()
  try {
    const alpha = ctx.notes.createNote({ title: 'Alpha', content: 'alpha keyword only' })
    const beta = ctx.notes.createNote({ title: 'Beta', content: 'beta semantic only' })

    const search = buildSearch(ctx, makeEmbeddings({
      alphaId: alpha.id,
      betaId: beta.id,
      fail: true
    }))
    const hybrid = await search.search({ query: 'alpha', mode: 'hybrid' })
    assert.equal(hybrid.mode, 'hybrid')
    assert.match(hybrid.notice, /embedding provider down/)
    assert.deepEqual(hybrid.results.map(result => result.note_id), [alpha.id])
  } finally {
    ctx.cleanup()
  }
})
