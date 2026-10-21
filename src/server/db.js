import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Open the SQLite database with the pragmas Local Keep relies on.
 * WAL keeps readers working while a writer commits; foreign keys are required
 * for revision/tile cascades; busy_timeout makes multi-process (optional MCP
 * stdio) access tolerable.
 */
export function openDatabase(dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(dbFile, { allowExtension: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

export function ensureSchemaMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

export function getSchemaVersion(db) {
  ensureSchemaMigrations(db)
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  return row?.version ?? 0
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Create a consistent on-disk snapshot before a migration. `VACUUM INTO`
 * cannot run inside a transaction, so this is called first.
 */
export function backupDatabase(db, backupPath) {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 })
  db.exec(`VACUUM INTO ${sqlString(backupPath)}`)
  return backupPath
}

function tableExists(db, name) {
  const row = db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name)
  return !!row
}

/**
 * Apply migrations in order. Each migration is `{ version, name, up(db, ctx) }`.
 * The whole batch runs in one `BEGIN IMMEDIATE` transaction. If the current
 * database already has notes, a backup is taken before the first migration.
 *
 * @returns {{from:number,target:number,applied:number[],backupPath:string|null}}
 */
export function runMigrations({ db, migrations, backupDir = null, context = {} }) {
  ensureSchemaMigrations(db)
  const from = getSchemaVersion(db)
  const ordered = [...migrations].sort((a, b) => a.version - b.version)
  const pending = ordered.filter(m => m.version > from)

  if (pending.length === 0) {
    return { from, target: from, applied: [], backupPath: null }
  }

  let backupPath = null
  const hasNotes = tableExists(db, 'notes') &&
    (db.prepare('SELECT COUNT(*) AS count FROM notes').get()?.count || 0) > 0

  if (hasNotes && backupDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupPath = path.join(backupDir, `pre-migration-v${pending[0].version}-${stamp}.db`)
    backupDatabase(db, backupPath)
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const migration of pending) {
      migration.up(db, { ...context, from, backupPath })
      db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString())
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch (_) { /* already rolled back */ }
    error.migrationBackupPath = backupPath
    throw error
  }

  return {
    from,
    target: pending[pending.length - 1].version,
    applied: pending.map(m => m.version),
    backupPath
  }
}

export { tableExists }
