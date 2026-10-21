import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startTestServer } from './helpers/serverProcess.js'

function startMockEmbeddingServer() {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        res.setHeader('Content-Type', 'application/json')
        if (req.url.endsWith('/rerank')) {
          const documents = Array.isArray(payload.documents) ? payload.documents : []
          const results = documents.map((document, index) => ({
            index,
            relevance_score: String(document).toLowerCase().includes('beta') ? 0.99 : 0.1
          })).sort((a, b) => b.relevance_score - a.relevance_score)
          res.end(JSON.stringify({ id: 'mock-rerank', results }))
          return
        }
        const inputs = Array.isArray(payload.input) ? payload.input : [payload.input]
        const data = inputs.map((input, index) => {
          const text = String(input).toLowerCase()
          const embedding = text.includes('alpha')
            ? [1, 0, 0]
            : text.includes('beta')
              ? [0, 1, 0]
              : [0, 0, 1]
          return { object: 'embedding', index, embedding }
        })
        res.end(JSON.stringify({ object: 'list', model: payload.model, data }))
      } catch (error) {
        res.statusCode = 400
        res.end(JSON.stringify({ message: error.message }))
      }
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` })
    })
  })
}

async function waitForIndex(request, model) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = await request('GET', '/api/admin/embeddings')
    const row = status.models.find(item => item.model === model)
    if (!status.queue.running && status.queue.queued === 0 && row?.chunkCount > 0) {
      return status
    }
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  throw new Error(`Timed out waiting for ${model} indexing`)
}

test('admin embedding config drives semantic search and model-partitioned tables', async () => {
  const mock = await startMockEmbeddingServer()
  const server = await startTestServer()
  try {
    const token = await server.setupAuth('admin-password-123')
    const request = server.client(token)

    const alpha = await request('POST', '/api/notes', {
      title: 'Alpha',
      content: 'alpha launch checklist'
    })
    const beta = await request('POST', '/api/notes', {
      title: 'Beta',
      content: 'beta design notes'
    })

    const saved = await request('PUT', '/api/admin/embeddings', {
      enabled: true,
      baseUrl: mock.baseUrl,
      apiKey: 'mock-key',
      model: 'mock-embed-v1',
      chunkSize: 400,
      chunkOverlap: 40
    })
    assert.equal(saved.settings.enabled, true)
    assert.equal(saved.settings.hasApiKey, true)
    assert.equal(saved.settings.dimensions, 3)

    await waitForIndex(request, 'mock-embed-v1')
    const semantic = await request('GET', '/api/search/semantic?q=alpha&limit=5')
    assert.equal(semantic.mode, 'semantic')
    assert.equal(semantic.results[0].note_id, alpha.id)
    assert.equal(semantic.results[0].semantic_score > 0.9, true)

    // Optional rerank: the mock prefers beta, so the rerank score reorders it.
    await request('PUT', '/api/admin/embeddings', {
      enabled: true,
      baseUrl: mock.baseUrl,
      apiKey: '',
      model: 'mock-embed-v1',
      chunkSize: 400,
      chunkOverlap: 40,
      rerankEnabled: true,
      rerankBaseUrl: mock.baseUrl,
      rerankApiKey: 'mock-rerank-key',
      rerankModel: 'mock-rerank'
    })
    const reranked = await request('GET', '/api/search/semantic?q=alpha&limit=5')
    assert.equal(reranked.rerank.applied, true)
    assert.equal(reranked.results[0].note_id, beta.id)
    assert.equal(typeof reranked.results[0].rerank_score, 'number')

    // A new model name creates a second, independent table.
    await request('PUT', '/api/admin/embeddings', {
      enabled: true,
      baseUrl: mock.baseUrl,
      apiKey: '',
      model: 'mock-embed-v2',
      chunkSize: 400,
      chunkOverlap: 40
    })
    await waitForIndex(request, 'mock-embed-v2')
    const twoModels = await request('GET', '/api/admin/embeddings')
    assert.equal(twoModels.models.length, 2)

    // Switching back reuses the original model table and still finds the note.
    await request('PUT', '/api/admin/embeddings', {
      enabled: true,
      baseUrl: mock.baseUrl,
      apiKey: '',
      model: 'mock-embed-v1',
      chunkSize: 400,
      chunkOverlap: 40
    })
    await waitForIndex(request, 'mock-embed-v1')
    const reused = await request('GET', '/api/search/semantic?q=beta&limit=5')
    assert.equal(reused.results[0].note_id, beta.id)
  } finally {
    await server.stop()
    await new Promise(resolve => mock.server.close(resolve))
  }
})
