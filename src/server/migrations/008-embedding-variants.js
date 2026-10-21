export const migration008EmbeddingVariants = {
  version: 8,
  name: 'embedding-variants',
  up(db) {
    // Variant-aware embedding tables. This migration intentionally resets the
    // vector index because the table partition key now includes dimensions.
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND (name LIKE 'embedding_chunks_%' OR name LIKE 'embedding_vec_%')
    `).all()
      .map(row => row.name)
      .filter(name => /^embedding_chunks_emb_[a-f0-9]{16}$/.test(name) ||
        /^embedding_vec_emb_[a-f0-9]{16}$/.test(name))

    for (const name of tables.filter(name => name.startsWith('embedding_chunks_'))) {
      db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`)
    }
    for (const name of tables.filter(name => name.startsWith('embedding_vec_'))) {
      db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`)
    }

    db.exec('DROP TABLE IF EXISTS embedding_index_state')
    db.exec('DROP TABLE IF EXISTS embedding_models')
    db.exec(`
      CREATE TABLE embedding_models (
        model TEXT NOT NULL,
        variant TEXT NOT NULL,
        table_key TEXT NOT NULL UNIQUE,
        dimensions INTEGER NOT NULL,
        base_url TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        last_indexed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (model, variant)
      );
    `)
    db.exec(`
      CREATE TABLE embedding_index_state (
        model TEXT NOT NULL,
        variant TEXT NOT NULL,
        note_id TEXT NOT NULL,
        revision_id TEXT,
        content_hash TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (model, variant, note_id)
      );
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_embedding_state_model ON embedding_index_state(model, variant)')
  }
}
