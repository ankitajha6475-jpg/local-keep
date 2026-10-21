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
import { createEmbeddingService } from './src/server/services/embeddings.js'
import { createTextCollabService } from './src/server/services/textCollab.js'
import { createMcpEditingService } from './src/server/services/mcpEditing.js'
import { createMcpServer } from './src/mcp/createServer.js'
import { migration001NoteThreads } from './src/server/migrations/001-note-threads.js'
import { migration002RelationshipsAndTags } from './src/server/migrations/002-relationships-and-tags.js'
import { migration003ApiTokens } from './src/server/migrations/003-api-tokens.js'
import { migration004MultiuserAuth } from './src/server/migrations/004-multiuser-auth.js'
import { migration005Embeddings } from './src/server/migrations/005-embeddings.js'
import { migration006OptionalRerank } from './src/server/migrations/006-optional-rerank.js'
import { migration007LiveTextCollab } from './src/server/migrations/007-live-text-collab.js'
import { migration008EmbeddingVariants } from './src/server/migrations/008-embedding-variants.js'
import { migration009EmbeddingTuning } from './src/server/migrations/009-embedding-tuning.js'
import { migration010TokenAdmin } from './src/server/migrations/010-token-admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.LOCAL_KEEP_DATA_DIR
  ? path.resolve(process.env.LOCAL_KEEP_DATA_DIR)
  : path.join(__dirname, 'data')

const db = openDatabase(path.join(dataDir, 'local-keep.db'))
createBaseSchema(db)
const imageStore = createImageStore({ imagesDir: path.join(dataDir, 'images') })
runMigrations({
  db,
  migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens, migration004MultiuserAuth, migration005Embeddings, migration006OptionalRerank, migration007LiveTextCollab, migration008EmbeddingVariants, migration009EmbeddingTuning, migration010TokenAdmin],
  backupDir: path.join(dataDir, 'backups'),
  context: { imageStore }
})

const bus = createEventBus()
const imageRefs = createImageRefService({ db, imageStore })
const tags = createTagService({ db })
const links = createLinkService({ db })
const embeddings = createEmbeddingService({ db, dataDir, tags })
const revisions = createRevisionService({ db, imageStore, imageRefs, bus, tags, links, embeddings })
const notes = createNoteService({ db, revisions, imageRefs, bus, tags, links, embeddings })
const renders = createRenderService({ db, imageRefs, bus })
const search = createSearchService({ db, notes, revisions, tags, renders, embeddings })
const textCollab = createTextCollabService({ db })
embeddings.initialize()

const mcpEditing = createMcpEditingService({
  db,
  notes,
  revisions,
  textCollab,
  maxReads: Number(process.env.LOCAL_KEEP_MCP_MAX_READS || 8),
  onOpen() {},
  onClose(session, { discard }) {
    // stdio cannot see browser/HTTP presence, so never erase a dirty shared
    // draft from this process. Clean drafts can be removed safely.
    const removed = textCollab.discardIfClean(session.noteId)
    return { discarded: removed, remaining: null, discard_ignored: !!discard && !removed }
  },
  onSaved() {},
  onDraftChange() {}
})

const services = { db, notes, revisions, tags, links, renders, search, embeddings, imageStore, textCollab, mcpEditing }
const baseUrl = (process.env.LOCAL_KEEP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')

void serveStdio(() => createMcpServer({
  services,
  authInfo: { clientId: 'mcp:stdio', actor: 'mcp:stdio', scopes: ['read', 'write'] },
  baseUrl,
  requestRender: async () => ({ requested: false, reason: 'no-client' })
}))
console.error('Local Keep MCP stdio adapter running')
