import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmbeddingClient } from '../src/server/embeddings/client.js'

function responseFor(input) {
  return new Response(JSON.stringify({
    data: input.map((text, index) => ({
      index,
      embedding: [text.length, index, 1]
    }))
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

test('embedding client sends array batches and preserves result order', async () => {
  const calls = []
  const client = createEmbeddingClient({
    baseUrl: 'https://example.test/v1',
    apiKey: 'key',
    model: 'fake',
    batchSize: 2,
    concurrency: 1,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      calls.push(body.input)
      assert.equal(Array.isArray(body.input), true)
      return responseFor(body.input)
    }
  })

  const vectors = await client.embed(['a', 'bb', 'ccc', 'dddd', 'eeeee'])
  assert.deepEqual(calls.map(batch => batch.length), [2, 2, 1])
  assert.deepEqual(vectors.map(vector => vector[0]), [1, 2, 3, 4, 5])
  assert.equal(calls.every(batch => batch.every(text => typeof text === 'string')), true)
})

test('embedding client splits by character budget as well as item count', async () => {
  const calls = []
  const client = createEmbeddingClient({
    baseUrl: 'https://example.test/v1',
    apiKey: 'key',
    model: 'fake',
    batchSize: 32,
    maxBatchChars: 1000,
    concurrency: 1,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      calls.push(body.input)
      return responseFor(body.input)
    }
  })

  await client.embed(['x'.repeat(400), 'x'.repeat(400), 'x'.repeat(400)])
  assert.deepEqual(calls.map(batch => batch.length), [2, 1])
})

test('embedding client runs batches with bounded concurrency', async () => {
  let active = 0
  let maxActive = 0
  const client = createEmbeddingClient({
    baseUrl: 'https://example.test/v1',
    apiKey: 'key',
    model: 'fake',
    batchSize: 1,
    concurrency: 3,
    fetchImpl: async (_url, options) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 20))
      active -= 1
      const body = JSON.parse(options.body)
      return responseFor(body.input)
    }
  })

  await client.embed(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  assert.ok(maxActive >= 2, `expected parallel requests, saw max ${maxActive}`)
  assert.ok(maxActive <= 3, `concurrency exceeded: ${maxActive}`)
})
