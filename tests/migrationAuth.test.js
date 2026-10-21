import test from 'node:test'
import assert from 'node:assert/strict'
import { createLegacyContext } from './helpers/testDb.js'
import { legacyHash } from '../src/server/auth/passwords.js'

test('migration 4 creates an admin from the legacy password and maps sessions', () => {
  const ctx = createLegacyContext()
  try {
    const oldHash = legacyHash('old-password')
    ctx.db.prepare('INSERT INTO password (id, hash) VALUES (1, ?)').run(oldHash)
    ctx.db.prepare(
      'INSERT INTO sessions (sessionId, hash, expiresAt) VALUES (?, ?, ?)'
    ).run('legacy-session', oldHash, Date.now() + 60_000)

    const migrated = ctx.migrate()
    assert.deepEqual(migrated.applied, [1, 2, 3, 4, 5])

    const admin = ctx.db.prepare('SELECT * FROM users').get()
    assert.equal(admin.username, 'admin')
    assert.equal(admin.display_name, 'Administrator')
    assert.equal(admin.role, 'admin')
    assert.equal(admin.password_hash, `legacy:${oldHash}`)

    const session = ctx.db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get('legacy-session')
    assert.equal(session.user_id, admin.id)
  } finally {
    ctx.cleanup()
  }
})
