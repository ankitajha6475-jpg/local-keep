export const DEFAULT_MAX_WRITE_SESSIONS = 5
export const DEFAULT_MAX_READ_SESSIONS = 8
const MAX_SESSIONS = 64

function clampSessionLimit(value, fallback) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric)) return fallback
  return Math.max(1, Math.min(MAX_SESSIONS, numeric))
}

function fail(message) {
  const error = new Error(message)
  error.status = 400
  error.code = 'invalid_mcp_limit'
  return error
}

function validateSessionLimit(value, label) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_SESSIONS) {
    throw fail(`${label} must be a whole number between 1 and ${MAX_SESSIONS}`)
  }
  return numeric
}

export function createMcpSettingsService({
  db,
  defaultMaxWriteSessions = DEFAULT_MAX_WRITE_SESSIONS,
  defaultMaxReadSessions = DEFAULT_MAX_READ_SESSIONS
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      max_write_sessions INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_WRITE_SESSIONS},
      max_read_sessions INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_READ_SESSIONS},
      updated_at TEXT NOT NULL
    );
  `)
  db.prepare(`
    INSERT OR IGNORE INTO mcp_settings
      (id, max_write_sessions, max_read_sessions, updated_at)
    VALUES
      (1, ?, ?, ?)
  `).run(
    clampSessionLimit(defaultMaxWriteSessions, DEFAULT_MAX_WRITE_SESSIONS),
    clampSessionLimit(defaultMaxReadSessions, DEFAULT_MAX_READ_SESSIONS),
    new Date().toISOString()
  )

  const select = db.prepare(`
    SELECT max_write_sessions AS maxWriteSessions,
           max_read_sessions AS maxReadSessions,
           updated_at AS updatedAt
    FROM mcp_settings
    WHERE id = 1
  `)

  function get() {
    return select.get()
  }

  function update({ maxWriteSessions, maxReadSessions } = {}) {
    const current = get()
    const nextWrites = maxWriteSessions === undefined
      ? current.maxWriteSessions
      : validateSessionLimit(maxWriteSessions, 'maxWriteSessions')
    const nextReads = maxReadSessions === undefined
      ? current.maxReadSessions
      : validateSessionLimit(maxReadSessions, 'maxReadSessions')
    db.prepare(`
      UPDATE mcp_settings
      SET max_write_sessions = ?, max_read_sessions = ?, updated_at = ?
      WHERE id = 1
    `).run(nextWrites, nextReads, new Date().toISOString())
    return get()
  }

  function limits() {
    const row = get()
    return {
      maxWrites: row.maxWriteSessions,
      maxReads: row.maxReadSessions
    }
  }

  return { get, update, limits }
}
