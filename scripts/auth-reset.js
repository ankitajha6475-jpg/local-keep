#!/usr/bin/env node
// Reset a Local Keep account password and print a one-time temporary password.
// Usage: npm run auth:reset -- <username>
import path from 'path'
import { fileURLToPath } from 'url'
import { openDatabase, runMigrations } from '../src/server/db.js'
import { createBaseSchema } from '../src/server/schema.js'
import { createImageStore } from '../src/server/images.js'
import { createSessionStore } from '../src/server/sessionStore.js'
import { createUserService } from '../src/server/services/users.js'
import { temporaryPassword } from '../src/server/auth/passwords.js'
import { migration001NoteThreads } from '../src/server/migrations/001-note-threads.js'
import { migration002RelationshipsAndTags } from '../src/server/migrations/002-relationships-and-tags.js'
import { migration003ApiTokens } from '../src/server/migrations/003-api-tokens.js'
import { migration004MultiuserAuth } from '../src/server/migrations/004-multiuser-auth.js'
import { migration005Embeddings } from '../src/server/migrations/005-embeddings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.LOCAL_KEEP_DATA_DIR
  ? path.resolve(process.env.LOCAL_KEEP_DATA_DIR)
  : path.join(__dirname, '..', 'data')

const username = process.argv[2]
if (!username) {
  console.error('Usage: npm run auth:reset -- <username>')
  process.exit(2)
}

const db = openDatabase(path.join(dataDir, 'local-keep.db'))
createBaseSchema(db)
runMigrations({
  db,
  migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens, migration004MultiuserAuth, migration005Embeddings],
  backupDir: path.join(dataDir, 'backups'),
  context: { imageStore: createImageStore({ imagesDir: path.join(dataDir, 'images') }) }
})

const users = createUserService({ db })
const sessions = createSessionStore({ db, dataDir })
try {
  const user = users.getByUsername(username)
  if (!user) {
    console.error(`User not found: ${username}`)
    const list = users.list().map(item => item.username)
    if (list.length) console.error(`Known users: ${list.join(', ')}`)
    process.exitCode = 1
  } else {
    const password = temporaryPassword()
    await users.resetPassword(user.id, password)
    sessions.revokeUser(user.id)
    console.log(`Password reset for @${user.username}`)
    console.log(`Temporary password (shown once): ${password}`)
    console.log('Sign in and set a new password immediately.')
  }
} finally {
  db.close()
}
