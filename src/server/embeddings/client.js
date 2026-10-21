// Minimal OpenAI-compatible embeddings client (SiliconFlow, OpenAI, etc.).
// Only the standard POST /embeddings request/response is assumed.

function endpoint(baseUrl) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/embeddings`
}

function cleanError(status, body) {
  let message = ''
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body
    message = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.data
  } catch (_) {
    message = typeof body === 'string' ? body : ''
  }
  return `Embedding API error (${status})${message ? `: ${String(message).slice(0, 300)}` : ''}`
}

export function createEmbeddingClient({
  baseUrl,
  apiKey,
  model,
  dimensions = null,
  timeoutMs = 60_000,
  fetchImpl = globalThis.fetch,
  batchSize = 32,
  concurrency = 2,
  maxBatchChars = 48_000
}) {
  if (!baseUrl) throw new Error('Embedding base URL is required')
  if (!apiKey) throw new Error('Embedding API key is required')
  if (!model) throw new Error('Embedding model is required')
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable')

  const maxItems = Math.max(1, Math.min(128, Number(batchSize) || 32))
  const maxParallel = Math.max(1, Math.min(8, Number(concurrency) || 2))
  const maxChars = Math.max(1_000, Number(maxBatchChars) || 48_000)

  async function request(input) {
    const body = {
      model,
      input,
      encoding_format: 'float'
    }
    let lastError = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(endpoint(baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        })
        const text = await res.text()
        if (!res.ok) {
          const error = new Error(cleanError(res.status, text))
          error.status = res.status
          if ((res.status === 429 || res.status >= 500) && attempt < 2) {
            lastError = error
            const retryAfter = Number(res.headers.get('retry-after'))
            const delay = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(30_000, retryAfter * 1000)
              : 500 * Math.pow(2, attempt)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw error
        }
        let data
        try { data = JSON.parse(text) } catch (_) { throw new Error('Embedding API returned invalid JSON') }
        const rows = Array.isArray(data?.data) ? data.data : []
        if (rows.length !== input.length) {
          throw new Error(`Embedding API returned ${rows.length} vectors for ${input.length} inputs`)
        }
        rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        return rows.map(row => {
          if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
            throw new Error('Embedding API returned an empty vector')
          }
          return row.embedding.map(Number)
        })
      } catch (error) {
        if (error.name === 'AbortError') {
          lastError = new Error('Embedding API request timed out')
        } else {
          lastError = error
        }
        if (error.status && error.status < 500 && error.status !== 429) break
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError || new Error('Embedding API request failed')
  }

  function splitBatches(values, options = {}) {
    const size = Math.max(1, Math.min(128, Number(options.batchSize) || maxItems))
    const budget = Math.max(1_000, Number(options.maxBatchChars) || maxChars)
    const batches = []
    let batch = []
    let chars = 0
    for (const value of values) {
      if (batch.length > 0 && (batch.length >= size || chars + value.length > budget)) {
        batches.push(batch)
        batch = []
        chars = 0
      }
      batch.push(value)
      chars += value.length
    }
    if (batch.length > 0) batches.push(batch)
    return batches
  }

  async function embed(texts, options = {}) {
    const values = (Array.isArray(texts) ? texts : [texts]).map(text => String(text ?? ''))
    if (values.some(text => text.length === 0)) throw new Error('Embedding input must not be empty')
    if (values.length === 0) return []

    const batches = splitBatches(values, options)
    const parallel = Math.max(1, Math.min(
      8,
      Number(options.concurrency) || maxParallel
    ))
    const results = new Array(batches.length)
    let next = 0

    async function worker() {
      while (true) {
        const index = next
        next += 1
        if (index >= batches.length) return
        results[index] = await request(batches[index])
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(parallel, batches.length) }, () => worker())
    )
    return results.flat()
  }

  async function probe() {
    const started = Date.now()
    const [vector] = await embed(['Local Keep embedding dimension probe'])
    return {
      dimensions: vector.length,
      latencyMs: Date.now() - started
    }
  }

  return { embed, probe, model, baseUrl }
}
