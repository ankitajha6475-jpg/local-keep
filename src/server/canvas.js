import crypto from 'crypto'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function stripCollabTs(el) {
  if (!el || typeof el !== 'object') return el
  const { _collab_ts, ...rest } = el
  return rest
}

function canonicalFiles(files) {
  if (!files || typeof files !== 'object') return {}
  const out = {}
  for (const id of Object.keys(files).sort()) {
    const file = files[id] || {}
    out[id] = {
      id: file.id ?? id,
      mimeType: file.mimeType ?? null,
      created: file.created ?? null,
      hash: file.hash ?? null,
      ext: file.ext ?? null
    }
  }
  return out
}

export function computeCanvasHash({ elements = [], files = {} } = {}) {
  const canonical = {
    elements: [...elements]
      .map(stripCollabTs)
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    files: canonicalFiles(files)
  }
  return sha256(JSON.stringify(canonical))
}

export function computeCanvasHashFromData(canvasData) {
  if (!canvasData) return null
  try {
    const data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
    return computeCanvasHash({ elements: data.elements || [], files: data.files || {} })
  } catch (_) {
    return null
  }
}

export function snapshotHash({ title = '', content = '', canvasHash = null }) {
  return sha256(JSON.stringify({ title: title || '', content: content || '', canvasHash: canvasHash || null }))
}

/**
 * Build a revision-safe canvas payload: keep Excalidraw element data and file
 * identities, but replace base64 dataURLs with content-addressed hash refs.
 * The head keeps the full dataURL so Excalidraw can render immediately.
 */
export function leanCanvasData(canvasData, imageStore) {
  if (!canvasData) return null
  let data
  try {
    data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
  } catch (_) {
    return null
  }

  const elements = (data.elements || []).map(stripCollabTs)
  const files = {}
  for (const [id, file] of Object.entries(data.files || {})) {
    if (!file) continue
    let hash = file.hash || null
    let ext = file.ext || null
    let mimeType = file.mimeType || null
    if (!hash && file.dataURL && imageStore) {
      const stored = imageStore.storeImageFromDataURL(file.dataURL)
      if (stored) {
        hash = stored.hash
        ext = stored.ext
        mimeType = stored.mimeType
      }
    }
    files[id] = {
      id: file.id ?? id,
      mimeType,
      created: file.created ?? null,
      hash,
      ext
    }
  }

  return JSON.stringify({ elements, files })
}

/**
 * Expand a lean revision canvas back into the shape Excalidraw needs
 * (files[*].dataURL). Missing images are left as hash-only entries.
 */
export function hydrateCanvasData(canvasData, imageStore) {
  if (!canvasData) return null
  let data
  try {
    data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
  } catch (_) {
    return null
  }

  const files = {}
  for (const [id, file] of Object.entries(data.files || {})) {
    if (!file) continue
    const next = { ...file }
    if (!next.dataURL && next.hash && next.ext && imageStore) {
      const dataURL = imageStore.readImageDataURL(next.hash, next.ext, next.mimeType)
      if (dataURL) next.dataURL = dataURL
    }
    files[id] = next
  }

  return JSON.stringify({ elements: data.elements || [], files })
}
