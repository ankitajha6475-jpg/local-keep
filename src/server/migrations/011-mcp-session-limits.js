export const migration011McpSessionLimits = {
  version: 11,
  name: 'mcp-session-limits',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        max_write_sessions INTEGER NOT NULL DEFAULT 5,
        max_read_sessions INTEGER NOT NULL DEFAULT 8,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO mcp_settings
        (id, max_write_sessions, max_read_sessions, updated_at)
      VALUES
        (1, 5, 8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `)
  }
}
