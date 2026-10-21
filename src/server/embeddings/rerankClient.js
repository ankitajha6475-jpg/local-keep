// Optional OpenAI-compatible rerank client (SiliconFlow /rerank shape).

function endpoint(baseUrl) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/rerank`
}

function cleanError(status, body) {
  let message = ''
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body
    message = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.data
  } catch (_) {
    message = typeof body === 'string' ? body : ''
  }
  return `Rerank API error (${status})${message ? `: ${String(message).slice(0, 300)}` : ''}`
}

export function createRerankClient({
  baseUrl,
  apiKey,
  model,
  timeoutMs = 30_000,
  fetchImpl = globalThis.fetch
}) {
  if (!baseUrl) throw new Error('Rerank base URL is required')
  if (!apiKey) throw new Error('Rerank API key is required')
  if (!model) throw new Error('Rerank model is required')

  async function rerank(query, documents, { topN = null } = {}) {
    if (!query || !Array.isArray(documents) || documents.length === 0) return []
    const body = {
      model,
      query: String(query),
      documents: documents.map(document => String(document)),
      return_documents: false
    }
    if (topN) body.top_n = Math.max(1, Math.min(documents.length, Number(topN)))

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
        try { data = JSON.parse(text) } catch (_) { throw new Error('Rerank API returned invalid JSON') }
        const results = Array.isArray(data?.results) ? data.results : []
        return results.map(result => ({
          index: Number(result.index),
          score: Number(result.relevance_score ?? result.score ?? 0)
        }))
      } catch (error) {
        lastError = error.name === 'AbortError'
          ? new Error('Rerank API request timed out')
          : error
        if (error.status && error.status < 500 && error.status !== 429) break
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError || new Error('Rerank API request failed')
  }

  async function probe() {
    const started = Date.now()
    const results = await rerank('Local Keep', ['Local Keep notes', 'unrelated document'])
    return { ok: true, latencyMs: Date.now() - started, results: results.length }
  }

  return { rerank, probe, model, baseUrl }
}
