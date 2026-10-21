export const migration006OptionalRerank = {
  version: 6,
  name: 'optional-rerank',
  up(db) {
    for (const column of [
      'ALTER TABLE embedding_settings ADD COLUMN rerank_enabled INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE embedding_settings ADD COLUMN rerank_base_url TEXT',
      'ALTER TABLE embedding_settings ADD COLUMN rerank_api_key_encrypted TEXT',
      'ALTER TABLE embedding_settings ADD COLUMN rerank_model TEXT',
      'ALTER TABLE embedding_settings ADD COLUMN rerank_top_n INTEGER NOT NULL DEFAULT 20'
    ]) {
      try { db.exec(column) } catch (_) { /* already present */ }
    }
  }
}
