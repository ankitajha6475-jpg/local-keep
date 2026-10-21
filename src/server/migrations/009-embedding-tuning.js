export const migration009EmbeddingTuning = {
  version: 9,
  name: 'embedding-tuning',
  up(db) {
    for (const ddl of [
      'ALTER TABLE embedding_settings ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 64',
      'ALTER TABLE embedding_settings ADD COLUMN concurrency INTEGER NOT NULL DEFAULT 2',
      'ALTER TABLE embedding_settings ADD COLUMN max_batch_chars INTEGER NOT NULL DEFAULT 80000',
      'ALTER TABLE embedding_settings ADD COLUMN note_concurrency INTEGER NOT NULL DEFAULT 1'
    ]) {
      try { db.exec(ddl) } catch (_) { /* already present */ }
    }
  }
}
