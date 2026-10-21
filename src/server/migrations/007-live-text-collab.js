export const migration007LiveTextCollab = {
  version: 7,
  name: 'live-text-collab',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_text_docs (
        note_id TEXT PRIMARY KEY,
        update_data BLOB NOT NULL,
        base_revision_id TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `)
  }
}
