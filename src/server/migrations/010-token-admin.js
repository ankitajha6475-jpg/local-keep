export const migration010TokenAdmin = {
  version: 10,
  name: 'token-admin',
  up(db) {
    for (const ddl of [
      'ALTER TABLE api_tokens ADD COLUMN expires_at TEXT',
      'ALTER TABLE api_tokens ADD COLUMN created_by TEXT'
    ]) {
      try { db.exec(ddl) } catch (_) { /* already present */ }
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_api_tokens_name ON api_tokens(name)')
  }
}
