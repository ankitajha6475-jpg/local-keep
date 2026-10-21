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
  batchSize = 32
}) {
  if (!baseUrl) throw new Error('Embedding base URL is required')
  if (!apiKey) throw new Error('Embedding API key is required')
  if (!model) throw new Error('Embedding model is required')
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable')

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
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
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

  async function embed(texts, options = {}) {
    const values = (Array.isArray(texts) ? texts : [texts]).map(text => String(text ?? ''))
    if (values.some(text => text.length === 0)) throw new Error('Embedding input must not be empty')
    if (values.length === 0) return []
    const size = Math.max(1, Math.min(128, options.batchSize || batchSize))
    const vectors = []
    for (let i = 0; i < values.length; i += size) {
      vectors.push(...await request(values.slice(i, i + size)))
    }
    return vectors
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
