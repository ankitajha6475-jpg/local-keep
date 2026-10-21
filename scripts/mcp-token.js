#!/usr/bin/env node
// Manage Local Keep MCP tokens without the web UI.
// Usage:
//   node scripts/mcp-token.js create "Claude Desktop" [scopes] [expiresDays]
//   node scripts/mcp-token.js list
//   node scripts/mcp-token.js revoke <id>
import path from 'path'
import { fileURLToPath } from 'url'
import { openDatabase, runMigrations } from '../src/server/db.js'
import { createBaseSchema } from '../src/server/schema.js'
import { createImageStore } from '../src/server/images.js'
import { createTokenService } from '../src/server/services/tokens.js'
import { migration001NoteThreads } from '../src/server/migrations/001-note-threads.js'
import { migration002RelationshipsAndTags } from '../src/server/migrations/002-relationships-and-tags.js'
import { migration003ApiTokens } from '../src/server/migrations/003-api-tokens.js'
import { migration004MultiuserAuth } from '../src/server/migrations/004-multiuser-auth.js'
import { migration005Embeddings } from '../src/server/migrations/005-embeddings.js'
import { migration006OptionalRerank } from '../src/server/migrations/006-optional-rerank.js'
import { migration007LiveTextCollab } from '../src/server/migrations/007-live-text-collab.js'
import { migration008EmbeddingVariants } from '../src/server/migrations/008-embedding-variants.js'
import { migration009EmbeddingTuning } from '../src/server/migrations/009-embedding-tuning.js'
import { migration010TokenAdmin } from '../src/server/migrations/010-token-admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.LOCAL_KEEP_DATA_DIR
  ? path.resolve(process.env.LOCAL_KEEP_DATA_DIR)
  : path.join(__dirname, '..', 'data')

const db = openDatabase(path.join(dataDir, 'local-keep.db'))
createBaseSchema(db)
runMigrations({
  db,
  migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens, migration004MultiuserAuth, migration005Embeddings, migration006OptionalRerank, migration007LiveTextCollab, migration008EmbeddingVariants, migration009EmbeddingTuning, migration010TokenAdmin],
  backupDir: path.join(dataDir, 'backups'),
  context: { imageStore: createImageStore({ imagesDir: path.join(dataDir, 'images') }) }
})
const tokens = createTokenService({ db })

const [command, ...args] = process.argv.slice(2)
try {
  if (command === 'create') {
    const name = args[0]
    const scopes = args[1] || 'read,write'
    const days = Number(args[2] || 0)
    const expiresAt = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null
    const created = tokens.create({ name, scopes, expiresAt, createdBy: 'cli' })
    console.log(`Created token "${created.record.name}" (${created.record.id})`)
    console.log(`Scopes: ${created.record.scopes.join(',')}`)
    if (created.record.expiresAt) console.log(`Expires: ${created.record.expiresAt}`)
    console.log(`Token (shown once): ${created.token}`)
  } else if (command === 'list') {
    const rows = tokens.list()
    if (rows.length === 0) console.log('No tokens.')
    for (const row of rows) {
      console.log(`${row.id}\t${row.name}\t${row.scopes.join(',')}\tcreated=${row.createdAt}\texpires=${row.expiresAt || '-'}\tcreatedBy=${row.createdBy || '-'}\tlastUsed=${row.lastUsedAt || '-'}\trevoked=${row.revokedAt || '-'}`)
    }
  } else if (command === 'revoke') {
    const id = args[0]
    if (!id) throw new Error('Usage: revoke <id>')
    console.log(JSON.stringify(tokens.revoke(id)))
  } else {
    console.log('Usage:')
    console.log('  node scripts/mcp-token.js create "<name>" [scopes] [expiresDays]')
    console.log('  node scripts/mcp-token.js list')
    console.log('  node scripts/mcp-token.js revoke <id>')
    process.exitCode = 1
  }
} catch (error) {
  console.error('Token command failed:', error.message)
  process.exitCode = 1
} finally {
  db.close()
}
