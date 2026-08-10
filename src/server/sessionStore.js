// Session management: opaque, server-stored session IDs signed via HMAC.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const COOKIE_NAME = 'local_keep_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

/**
 * Resolve or create the long-lived server secret used to HMAC-sign cookies.
 * Stored on disk so container restarts still validate cookies issued before.
 */
function loadOrCreateSecret(secretFilePath) {
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

export function createSessionStore({ db, dataDir }) {
  const SECRET = loadOrCreateSecret(path.join(dataDir, 'server_secret'))

  // In-memory store: sessionId -> { hash, expiresAt }. Hydrated from SQLite on boot.
  const sessions = new Map()

  function hmac(value) {
    return crypto.createHmac('sha256', SECRET).update(value).digest('hex')
  }

  function signCookie(sessionId) {
    return `${sessionId}.${hmac(sessionId)}`
  }

  function parseCookie(rawCookieValue) {
    if (!rawCookieValue || typeof rawCookieValue !== 'string') return null
    const dot = rawCookieValue.lastIndexOf('.')
    if (dot <= 0 || dot >= rawCookieValue.length - 1) return null
    const sessionId = rawCookieValue.slice(0, dot)
    const sig = rawCookieValue.slice(dot + 1)
    if (hmac(sessionId) !== sig) return null
    return sessionId
  }

  function persistRow(sessionId, hash, expiresAt) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO sessions (sessionId, hash, expiresAt) VALUES (?, ?, ?)
      `).run(sessionId, hash, expiresAt)
    } catch (_) { /* best-effort */ }
  }

  function deleteRow(sessionId) {
    try { db.prepare('DELETE FROM sessions WHERE sessionId = ?').run(sessionId) } catch (_) {}
  }

  // Hydrate from SQLite on boot.
  function hydrate() {
    try {
      const now = Date.now()
      const rows = db.prepare('SELECT sessionId, hash, expiresAt FROM sessions').all()
      for (const row of rows) {
        if (row.expiresAt > now) {
          sessions.set(row.sessionId, { hash: row.hash, expiresAt: row.expiresAt })
        } else {
          deleteRow(row.sessionId)
        }
      }
    } catch (_) { /* schema not yet created? safe to ignore */ }
  }

  function issue(hash) {
    const sessionId = crypto.randomBytes(24).toString('hex')
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    sessions.set(sessionId, { hash, expiresAt })
    persistRow(sessionId, hash, expiresAt)
    return { sessionId, expiresAt }
  }

  function validate(sessionId) {
    if (!sessionId) return null
    const entry = sessions.get(sessionId)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      sessions.delete(sessionId)
      deleteRow(sessionId)
      return null
    }
    return entry
  }

  function revoke(sessionId) {
    if (!sessionId) return false
    const had = sessions.delete(sessionId)
    deleteRow(sessionId)
    return had
  }

  function cookieHeader(sessionId, { clear = false } = {}) {
    const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict']
    if (process.env.NODE_ENV === 'production') flags.push('Secure')
    if (clear) {
      flags.push('Max-Age=0')
      return `${COOKIE_NAME}=; ${flags.join('; ')}`
    }
    flags.push(`Max-Age=${SESSION_MAX_AGE_SECONDS}`)
    return `${COOKIE_NAME}=${signCookie(sessionId)}; ${flags.join('; ')}`
  }

  function cookieName() { return COOKIE_NAME }

  /**
   * Parse the Cookie header of an Express request and return the session ID
   * inside our cookie (HMAC-verified), or null.
   */
  function sessionIdFromRequest(req) {
    const header = req.headers && req.headers.cookie
    if (!header) return null
    const cookies = header.split(/;\s*/)
    for (const c of cookies) {
      const eq = c.indexOf('=')
      if (eq <= 0) continue
      const name = c.slice(0, eq)
      const value = c.slice(eq + 1)
      if (name === COOKIE_NAME) return parseCookie(decodeURIComponent(value))
    }
    return null
  }

  return {
    hydrate,
    issue,
    validate,
    revoke,
    signCookie,
    parseCookie,
    cookieHeader,
    sessionIdFromRequest,
    cookieName,
    SESSION_MAX_AGE_SECONDS
  }
}
