import crypto from 'crypto'

function deriveKey(secret) {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(String(secret)),
    Buffer.from('local-keep-embeddings-salt'),
    Buffer.from('embedding-api-key'),
    32
  ))
}

export function encryptSecret(secret, plaintext) {
  if (!plaintext) return null
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(secret, value) {
  if (!value) return null
  const parts = String(value).split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  try {
    const key = deriveKey(secret)
    const iv = Buffer.from(parts[1], 'base64')
    const tag = Buffer.from(parts[2], 'base64')
    const encrypted = Buffer.from(parts[3], 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString('utf8')
  } catch (_) {
    return null
  }
}

export function maskSecret(value) {
  if (!value) return ''
  const text = String(value)
  if (text.length <= 8) return '••••'
  return `${text.slice(0, 3)}••••${text.slice(-4)}`
}
