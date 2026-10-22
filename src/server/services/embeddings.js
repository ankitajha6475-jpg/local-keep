import crypto from 'crypto'
import path from 'path'
import { getLoadablePath } from 'sqlite-vec'
import { loadOrCreateSecret } from '../secret.js'
import { encryptSecret, decryptSecret } from '../embeddings/secrets.js'
import { createEmbeddingClient } from '../embeddings/client.js'
import { createRerankClient } from '../embeddings/rerankClient.js'
import { chunkText } from '../embeddings/chunk.js'
import { extractCanvasText } from '../fts.js'
import { markdownToText } from '../../shared/notesText.js'

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function fail(status, message, code = 'embedding_error') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function tableKeyFor(model, variant) {
  return `emb_${hash(`${model}\0${variant}`).slice(0, 16)}`
}

function variantFor(dimensions) {
  return String(Number(dimensions))
}

function defaultDimensionsForModel(model) {
  const name = String(model || '')
  if (!/^Qwen\/Qwen3-Embedding/i.test(name)) return null
  if (/8B/i.test(name)) return 4096
  if (/4B/i.test(name)) return 2560
  if (/0\.6B/i.test(name)) return 1024
  return 4096
}

function supportsDimensions(model) {
  return /^Qwen\/Qwen3-Embedding/i.test(String(model || ''))
}

const QWEN3_RETRIEVAL_INSTRUCTION =
  'Given a web search query, retrieve relevant passages that answer the query'

// Qwen3-Embedding is instruction-aware: queries use the retrieval instruction,
// documents do not. Without it, short queries (especially Chinese) collapse
// onto generic notes and the ranking looks random.
function embeddingQueryInput(model, text) {
  const value = String(text || '')
  if (!/Qwen3-Embedding/i.test(String(model || ''))) return value
  if (/^\s*Instruct:/i.test(value)) return value
  return `Instruct: ${QWEN3_RETRIEVAL_INSTRUCTION}\nQuery: ${value}`
}

function safeKey(value) {
  if (!/^emb_[a-f0-9]{16}$/.test(String(value || ''))) {
    throw new Error('Invalid embedding table key')
  }
  return value
}

function noteText(row) {
  const markdown = markdownToText(row.content || '')
  const canvas = extractCanvasText(row.canvas_data || row.canvasData)
  return `${markdown}\n\n${canvas}`.trim()
}

function noteHash(row, text, chunkSize, chunkOverlap) {
  return hash(`${row.title || ''}\n${text}\n${chunkSize}\n${chunkOverlap}`)
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '')
  if (!text) throw fail(400, 'Embedding base URL is required', 'invalid_base_url')
  let url
  try { url = new URL(text) } catch (_) { throw fail(400, 'Embedding base URL is invalid', 'invalid_base_url') }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw fail(400, 'Embedding base URL must use http or https', 'invalid_base_url')
  }
  return text
}

function maskKey(encrypted) {
  return encrypted ? '••••••••' : ''
}

export function createEmbeddingService({
  db,
  dataDir,
  tags,
  clientFactory = createEmbeddingClient,
  rerankClientFactory = createRerankClient,
  fetchImpl,
  autoIndex = true
}) {
  const SECRET = loadOrCreateSecret(path.join(dataDir, 'server_secret'))
  const queue = new Map() // noteId -> force
  const stats = { indexed: 0, failed: 0, lastError: null }
  let vecLoaded = false
  let vecVersion = null
  let vecError = null
  let workerRunning = false
  let workerTimer = null
  let currentNote = null
  const runningNotes = new Set()

  function settingsRow() {
    const row = db.prepare('SELECT * FROM embedding_settings WHERE id = 1').get()
    if (!row) throw new Error('Embedding settings are missing')
    return row
  }

  function tuningFrom(row = settingsRow()) {
    const clamp = (value, min, max, fallback) => {
      const number = Number(value)
      if (!Number.isFinite(number)) return fallback
      return Math.max(min, Math.min(max, Math.round(number)))
    }
    return {
      batchSize: clamp(row.batch_size, 1, 128, 64),
      concurrency: clamp(row.concurrency, 1, 8, 2),
      maxBatchChars: clamp(row.max_batch_chars, 1_000, 1_000_000, 80_000),
      noteConcurrency: clamp(row.note_concurrency, 1, 8, 1)
    }
  }

  function modelRow(model, variant) {
    return db.prepare('SELECT * FROM embedding_models WHERE model = ? AND variant = ?')
      .get(model, variantFor(variant))
  }

  function listModels() {
    return db.prepare('SELECT * FROM embedding_models ORDER BY created_at DESC').all().map(row => ({
      model: row.model,
      variant: row.variant,
      dimensions: row.dimensions,
      baseUrl: row.base_url,
      chunkCount: row.chunk_count,
      status: row.status,
      lastIndexedAt: row.last_indexed_at,
      lastError: row.last_error,
      createdAt: row.created_at
    }))
  }

  function settingsDto(row = settingsRow()) {
    return {
      enabled: !!row.enabled,
      baseUrl: row.base_url,
      apiKeyMasked: maskKey(row.api_key_encrypted),
      hasApiKey: !!row.api_key_encrypted,
      model: row.model,
      variant: row.dimensions ? variantFor(row.dimensions) : null,
      dimensions: row.dimensions,
      batchSize: tuningFrom(row).batchSize,
      concurrency: tuningFrom(row).concurrency,
      maxBatchChars: tuningFrom(row).maxBatchChars,
      noteConcurrency: tuningFrom(row).noteConcurrency,
      chunkSize: row.chunk_size,
      chunkOverlap: row.chunk_overlap,
      lastTestedAt: row.last_tested_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
      rerankEnabled: !!row.rerank_enabled,
      rerankBaseUrl: row.rerank_base_url || '',
      rerankHasApiKey: !!row.rerank_api_key_encrypted,
      rerankUsesEmbeddingKey: !row.rerank_api_key_encrypted && !!row.api_key_encrypted,
      rerankModel: row.rerank_model || ''
    }
  }

  function loadVec() {
    if (vecLoaded) return true
    try {
      db.loadExtension(getLoadablePath())
      const row = db.prepare('SELECT vec_version() AS version').get()
      vecVersion = row?.version || null
      vecLoaded = true
      vecError = null
      return true
    } catch (error) {
      vecError = error.message
      return false
    }
  }

  function requireVec() {
    if (!loadVec()) {
      throw fail(500, `sqlite-vec is unavailable: ${vecError}`, 'vec_unavailable')
    }
  }

  function createModelTables(key, dimensions) {
    const chunks = `embedding_chunks_${key}`
    const vec = `embedding_vec_${key}`
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${chunks} (
        chunk_id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        revision_id TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${key}_note ON ${chunks}(note_id);
    `)
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${vec}
      USING vec0(chunk_id text primary key, embedding float[${dimensions}] distance_metric=cosine)
    `)
    return { chunks, vec }
  }

  function ensureModel({ model, dimensions, baseUrl }) {
    const name = String(model || '').trim()
    if (!name || name.length > 200) throw fail(400, 'Embedding model is required', 'invalid_model')
    const dims = Number(dimensions)
    if (!Number.isInteger(dims) || dims < 1 || dims > 8192) {
      throw fail(400, 'Embedding dimensions must be between 1 and 8192', 'invalid_dimensions')
    }
    requireVec()
    const variant = variantFor(dims)
    const existing = modelRow(name, variant)
    if (existing) {
      createModelTables(safeKey(existing.table_key), dims)
      return existing
    }

    const key = tableKeyFor(name, variant)
    const collision = db.prepare('SELECT model, variant FROM embedding_models WHERE table_key = ?').get(key)
    if (collision) {
      throw fail(409, 'Embedding table key collision; choose another model/variant', 'table_collision')
    }
    createModelTables(key, dims)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO embedding_models
        (model, variant, table_key, dimensions, base_url, chunk_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'idle', ?, ?)
    `).run(name, variant, key, dims, baseUrl || null, now, now)
    return modelRow(name, variant)
  }

  function apiKeyFromRow(row) {
    return decryptSecret(SECRET, row.api_key_encrypted)
  }

  function makeClient({ baseUrl, apiKey, model, dimensions }) {
    if (!apiKey) throw fail(400, 'Embedding API key is required', 'missing_api_key')
    const current = tuningFrom()
    return clientFactory({
      baseUrl,
      apiKey,
      model,
      dimensions,
      fetchImpl,
      batchSize: current.batchSize,
      concurrency: current.concurrency,
      maxBatchChars: current.maxBatchChars,
      sendDimensions: supportsDimensions(model)
    })
  }

  function rerankApiKeyFromRow(row) {
    return decryptSecret(SECRET, row.rerank_api_key_encrypted) || apiKeyFromRow(row)
  }

  function makeRerankClient({ baseUrl, apiKey, model }) {
    if (!apiKey) throw fail(400, 'Rerank API key is required', 'missing_rerank_key')
    if (!model) throw fail(400, 'Rerank model is required', 'missing_rerank_model')
    return rerankClientFactory({ baseUrl, apiKey, model, fetchImpl })
  }

  async function testRerankConfig({ baseUrl, apiKey, model } = {}) {
    const row = settingsRow()
    const resolved = {
      baseUrl: normalizeBaseUrl(baseUrl || row.rerank_base_url || row.base_url),
      apiKey: apiKey || rerankApiKeyFromRow(row),
      model: String(model || row.rerank_model || '').trim()
    }
    if (!resolved.model) throw fail(400, 'Rerank model is required', 'missing_rerank_model')
    const client = makeRerankClient(resolved)
    const probe = await client.probe()
    return { ok: true, ...probe, model: resolved.model, baseUrl: resolved.baseUrl }
  }

  async function testConfig({ baseUrl, apiKey, model, dimensions } = {}) {
    const row = settingsRow()
    const resolved = {
      baseUrl: normalizeBaseUrl(baseUrl || row.base_url),
      apiKey: apiKey || apiKeyFromRow(row),
      model: String(model || row.model || '').trim(),
      dimensions: dimensions != null
        ? Number(dimensions)
        : (String(model || row.model || '').trim() === row.model && row.dimensions
            ? row.dimensions
            : defaultDimensionsForModel(model || row.model))
    }
    if (!resolved.model) throw fail(400, 'Embedding model is required', 'invalid_model')
    if (!supportsDimensions(resolved.model)) resolved.dimensions = null
    const client = makeClient(resolved)
    const probe = await client.probe()
    return { ok: true, ...probe, model: resolved.model, baseUrl: resolved.baseUrl }
  }

  async function saveConfig({
    baseUrl,
    apiKey,
    clearApiKey = false,
    model,
    dimensions,
    chunkSize,
    chunkOverlap,
    batchSize,
    concurrency,
    maxBatchChars,
    noteConcurrency,
    enabled = false,
    forceReindex = false,
    rerankEnabled,
    rerankBaseUrl,
    rerankApiKey,
    clearRerankApiKey = false,
    rerankModel
  } = {}) {
    const old = settingsRow()
    const oldTuning = tuningFrom(old)
    const clampInt = (value, min, max, fallback) => {
      if (value === undefined || value === null || value === '') return fallback
      const number = Number(value)
      if (!Number.isFinite(number)) return fallback
      return Math.max(min, Math.min(max, Math.round(number)))
    }
    const nextTuning = {
      batchSize: clampInt(batchSize, 1, 128, oldTuning.batchSize),
      concurrency: clampInt(concurrency, 1, 8, oldTuning.concurrency),
      maxBatchChars: clampInt(maxBatchChars, 1_000, 1_000_000, oldTuning.maxBatchChars),
      noteConcurrency: clampInt(noteConcurrency, 1, 8, oldTuning.noteConcurrency)
    }
    const nextBaseUrl = normalizeBaseUrl(baseUrl || old.base_url)
    const nextModel = String(model !== undefined ? model : (old.model || '')).trim()
    const nextChunkSize = Math.max(200, Math.min(4000, Number(chunkSize) || old.chunk_size || 1200))
    const overlapInput = chunkOverlap !== undefined && chunkOverlap !== null && chunkOverlap !== ''
      ? Number(chunkOverlap)
      : (old.chunk_overlap ?? 180)
    const nextOverlap = Math.max(0, Math.min(
      Math.floor(nextChunkSize / 3),
      Number.isFinite(overlapInput) ? overlapInput : 180
    ))
    let encrypted = old.api_key_encrypted
    if (clearApiKey) encrypted = null
    else if (apiKey) encrypted = encryptSecret(SECRET, String(apiKey))
    const rawKey = clearApiKey ? null : (apiKey || apiKeyFromRow(old))

    const nextRerankEnabled = rerankEnabled !== undefined ? !!rerankEnabled : !!old.rerank_enabled
    const nextRerankBaseUrl = rerankBaseUrl !== undefined
      ? (String(rerankBaseUrl || '').trim() ? normalizeBaseUrl(rerankBaseUrl) : null)
      : old.rerank_base_url
    const nextRerankModel = rerankModel !== undefined
      ? String(rerankModel || '').trim()
      : (old.rerank_model || '')
    let rerankEncrypted = old.rerank_api_key_encrypted
    if (clearRerankApiKey) rerankEncrypted = null
    else if (rerankApiKey) rerankEncrypted = encryptSecret(SECRET, String(rerankApiKey))
    const rerankRawKey = rerankApiKey || decryptSecret(SECRET, rerankEncrypted) || rawKey

    let nextDimensions = dimensions != null && dimensions !== ''
      ? Number(dimensions)
      : old.model === nextModel
        ? old.dimensions
        : defaultDimensionsForModel(nextModel)
    // `dimensions` is only meaningful for Qwen3-Embedding in the current
    // SiliconFlow API. Other providers/models use their native dimensions.
    if (!supportsDimensions(nextModel)) nextDimensions = null

    let probe = null
    let rerankProbe = null
    let modelChanged = old.model !== nextModel
    if (enabled) {
      if (!rawKey) throw fail(400, 'Embedding API key is required to enable semantic search', 'missing_api_key')
      if (!nextModel) throw fail(400, 'Embedding model is required', 'invalid_model')
      probe = await testConfig({
        baseUrl: nextBaseUrl,
        apiKey: rawKey,
        model: nextModel,
        dimensions: nextDimensions
      })
      if (nextDimensions != null && Number(nextDimensions) !== probe.dimensions) {
        throw fail(400, `Model returned ${probe.dimensions} dimensions, but ${nextDimensions} was configured`, 'dimension_mismatch')
      }
      nextDimensions = probe.dimensions
      ensureModel({ model: nextModel, dimensions: nextDimensions, baseUrl: nextBaseUrl })
    }

    if (nextRerankEnabled) {
      if (!nextRerankModel) throw fail(400, 'Rerank model is required when rerank is enabled', 'missing_rerank_model')
      if (!rerankRawKey) throw fail(400, 'Rerank API key is required when rerank is enabled', 'missing_rerank_key')
      rerankProbe = await testRerankConfig({
        baseUrl: nextRerankBaseUrl || nextBaseUrl,
        apiKey: rerankRawKey,
        model: nextRerankModel
      })
    }

    const now = new Date().toISOString()
    const dimensionsChanged = nextDimensions != null && Number(old.dimensions) !== Number(nextDimensions)
    const reindex = enabled && (
      forceReindex || modelChanged || dimensionsChanged || !old.enabled ||
      Number(old.chunk_size) !== nextChunkSize || Number(old.chunk_overlap) !== nextOverlap
    )
    db.prepare(`
      UPDATE embedding_settings
      SET enabled = ?, base_url = ?, api_key_encrypted = ?, model = ?, dimensions = ?,
          chunk_size = ?, chunk_overlap = ?, batch_size = ?, concurrency = ?,
          max_batch_chars = ?, note_concurrency = ?,
          last_tested_at = ?, last_error = NULL, updated_at = ?,
          rerank_enabled = ?, rerank_base_url = ?, rerank_api_key_encrypted = ?, rerank_model = ?
      WHERE id = 1
    `).run(
      enabled ? 1 : 0,
      nextBaseUrl,
      encrypted,
      nextModel || null,
      nextDimensions || null,
      nextChunkSize,
      nextOverlap,
      nextTuning.batchSize,
      nextTuning.concurrency,
      nextTuning.maxBatchChars,
      nextTuning.noteConcurrency,
      (probe || rerankProbe) ? now : old.last_tested_at,
      now,
      nextRerankEnabled ? 1 : 0,
      nextRerankBaseUrl || null,
      rerankEncrypted,
      nextRerankModel || null
    )

    if (!enabled) {
      queue.clear()
    } else {
      enqueueAll({ force: reindex })
    }
    return { settings: settingsDto(), probe, rerankProbe }
  }

  function upsertState(model, variant, noteId, patch) {
    const now = new Date().toISOString()
    const normalizedVariant = variantFor(variant)
    const existing = db.prepare(
      'SELECT * FROM embedding_index_state WHERE model = ? AND variant = ? AND note_id = ?'
    ).get(model, normalizedVariant, noteId)
    if (existing) {
      db.prepare(`
        UPDATE embedding_index_state
        SET revision_id = ?, content_hash = ?, chunk_count = ?, status = ?, error = ?, updated_at = ?
        WHERE model = ? AND variant = ? AND note_id = ?
      `).run(
        patch.revisionId ?? existing.revision_id,
        patch.contentHash ?? existing.content_hash,
        patch.chunkCount ?? existing.chunk_count,
        patch.status ?? existing.status,
        patch.error ?? null,
        now,
        model,
        normalizedVariant,
        noteId
      )
    } else {
      db.prepare(`
        INSERT INTO embedding_index_state
          (model, variant, note_id, revision_id, content_hash, chunk_count, status, error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        model,
        normalizedVariant,
        noteId,
        patch.revisionId || null,
        patch.contentHash || null,
        patch.chunkCount || 0,
        patch.status || 'pending',
        patch.error || null,
        now
      )
    }
  }

  function deleteNoteChunks(model, variant, noteId) {
    const row = modelRow(model, variant)
    if (!row) return
    const key = safeKey(row.table_key)
    const chunks = `embedding_chunks_${key}`
    const vec = `embedding_vec_${key}`
    try {
      const ids = db.prepare(`SELECT chunk_id FROM ${chunks} WHERE note_id = ?`).all(noteId)
      const delVec = db.prepare(`DELETE FROM ${vec} WHERE chunk_id = ?`)
      for (const item of ids) delVec.run(item.chunk_id)
      db.prepare(`DELETE FROM ${chunks} WHERE note_id = ?`).run(noteId)
    } catch (_) { /* table may not exist yet */ }
  }

  function deleteNoteEverywhere(noteId) {
    for (const row of db.prepare('SELECT * FROM embedding_models').all()) {
      deleteNoteChunks(row.model, row.variant, noteId)
    }
    db.prepare('DELETE FROM embedding_index_state WHERE note_id = ?').run(noteId)
  }

  async function processNote(noteId, { force = false } = {}) {
    const settings = settingsRow()
    if (!settings.enabled || !settings.model) return { skipped: true, reason: 'disabled' }
    const key = apiKeyFromRow(settings)
    if (!key) {
      throw fail(400, 'Embedding API key is missing', 'missing_api_key')
    }
    const model = ensureModel({
      model: settings.model,
      dimensions: settings.dimensions,
      baseUrl: settings.base_url
    })
    if (Number(model.dimensions) !== Number(settings.dimensions)) {
      throw fail(409, 'Embedding model dimensions changed; choose a variant with its own dimensions', 'dimension_mismatch')
    }
    const variant = variantFor(settings.dimensions)

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId)
    if (!note || note.archived_at) {
      deleteNoteChunks(settings.model, variant, noteId)
      upsertState(settings.model, variant, noteId, {
        status: note ? 'archived' : 'missing',
        chunkCount: 0,
        contentHash: null,
        revisionId: note?.head_revision_id || null
      })
      return { skipped: true, reason: note ? 'archived' : 'missing' }
    }

    const text = noteText(note)
    if (!text) {
      deleteNoteChunks(settings.model, variant, noteId)
      upsertState(settings.model, variant, noteId, {
        status: 'empty',
        chunkCount: 0,
        contentHash: null,
        revisionId: note.head_revision_id
      })
      return { skipped: true, reason: 'empty' }
    }

    const contentHash = noteHash(note, text, settings.chunk_size, settings.chunk_overlap)
    const state = db.prepare(
      'SELECT * FROM embedding_index_state WHERE model = ? AND variant = ? AND note_id = ?'
    ).get(settings.model, variant, noteId)
    if (!force && state?.content_hash === contentHash && state.status === 'indexed' && state.chunk_count > 0) {
      return { skipped: true, reason: 'unchanged' }
    }

    const chunks = chunkText(text, {
      maxChars: settings.chunk_size,
      overlapChars: settings.chunk_overlap
    })
    if (chunks.length === 0) {
      deleteNoteChunks(settings.model, variant, noteId)
      upsertState(settings.model, variant, noteId, {
        status: 'empty', chunkCount: 0, contentHash, revisionId: note.head_revision_id
      })
      return { skipped: true, reason: 'empty' }
    }

    const title = note.title || note.display_title || ''
    const inputs = chunks.map(chunk => `${title}\n\n${chunk.content}`.trim())
    const client = makeClient({
      baseUrl: settings.base_url,
      apiKey: key,
      model: settings.model,
      dimensions: settings.dimensions
    })
    const vectors = await client.embed(inputs)
    if (vectors.length !== chunks.length) throw new Error('Embedding vector count mismatch')
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== Number(model.dimensions)) {
        throw fail(400, `Model returned ${vector?.length || 0} dimensions, expected ${model.dimensions}`, 'dimension_mismatch')
      }
    }

    const current = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId)
    const currentText = current ? noteText(current) : ''
    const currentHash = current ? noteHash(current, currentText, settings.chunk_size, settings.chunk_overlap) : null
    if (currentHash !== contentHash) {
      enqueueNote(noteId)
      return { skipped: true, reason: 'changed-during-embedding' }
    }

    const tableKey = safeKey(model.table_key)
    const chunksTable = `embedding_chunks_${tableKey}`
    const vecTable = `embedding_vec_${tableKey}`
    const now = new Date().toISOString()
    db.exec('BEGIN IMMEDIATE')
    try {
      deleteNoteChunks(settings.model, variant, noteId)
      const insertChunk = db.prepare(`
        INSERT INTO ${chunksTable}
          (chunk_id, note_id, revision_id, chunk_index, content, content_hash, char_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertVec = db.prepare(`INSERT INTO ${vecTable} (chunk_id, embedding) VALUES (?, ?)`)
      chunks.forEach((chunk, index) => {
        const chunkId = hash(`${settings.model}\0${noteId}\0${contentHash}\0${index}`).slice(0, 40)
        insertChunk.run(
          chunkId,
          noteId,
          note.head_revision_id || null,
          index,
          chunk.content,
          hash(chunk.content),
          chunk.charCount,
          now
        )
        insertVec.run(chunkId, new Float32Array(vectors[index]))
      })
      upsertState(settings.model, variant, noteId, {
        revisionId: note.head_revision_id,
        contentHash,
        chunkCount: chunks.length,
        status: 'indexed',
        error: null
      })
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${chunksTable}`).get().count
      db.prepare(`
        UPDATE embedding_models
        SET chunk_count = ?, status = 'ready', last_indexed_at = ?, last_error = NULL, updated_at = ?
        WHERE model = ? AND variant = ?
      `).run(count, now, now, settings.model, variant)
      db.exec('COMMIT')
      return { chunks: chunks.length }
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      upsertState(settings.model, variant, noteId, {
        revisionId: note.head_revision_id,
        contentHash,
        chunkCount: 0,
        status: 'error',
        error: error.message
      })
      db.prepare(`
        UPDATE embedding_models SET status = 'error', last_error = ?, updated_at = ?
        WHERE model = ? AND variant = ?
      `).run(error.message, new Date().toISOString(), settings.model, variant)
      throw error
    }
  }

  function wakeWorker() {
    if (workerRunning || workerTimer) return
    workerTimer = setTimeout(() => {
      workerTimer = null
      runWorker().catch(error => {
        stats.failed += 1
        stats.lastError = error.message
      })
    }, 250)
  }

  async function runWorker() {
    if (workerRunning) return
    workerRunning = true
    const workers = tuningFrom().noteConcurrency
    try {
      await Promise.all(Array.from({ length: workers }, async () => {
        while (queue.size > 0) {
          const [noteId, force] = queue.entries().next().value
          queue.delete(noteId)
          runningNotes.add(noteId)
          currentNote = [...runningNotes][0] || null
          try {
            await processNote(noteId, { force })
            stats.indexed += 1
          } catch (error) {
            stats.failed += 1
            stats.lastError = error.message
          } finally {
            runningNotes.delete(noteId)
            currentNote = [...runningNotes][0] || null
          }
        }
      }))
    } finally {
      workerRunning = false
      runningNotes.clear()
      currentNote = null
      if (queue.size > 0) wakeWorker()
    }
  }

  function enqueueNote(noteId, { force = false } = {}) {
    if (!autoIndex) return false
    const settings = settingsRow()
    if (!settings.enabled || !noteId) return false
    queue.set(noteId, force || queue.get(noteId) === true)
    wakeWorker()
    return true
  }

  function enqueueAll({ force = false } = {}) {
    if (!autoIndex) return 0
    const settings = settingsRow()
    if (!settings.enabled) return 0
    const rows = db.prepare('SELECT id FROM notes').all()
    for (const row of rows) queue.set(row.id, force || queue.get(row.id) === true)
    wakeWorker()
    return rows.length
  }

  async function indexNoteNow(noteId, { force = true } = {}) {
    const settings = settingsRow()
    if (!settings.enabled) throw fail(400, 'Semantic search is disabled', 'embedding_disabled')
    return processNote(noteId, { force })
  }

  async function searchMatches({
    query,
    limit = 20,
    tags: tagList = [],
    tagMode = 'any',
    type = null,
    includeArchived = false
  } = {}) {
    const settings = settingsRow()
    if (!settings.enabled || !settings.model) {
      throw fail(400, 'Semantic search is not configured', 'embedding_disabled')
    }
    const key = apiKeyFromRow(settings)
    if (!key) throw fail(400, 'Embedding API key is missing', 'missing_api_key')
    const model = ensureModel({
      model: settings.model,
      dimensions: settings.dimensions,
      baseUrl: settings.base_url
    })
    const text = String(query || '').trim()
    if (!text) return { model: settings.model, results: [] }
    requireVec()
    const client = makeClient({
      baseUrl: settings.base_url,
      apiKey: key,
      model: settings.model,
      dimensions: settings.dimensions
    })
    const [vector] = await client.embed([embeddingQueryInput(model.model, text)])
    if (!Array.isArray(vector) || vector.length !== Number(model.dimensions)) {
      throw fail(400, `Query embedding has ${vector?.length || 0} dimensions, expected ${model.dimensions}`, 'dimension_mismatch')
    }

    const tableKey = safeKey(model.table_key)
    const chunksTable = `embedding_chunks_${tableKey}`
    const vecTable = `embedding_vec_${tableKey}`
    const k = Math.max(50, Math.min(200, Number(limit) * 5))
    const vectorRows = db.prepare(
      `SELECT chunk_id, distance FROM ${vecTable} WHERE embedding MATCH ? AND k = ?`
    ).all(new Float32Array(vector), k)
    if (vectorRows.length === 0) return { model: settings.model, results: [] }

    const ids = vectorRows.map(row => row.chunk_id)
    const placeholders = ids.map(() => '?').join(',')
    const chunks = db.prepare(
      `SELECT * FROM ${chunksTable} WHERE chunk_id IN (${placeholders})`
    ).all(...ids)
    const chunkMap = new Map(chunks.map(row => [row.chunk_id, row]))
    const noteIds = [...new Set(chunks.map(row => row.note_id))]
    if (noteIds.length === 0) return { model: settings.model, results: [] }

    const notePlaceholders = noteIds.map(() => '?').join(',')
    const notes = db.prepare(
      `SELECT * FROM notes WHERE id IN (${notePlaceholders})`
    ).all(...noteIds)
    const noteMap = new Map(notes.map(row => [row.id, row]))

    let tagIds = null
    const wantedTags = Array.isArray(tagList) ? tagList.filter(Boolean) : []
    if (wantedTags.length > 0 && tags) {
      const sets = wantedTags.map(tag => tags.noteIdsForTag(tag))
      tagIds = new Set(sets[0] || [])
      if (tagMode === 'all') {
        for (const set of sets.slice(1)) {
          for (const id of [...tagIds]) if (!set?.has(id)) tagIds.delete(id)
        }
      } else {
        for (const set of sets) for (const id of set || []) tagIds.add(id)
      }
    }

    const candidates = []
    for (const row of vectorRows) {
      const chunk = chunkMap.get(row.chunk_id)
      if (!chunk) continue
      const note = noteMap.get(chunk.note_id)
      if (!note) continue
      if (!includeArchived && note.archived_at) continue
      if (type && note.type !== type) continue
      if (tagIds && !tagIds.has(note.id)) continue
      candidates.push({
        noteId: note.id,
        title: note.title || note.display_title || '',
        distance: row.distance,
        similarity: Math.max(0, 1 - row.distance),
        chunkIndex: chunk.chunk_index,
        snippet: chunk.content.slice(0, 400),
        document: chunk.content
      })
    }

    let rerankInfo = { enabled: false, applied: false, error: null, model: null }
    if (settings.rerank_enabled && settings.rerank_model && candidates.length > 1) {
      const rerankKey = rerankApiKeyFromRow(settings)
      if (!rerankKey) {
        rerankInfo = {
          enabled: true,
          applied: false,
          error: 'Rerank API key is missing',
          model: settings.rerank_model
        }
      } else {
        try {
          const rerankClient = makeRerankClient({
            baseUrl: settings.rerank_base_url || settings.base_url,
            apiKey: rerankKey,
            model: settings.rerank_model
          })
          const scores = await rerankClient.rerank(
            text,
            candidates.map(candidate => `${candidate.title}\n\n${candidate.document}`),
            { topN: candidates.length }
          )
          const scoreMap = new Map(scores.map(item => [item.index, item.score]))
          for (let i = 0; i < candidates.length; i++) {
            candidates[i].rerankScore = scoreMap.has(i) ? scoreMap.get(i) : null
          }
          rerankInfo = { enabled: true, applied: true, error: null, model: settings.rerank_model }
        } catch (error) {
          rerankInfo = {
            enabled: true,
            applied: false,
            error: error.message,
            model: settings.rerank_model
          }
        }
      }
    }

    const grouped = new Map()
    for (const candidate of candidates) {
      const existing = grouped.get(candidate.noteId)
      if (!existing) {
        grouped.set(candidate.noteId, candidate)
        continue
      }
      const candidateRerank = candidate.rerankScore
      const existingRerank = existing.rerankScore
      if (candidateRerank != null && (existingRerank == null || candidateRerank > existingRerank)) {
        grouped.set(candidate.noteId, candidate)
      } else if (candidateRerank == null && existingRerank == null && candidate.distance < existing.distance) {
        grouped.set(candidate.noteId, candidate)
      }
    }

    const ordered = [...grouped.values()].sort((a, b) => {
      if (a.rerankScore != null && b.rerankScore != null) return b.rerankScore - a.rerankScore
      if (a.rerankScore != null) return -1
      if (b.rerankScore != null) return 1
      return b.similarity - a.similarity
    })
    const results = ordered.slice(0, Math.max(1, Math.min(100, Number(limit) || 20)))
    return { model: settings.model, rerank: rerankInfo, results }
  }

  function resetIndex({ reindex = true } = {}) {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND (name LIKE 'embedding_chunks_%' OR name LIKE 'embedding_vec_%')
      ORDER BY name
    `).all()
      .map(row => row.name)
      .filter(name => /^embedding_chunks_emb_[a-f0-9]{16}$/.test(name) ||
        /^embedding_vec_emb_[a-f0-9]{16}$/.test(name))
    queue.clear()
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const name of tables) {
        db.exec(`DROP TABLE IF EXISTS "${String(name).replace(/"/g, '""')}"`)
      }
      db.exec('DELETE FROM embedding_index_state')
      db.exec('DELETE FROM embedding_models')
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
    if (reindex) enqueueAll({ force: true })
    return {
      success: true,
      droppedTables: tables.length,
      queued: reindex ? queue.size : 0
    }
  }

  function status() {
    const settings = settingsRow()
    return {
      settings: settingsDto(settings),
      tuning: tuningFrom(settings),
      models: listModels(),
      queue: {
        queued: queue.size,
        running: workerRunning,
        currentNote,
        currentNotes: [...runningNotes],
        indexed: stats.indexed,
        failed: stats.failed,
        lastError: stats.lastError
      },
      vector: {
        loaded: vecLoaded,
        version: vecVersion,
        error: vecError
      }
    }
  }

  function initialize() {
    loadVec()
    const settings = settingsRow()
    if (settings.enabled && settings.model && settings.dimensions) {
      if (apiKeyFromRow(settings)) enqueueAll({ force: false })
    }
    return status()
  }

  return {
    initialize,
    status,
    settings: () => settingsDto(),
    models: listModels,
    testConfig,
    saveConfig,
    enqueueNote,
    enqueueAll,
    resetIndex,
    indexNoteNow,
    searchMatches,
    deleteNoteEverywhere,
    loadVec
  }
}
