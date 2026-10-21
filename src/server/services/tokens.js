import crypto from 'crypto'

const ALLOWED_SCOPES = new Set(['read', 'write', 'admin'])

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function normalizeScopes(scopes = 'read,write') {
  const values = (Array.isArray(scopes) ? scopes : [scopes])
    .flatMap(value => String(value ?? '').split(','))
  const clean = [...new Set(values.map(value => value.trim()).filter(Boolean))]
  for (const scope of clean) {
    if (!ALLOWED_SCOPES.has(scope)) {
      const error = new Error(`Unknown token scope: ${scope}`)
      error.status = 400
      throw error
    }
  }
  if (clean.length === 0) {
    const error = new Error('At least one token scope is required')
    error.status = 400
    throw error
  }
  return clean
}

function toRecord(row) {
  return {
    ...row,
    scopes: String(row.scopes || '').split(',').filter(Boolean),
    expiresAt: row.expiresAt ?? row.expires_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    lastUsedAt: row.lastUsedAt ?? row.last_used_at ?? null,
    revokedAt: row.revokedAt ?? row.revoked_at ?? null,
    createdBy: row.createdBy ?? row.created_by ?? null
  }
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
  const columns = new Set(db.prepare("PRAGMA table_info('api_tokens')").all().map(column => column.name))
  if (!columns.has('expires_at')) db.exec('ALTER TABLE api_tokens ADD COLUMN expires_at TEXT')
  if (!columns.has('created_by')) db.exec('ALTER TABLE api_tokens ADD COLUMN created_by TEXT')
}

export function createTokenService({ db }) {
  ensureApiTokensTable(db)

  function create({ name, scopes = 'read,write', expiresAt = null, createdBy = null } = {}) {
    const cleanName = String(name || '').trim()
    if (!cleanName) {
      const error = new Error('Token name is required')
      error.status = 400
      throw error
    }
    const cleanScopes = normalizeScopes(scopes)
    const raw = `lk_mcp_${crypto.randomBytes(32).toString('base64url')}`
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    let expiry = null
    if (expiresAt) {
      const parsed = new Date(expiresAt)
      if (Number.isNaN(parsed.getTime())) {
        const error = new Error('expiresAt must be a valid ISO date')
        error.status = 400
        throw error
      }
      expiry = parsed.toISOString()
      if (parsed.getTime() <= Date.now()) {
        const error = new Error('expiresAt must be in the future')
        error.status = 400
        throw error
      }
    }
    db.prepare(`
      INSERT INTO api_tokens (id, name, token_hash, scopes, created_at, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanName, hashToken(raw), cleanScopes.join(','), now, expiry, createdBy || null)
    return {
      token: raw,
      record: {
        id,
        name: cleanName,
        scopes: cleanScopes,
        createdAt: now,
        expiresAt: expiry,
        createdBy: createdBy || null
      }
    }
  }

  function list() {
    return db.prepare(`
      SELECT id, name, scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
             revoked_at AS revokedAt, expires_at AS expiresAt, created_by AS createdBy
      FROM api_tokens
      ORDER BY created_at DESC
    `).all().map(toRecord)
  }

  function getById(id) {
    const row = db.prepare(`
      SELECT id, name, scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
             revoked_at AS revokedAt, expires_at AS expiresAt, created_by AS createdBy
      FROM api_tokens WHERE id = ?
    `).get(id)
    return row ? toRecord(row) : null
  }

  function revoke(id) {
    const existing = getById(id)
    if (!existing || existing.revokedAt) {
      const error = new Error('Token not found or already revoked')
      error.status = 404
      throw error
    }
    const now = new Date().toISOString()
    db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?').run(now, id)
    return { success: true, id, name: existing.name, revokedAt: now }
  }

  function verify(raw) {
    if (!raw || typeof raw !== 'string') return null
    const row = db.prepare(
      'SELECT * FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL'
    ).get(hashToken(raw))
    if (!row) return null
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null
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
      scopes: String(row.scopes || '').split(',').filter(Boolean),
      expiresAt: row.expires_at || null
    }
  }

  function hasScope(token, scope) {
    if (!token) return false
    const scopes = token.scopes || []
    if (scopes.includes('admin')) return true
    return scopes.includes(scope) || scopes.includes('write')
  }

  return { create, list, getById, revoke, verify, hasScope }
}
