import crypto from 'crypto'

export const migration004MultiuserAuth = {
  version: 4,
  name: 'multiuser-auth',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT,
        disabled_at TEXT
      );
    `)

    try {
      db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT')
    } catch (_) { /* already present */ }
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)')

    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
    if (userCount > 0) return

    // Preserve an existing single-password install by creating the first admin
    // with the legacy hash. It is upgraded to scrypt on the first login.
    const legacy = db.prepare('SELECT hash FROM password WHERE id = 1').get()
    if (!legacy?.hash) return

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO users
        (id, username, display_name, password_hash, role, must_change_password, created_at, updated_at)
      VALUES (?, 'admin', 'Administrator', ?, 'admin', 0, ?, ?)
    `).run(id, `legacy:${legacy.hash}`, now, now)
    db.prepare('UPDATE sessions SET user_id = ? WHERE user_id IS NULL').run(id)
  }
}
