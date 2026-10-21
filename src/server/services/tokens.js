import crypto from 'crypto'

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function ensureApiTokensTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL DEFAULT 'read,write',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
  `)
}

export function createTokenService({ db }) {
  ensureApiTokensTable(db)

  function create({ name, scopes = 'read,write' } = {}) {
    const cleanName = String(name || '').trim()
    if (!cleanName) {
      const error = new Error('Token name is required')
      error.status = 400
      throw error
    }
    const raw = `lk_mcp_${crypto.randomBytes(32).toString('base64url')}`
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO api_tokens (id, name, token_hash, scopes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, cleanName, hashToken(raw), String(scopes), now)
    return {
      token: raw,
      record: { id, name: cleanName, scopes: String(scopes), createdAt: now }
    }
  }

  function list() {
    return db.prepare(`
      SELECT id, name, scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
             revoked_at AS revokedAt
      FROM api_tokens
      ORDER BY created_at DESC
    `).all().map(row => ({
      ...row,
      scopes: String(row.scopes || '').split(',').filter(Boolean)
    }))
  }

  function revoke(id) {
    const now = new Date().toISOString()
    const info = db.prepare(
      'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'
    ).run(now, id)
    if (info.changes === 0) {
      const error = new Error('Token not found or already revoked')
      error.status = 404
      throw error
    }
    return { success: true, id, revokedAt: now }
  }

  function verify(raw) {
    if (!raw || typeof raw !== 'string') return null
    const row = db.prepare(
      'SELECT * FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL'
    ).get(hashToken(raw))
    if (!row) return null
    const now = Date.now()
    const last = row.last_used_at ? new Date(row.last_used_at).getTime() : 0
    if (!last || now - last > 60_000) {
      try {
        db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
          .run(new Date(now).toISOString(), row.id)
      } catch (_) { /* best effort */ }
    }
    return {
      id: row.id,
      name: row.name,
      scopes: String(row.scopes || '').split(',').filter(Boolean)
    }
  }

  function hasScope(token, scope) {
    if (!token) return false
    return token.scopes.includes(scope) || token.scopes.includes('write')
  }

  return { create, list, revoke, verify, hasScope }
}
