import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
])

export const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
}

export const EXT_TO_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

export function createImageStore({ imagesDir }) {
  fs.mkdirSync(imagesDir, { recursive: true, mode: 0o700 })

  function pathFor(hash, ext) {
    return path.join(imagesDir, `${hash}.${ext}`)
  }

  function storeImageBuffer(buffer, mimeType) {
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null
    const ext = MIME_TO_EXT[mimeType] || 'bin'
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const filePath = pathFor(hash, ext)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer)
    }
    return { hash, ext, mimeType }
  }

  function storeImageFromDataURL(dataURL) {
    const match = String(dataURL || '').match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return null
    return storeImageBuffer(Buffer.from(match[2], 'base64'), match[1])
  }

  function readImageBuffer(hash, ext) {
    const filePath = pathFor(hash, ext)
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath)
  }

  function readImageDataURL(hash, ext, mimeType) {
    const buffer = readImageBuffer(hash, ext)
    if (!buffer) return null
    const mime = mimeType || EXT_TO_MIME[ext] || 'application/octet-stream'
    return `data:${mime};base64,${buffer.toString('base64')}`
  }

  function exists(hash, ext) {
    return fs.existsSync(pathFor(hash, ext))
  }

  function deleteImage(hash, ext) {
    const filePath = pathFor(hash, ext)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  return {
    imagesDir,
    pathFor,
    storeImageBuffer,
    storeImageFromDataURL,
    readImageBuffer,
    readImageDataURL,
    exists,
    deleteImage
  }
}

/**
 * Extract image hashes referenced by text content and/or canvasData.
 * Text notes use markdown refs; canvas notes use files[*].hash.
 */
export function extractImageRefs(content, canvasData) {
  const hashes = new Set()

  if (content) {
    const mdImgRegex = /!\[[^\]]*\]\(\/api\/images\/([a-f0-9]{16})\.[a-z]+\)/g
    let match
    while ((match = mdImgRegex.exec(String(content))) !== null) {
      hashes.add(match[1])
    }
  }

  if (canvasData) {
    try {
      const data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
      for (const fileData of Object.values(data.files || {})) {
        if (fileData && fileData.hash && /^[a-f0-9]{16}$/.test(fileData.hash)) {
          hashes.add(fileData.hash)
        }
      }
    } catch (_) { /* ignore parse errors */ }
  }

  return hashes
}

export function imageMimeForExt(ext) {
  return EXT_TO_MIME[ext] || 'application/octet-stream'
}
