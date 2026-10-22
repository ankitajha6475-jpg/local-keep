export const migration012AppSettings = {
  version: 12,
  name: 'app-settings',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }
}
