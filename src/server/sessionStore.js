// Session management: opaque, server-stored session IDs signed via HMAC.

import crypto from 'crypto'
import path from 'path'
import { loadOrCreateSecret } from './secret.js'

const COOKIE_NAME = 'local_keep_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

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

  function persistRow(sessionId, userId, hash, expiresAt) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO sessions (sessionId, user_id, hash, expiresAt) VALUES (?, ?, ?, ?)
      `).run(sessionId, userId || null, hash || '', expiresAt)
    } catch (_) { /* best-effort */ }
  }

  function deleteRow(sessionId) {
    try { db.prepare('DELETE FROM sessions WHERE sessionId = ?').run(sessionId) } catch (_) {}
  }

  // Hydrate from SQLite on boot.
  function hydrate() {
    try {
      const now = Date.now()
      const rows = db.prepare('SELECT sessionId, user_id, hash, expiresAt FROM sessions').all()
      for (const row of rows) {
        if (row.expiresAt > now) {
          sessions.set(row.sessionId, {
            userId: row.user_id || null,
            hash: row.hash,
            expiresAt: row.expiresAt
          })
        } else {
          deleteRow(row.sessionId)
        }
      }
    } catch (_) { /* schema not yet created? safe to ignore */ }
  }

  function issue(input = {}) {
    const options = typeof input === 'string' ? { hash: input } : input
    const sessionId = crypto.randomBytes(24).toString('hex')
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    const entry = {
      userId: options.userId || null,
      hash: options.hash || '',
      expiresAt
    }
    sessions.set(sessionId, entry)
    persistRow(sessionId, entry.userId, entry.hash, expiresAt)
    return { sessionId, expiresAt }
  }

  function validate(sessionId) {
    if (!sessionId) return null
    // The DB is authoritative so revocation from another process (CLI reset,
    // stdio adapter, second server) is effective immediately. The Map is a
    // read cache.
    let row = null
    try {
      row = db.prepare(
        'SELECT user_id, hash, expiresAt FROM sessions WHERE sessionId = ?'
      ).get(sessionId)
    } catch (_) { /* schema not ready */ }
    if (!row) {
      sessions.delete(sessionId)
      return null
    }
    if (row.expiresAt <= Date.now()) {
      sessions.delete(sessionId)
      deleteRow(sessionId)
      return null
    }
    const entry = {
      userId: row.user_id || null,
      hash: row.hash,
      expiresAt: row.expiresAt
    }
    sessions.set(sessionId, entry)
    return entry
  }

  function revoke(sessionId) {
    if (!sessionId) return false
    const had = sessions.delete(sessionId)
    deleteRow(sessionId)
    return had
  }

  function revokeUser(userId, { exceptSessionId = null } = {}) {
    if (!userId) return 0
    let count = 0
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry.userId === userId && sessionId !== exceptSessionId) {
        sessions.delete(sessionId)
        deleteRow(sessionId)
        count += 1
      }
    }
    // Also remove rows issued by another process that are not in this Map.
    try {
      const info = db.prepare(
        'DELETE FROM sessions WHERE user_id = ? AND sessionId != ?'
      ).run(userId, exceptSessionId || '')
      count = Math.max(count, info.changes || 0)
    } catch (_) { /* best effort */ }
    return count
  }

  function cookieHeader(sessionId, { clear = false } = {}) {
    const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict']
    if (process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1') {
      flags.push('Secure')
    }
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
    revokeUser,
    signCookie,
    parseCookie,
    cookieHeader,
    sessionIdFromRequest,
    cookieName,
    SESSION_MAX_AGE_SECONDS
  }
}
