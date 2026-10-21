export const migration005Embeddings = {
  version: 5,
  name: 'embeddings',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        base_url TEXT NOT NULL DEFAULT 'https://api.siliconflow.cn/v1',
        api_key_encrypted TEXT,
        model TEXT,
        dimensions INTEGER,
        chunk_size INTEGER NOT NULL DEFAULT 1200,
        chunk_overlap INTEGER NOT NULL DEFAULT 180,
        last_tested_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_models (
        model TEXT PRIMARY KEY,
        table_key TEXT NOT NULL UNIQUE,
        dimensions INTEGER NOT NULL,
        base_url TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        last_indexed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_index_state (
        model TEXT NOT NULL,
        note_id TEXT NOT NULL,
        revision_id TEXT,
        content_hash TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (model, note_id)
      );
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_embedding_state_model ON embedding_index_state(model)')
    db.prepare(`
      INSERT OR IGNORE INTO embedding_settings
        (id, enabled, base_url, model, dimensions, chunk_size, chunk_overlap, updated_at)
      VALUES (1, 0, 'https://api.siliconflow.cn/v1', NULL, NULL, 1200, 180, ?)
    `).run(new Date().toISOString())
  }
}
