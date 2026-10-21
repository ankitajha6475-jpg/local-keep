#!/usr/bin/env node
// Optional stdio MCP adapter. Prefer the embedded HTTP endpoint (/mcp) when the
// app server is running; stdio writes go straight to SQLite and cannot push
// WebSocket updates to an open browser.
import path from 'path'
import { fileURLToPath } from 'url'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { openDatabase, runMigrations } from './src/server/db.js'
import { createBaseSchema } from './src/server/schema.js'
import { createImageStore } from './src/server/images.js'
import { createEventBus } from './src/server/events.js'
import { createImageRefService } from './src/server/services/imageRefs.js'
import { createTagService } from './src/server/services/tags.js'
import { createLinkService } from './src/server/services/links.js'
import { createRevisionService } from './src/server/services/revisions.js'
import { createNoteService } from './src/server/services/notes.js'
import { createRenderService } from './src/server/services/renders.js'
import { createSearchService } from './src/server/services/search.js'
import { createMcpServer } from './src/mcp/createServer.js'
import { migration001NoteThreads } from './src/server/migrations/001-note-threads.js'
import { migration002RelationshipsAndTags } from './src/server/migrations/002-relationships-and-tags.js'
import { migration003ApiTokens } from './src/server/migrations/003-api-tokens.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.LOCAL_KEEP_DATA_DIR
  ? path.resolve(process.env.LOCAL_KEEP_DATA_DIR)
  : path.join(__dirname, 'data')

const db = openDatabase(path.join(dataDir, 'local-keep.db'))
createBaseSchema(db)
const imageStore = createImageStore({ imagesDir: path.join(dataDir, 'images') })
runMigrations({
  db,
  migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens],
  backupDir: path.join(dataDir, 'backups'),
  context: { imageStore }
})

const bus = createEventBus()
const imageRefs = createImageRefService({ db, imageStore })
const tags = createTagService({ db })
const links = createLinkService({ db })
const revisions = createRevisionService({ db, imageStore, imageRefs, bus, tags, links })
const notes = createNoteService({ db, revisions, imageRefs, bus, tags, links })
const renders = createRenderService({ db, imageRefs, bus })
const search = createSearchService({ db, notes, revisions, tags, renders })

const services = { db, notes, revisions, tags, links, renders, search, imageStore }
const baseUrl = (process.env.LOCAL_KEEP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')

void serveStdio(() => createMcpServer({
  services,
  authInfo: { clientId: 'mcp:stdio', scopes: ['read', 'write'] },
  baseUrl,
  requestRender: async () => ({ requested: false, reason: 'no-client' })
}))
console.error('Local Keep MCP stdio adapter running')
