import test from 'node:test'
import fs from 'fs'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'
import { chunkText } from '../src/server/embeddings/chunk.js'
import { createEmbeddingService } from '../src/server/services/embeddings.js'
import { encryptSecret, decryptSecret } from '../src/server/embeddings/secrets.js'

function fakeClientFactory() {
  return {
    async probe() { return { dimensions: 3, latencyMs: 1 } },
    async embed(texts) {
      return texts.map(text => {
        const value = String(text).toLowerCase()
        if (value.includes('alpha')) return [1, 0, 0]
        if (value.includes('beta')) return [0, 1, 0]
        return [0, 0, 1]
      })
    }
  }
}

test('chunkText keeps paragraphs and splits long content with overlap', () => {
  const short = chunkText('First paragraph.\n\nSecond paragraph.', {
    maxChars: 200,
    overlapChars: 20
  })
  assert.equal(short.length, 1)
  assert.match(short[0].content, /First paragraph/)
  assert.match(short[0].content, /Second paragraph/)

  const long = 'word '.repeat(300)
  const chunks = chunkText(long, { maxChars: 200, overlapChars: 40 })
  assert.equal(chunks.length > 1, true)
  assert.equal(chunks.every(chunk => chunk.content.length <= 200), true)
  assert.equal(chunks.every(chunk => chunk.content.length > 0), true)
  assert.deepEqual(chunkText(''), [])
})

test('embedding config is encrypted and model names reuse their own tables', async () => {
  const ctx = createFreshContext()
  try {
    const service = createEmbeddingService({
      db: ctx.db,
      dataDir: ctx.dir,
      tags: ctx.tags,
      clientFactory: fakeClientFactory,
      autoIndex: false
    })
    assert.equal(service.loadVec(), true)

    const alpha = ctx.notes.createNote({ title: 'Alpha', content: 'alpha project notes' })
    ctx.notes.createNote({ title: 'Beta', content: 'beta project notes' })

    const saved = await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key',
      model: 'fake-embedding-3d',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })
    assert.equal(saved.settings.enabled, true)
    assert.equal(saved.settings.hasApiKey, true)
    assert.equal(saved.settings.apiKeyMasked, '••••••••')
    assert.equal(saved.settings.dimensions, 3)

    const row = ctx.db.prepare('SELECT * FROM embedding_settings WHERE id = 1').get()
    assert.notEqual(row.api_key_encrypted, 'secret-key')
    assert.equal(decryptSecret(serviceSecret(ctx), row.api_key_encrypted), 'secret-key')

    await service.indexNoteNow(alpha.id, { force: true })
    const matches = await service.searchMatches({ query: 'alpha', limit: 5 })
    assert.equal(matches.results.some(match => match.noteId === alpha.id), true)

    const firstTable = ctx.db.prepare(
      'SELECT table_key FROM embedding_models WHERE model = ?'
    ).get('fake-embedding-3d').table_key

    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: '',
      model: 'fake-embedding-3d-v2',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })
    await service.indexNoteNow(alpha.id, { force: true })
    const models = ctx.db.prepare('SELECT model, table_key FROM embedding_models ORDER BY model').all()
    assert.equal(models.length, 2)
    assert.notEqual(models[0].table_key, models[1].table_key)

    // Switch back to the original model and reuse its original table/data.
    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: '',
      model: 'fake-embedding-3d',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })
    const reused = await service.searchMatches({ query: 'alpha', limit: 5 })
    assert.equal(reused.model, 'fake-embedding-3d')
    assert.equal(reused.results.some(match => match.noteId === alpha.id), true)
    const reuseRow = ctx.db.prepare(
      'SELECT table_key FROM embedding_models WHERE model = ?'
    ).get('fake-embedding-3d')
    assert.equal(reuseRow.table_key, firstTable)
  } finally {
    ctx.cleanup()
  }
})

test('embedding secrets round-trip and reject tampering', () => {
  const encrypted = encryptSecret('server-secret', 'api-key-value')
  assert.notEqual(encrypted, 'api-key-value')
  assert.equal(decryptSecret('server-secret', encrypted), 'api-key-value')
  assert.equal(decryptSecret('wrong-secret', encrypted), null)
})

function serviceSecret(ctx) {
  // The service reads the same dataDir secret through loadOrCreateSecret.
  // Reading it here keeps the encryption assertion independent of the service.
  return fs.readFileSync(`${ctx.dir}/server_secret`, 'utf8').trim()
}

test('rerank failure falls back to vector order', async () => {
  const ctx = createFreshContext()
  try {
    const service = createEmbeddingService({
      db: ctx.db,
      dataDir: ctx.dir,
      tags: ctx.tags,
      clientFactory: fakeClientFactory,
      rerankClientFactory: () => ({
        async probe() { return { latencyMs: 1, results: 2 } },
        async rerank() { throw new Error('rerank provider down') }
      }),
      autoIndex: false
    })
    const note = ctx.notes.createNote({ title: 'Alpha', content: 'alpha fallback note' })
    const other = ctx.notes.createNote({ title: 'Beta', content: 'beta other note' })
    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key',
      model: 'fake-rerank-fallback',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true,
      rerankEnabled: true,
      rerankBaseUrl: 'https://example.test/v1',
      rerankApiKey: 'rerank-key',
      rerankModel: 'fake-reranker'
    })
    await service.indexNoteNow(note.id, { force: true })
    await service.indexNoteNow(other.id, { force: true })
    const matches = await service.searchMatches({ query: 'alpha', limit: 5 })
    assert.equal(matches.rerank.enabled, true)
    assert.equal(matches.rerank.applied, false)
    assert.match(matches.rerank.error, /rerank provider down/)
    assert.equal(matches.results.some(match => match.noteId === note.id), true)
  } finally {
    ctx.cleanup()
  }
})

function variantClientFactory() {
  return {
    async probe() { return { dimensions: 3, latencyMs: 1 } },
    async embed(texts) {
      return texts.map(() => [1, 0, 0])
    }
  }
}

test('same model name with different dimensions gets a separate table', async () => {
  const ctx = createFreshContext()
  try {
    const service = createEmbeddingService({
      db: ctx.db,
      dataDir: ctx.dir,
      tags: ctx.tags,
      clientFactory: ({ dimensions }) => ({
        async probe() { return { dimensions: Number(dimensions), latencyMs: 1 } },
        async embed(texts) {
          return texts.map(() => Array(Number(dimensions)).fill(0))
        }
      }),
      autoIndex: false
    })

    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key',
      model: 'Qwen/Qwen3-Embedding-8B',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })
    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: '',
      model: 'Qwen/Qwen3-Embedding-8B',
      dimensions: 2,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })

    const models = ctx.db.prepare(
      'SELECT model, variant, dimensions, table_key FROM embedding_models ORDER BY dimensions'
    ).all()
    assert.equal(models.length, 2)
    assert.deepEqual(models.map(row => row.variant), ['2', '3'])
    assert.notEqual(models[0].table_key, models[1].table_key)
    assert.equal(service.settings().dimensions, 2)
    assert.equal(service.settings().variant, '2')
  } finally {
    ctx.cleanup()
  }
})

test('resetIndex drops embedding tables and model metadata without touching settings', async () => {
  const ctx = createFreshContext()
  try {
    const service = createEmbeddingService({
      db: ctx.db,
      dataDir: ctx.dir,
      tags: ctx.tags,
      clientFactory: variantClientFactory,
      autoIndex: false
    })
    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key',
      model: 'fake-reset-model',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      enabled: true
    })
    const result = service.resetIndex({ reindex: false })
    assert.ok(result.droppedTables >= 2)
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM embedding_models').get().count, 0)
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM embedding_index_state').get().count, 0)
    const remaining = ctx.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'embedding_chunks_%'
    `).all()
    assert.equal(remaining.length, 0)
  } finally {
    ctx.cleanup()
  }
})

test('embedding tuning is stored in SQLite and applies without restart', async () => {
  const ctx = createFreshContext()
  try {
    const service = createEmbeddingService({
      db: ctx.db,
      dataDir: ctx.dir,
      tags: ctx.tags,
      clientFactory: variantClientFactory,
      autoIndex: false
    })
    const initial = service.status().tuning
    assert.deepEqual(initial, {
      batchSize: 64,
      concurrency: 2,
      maxBatchChars: 80000,
      noteConcurrency: 1
    })

    await service.saveConfig({
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key',
      model: 'Qwen/Qwen3-Embedding-8B',
      dimensions: 3,
      chunkSize: 400,
      chunkOverlap: 40,
      batchSize: 8,
      concurrency: 1,
      maxBatchChars: 20000,
      noteConcurrency: 1,
      enabled: true
    })
    const updated = service.status().tuning
    assert.equal(updated.batchSize, 8)
    assert.equal(updated.concurrency, 1)
    assert.equal(updated.maxBatchChars, 20000)
    assert.equal(fs.existsSync(`${ctx.dir}/embedding-tuning.json`), false)
  } finally {
    ctx.cleanup()
  }
})
