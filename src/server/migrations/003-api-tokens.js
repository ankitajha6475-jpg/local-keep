export const migration003ApiTokens = {
  version: 3,
  name: 'api-tokens',
  up(db) {
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)')
  }
}
