/**
 * Base tables that existed before note threads. Migrations add the revision
 * layer on top, so fresh and legacy databases share the same starting point.
 */
export function createBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hash TEXT NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sessionId TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      type TEXT DEFAULT 'text',
      canvasData TEXT,
      thumbnail TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  for (const col of [
    "ALTER TABLE notes ADD COLUMN type TEXT DEFAULT 'text'",
    "ALTER TABLE notes ADD COLUMN canvasData TEXT",
    "ALTER TABLE notes ADD COLUMN thumbnail TEXT"
  ]) {
    try { db.exec(col) } catch (_) { /* column already exists */ }
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id, title, content, canvas_text,
      tokenize='porter unicode61'
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS image_refs (
      image_hash TEXT NOT NULL,
      note_id TEXT NOT NULL,
      PRIMARY KEY (image_hash, note_id)
    );
  `)

  ensureFtsCanvasText(db)
}

export function ensureFtsCanvasText(db) {
  try {
    const columns = db.prepare("PRAGMA table_info('notes_fts')").all().map(c => c.name)
    if (!columns.includes('canvas_text')) {
      db.exec('DROP TABLE IF EXISTS notes_fts')
      db.exec(`
        CREATE VIRTUAL TABLE notes_fts USING fts5(
          note_id, title, content, canvas_text,
          tokenize='porter unicode61'
        );
      `)
      return true
    }
  } catch (_) { /* table may not exist yet */ }
  return false
}
