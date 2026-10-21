// Long-lived server secret used for session-cookie HMACs and at-rest
// encryption of admin-configured API keys.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export function loadOrCreateSecret(secretFilePath) {
  try {
    if (fs.existsSync(secretFilePath)) {
      const existing = fs.readFileSync(secretFilePath, 'utf8').trim()
      if (existing.length >= 32) return existing
    }
  } catch (_) { /* fall through to create */ }
  const generated = crypto.randomBytes(48).toString('hex')
  try {
    fs.mkdirSync(path.dirname(secretFilePath), { mode: 0o700, recursive: true })
    fs.writeFileSync(secretFilePath, generated, { mode: 0o600 })
  } catch (_) { /* best-effort; in-memory works until next restart */ }
  return generated
}
