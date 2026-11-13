export const migration016UnifiedAccountsTagWhitelist = {
  version: 16,
  name: 'unified-accounts-tag-whitelist',
  up(db) {
    // 1. Add tag_whitelist to users
    const userCols = new Set(db.prepare("PRAGMA table_info('users')").all().map(c => c.name))
    if (!userCols.has('tag_whitelist')) {
      db.exec('ALTER TABLE users ADD COLUMN tag_whitelist TEXT')
      // Backfill existing member users with '*' so they retain access
      db.exec("UPDATE users SET tag_whitelist = '*' WHERE role != 'admin' AND tag_whitelist IS NULL")
    }

    // 2. Add user_id to api_tokens
    const tokenCols = new Set(db.prepare("PRAGMA table_info('api_tokens')").all().map(c => c.name))
    if (!tokenCols.has('user_id')) {
      db.exec('ALTER TABLE api_tokens ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE')
    }

    // 3. Resolve user IDs for backfill
    const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin' LIMIT 1").get()
    const alexUser = db.prepare("SELECT id FROM users WHERE username = 'alex' LIMIT 1").get()
    const fallbackUserId = adminUser?.id || db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get()?.id

    if (adminUser?.id) {
      db.prepare(`
        UPDATE api_tokens
        SET user_id = ?
        WHERE (created_by = 'user:admin' OR created_by LIKE '%admin%') AND user_id IS NULL
      `).run(adminUser.id)
    }

    const defaultOwnerId = alexUser?.id || fallbackUserId
    if (defaultOwnerId) {
      db.prepare(`
        UPDATE api_tokens
        SET user_id = ?
        WHERE user_id IS NULL
      `).run(defaultOwnerId)
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)')
  }
}
