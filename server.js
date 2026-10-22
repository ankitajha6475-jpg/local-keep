import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import multer from 'multer'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createSessionStore } from './src/server/sessionStore.js'
import { openDatabase, runMigrations } from './src/server/db.js'
import { createBaseSchema } from './src/server/schema.js'
import {
  ALLOWED_IMAGE_TYPES,
  MIME_TO_EXT,
  EXT_TO_MIME,
  createImageStore,
  imageMimeForExt
} from './src/server/images.js'
import { createImageRefService } from './src/server/services/imageRefs.js'
import { createRevisionService } from './src/server/services/revisions.js'
import { createNoteService } from './src/server/services/notes.js'
import { createRenderService } from './src/server/services/renders.js'
import { createTagService } from './src/server/services/tags.js'
import { createLinkService } from './src/server/services/links.js'
import { createSearchService } from './src/server/services/search.js'
import { createEmbeddingService } from './src/server/services/embeddings.js'
import { createTokenService } from './src/server/services/tokens.js'
import { createMcpSettingsService } from './src/server/services/mcpSettings.js'
import { createUiSettingsService } from './src/server/services/uiSettings.js'
import { loadConfig } from './src/server/config.js'
import { createUserService } from './src/server/services/users.js'
import { validatePassword, temporaryPassword } from './src/server/auth/passwords.js'
import { createMcpServer } from './src/mcp/createServer.js'
import { createEventBus, EVENTS } from './src/server/events.js'
import { createTextCollabService } from './src/server/services/textCollab.js'
import { createMcpEditingService } from './src/server/services/mcpEditing.js'
import { bytesToBase64, base64ToBytes } from './src/shared/base64.js'
import {
  extractCanvasText,
  indexNote,
  rebuildFts
} from './src/server/fts.js'
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
import { migration011McpSessionLimits } from './src/server/migrations/011-mcp-session-limits.js'
import { migration012AppSettings } from './src/server/migrations/012-app-settings.js'
import { migration013NoteColor } from './src/server/migrations/013-note-color.js'

import debugLib from 'debug'
const log = debugLib('local-keep:server')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

// Always default to port 5173; tests/deployments may override.
const PORT = Number(process.env.PORT || 5173)
const DATA_DIR = process.env.LOCAL_KEEP_DATA_DIR
  ? path.resolve(process.env.LOCAL_KEEP_DATA_DIR)
  : path.join(__dirname, 'data')
const IMAGES_DIR = path.join(DATA_DIR, 'images')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const NOTES_FILE = path.join(DATA_DIR, 'notes.json')
const PASSWORD_FILE = path.join(DATA_DIR, 'password.json')
const DB_FILE = path.join(DATA_DIR, 'local-keep.db')
const CHECKPOINT_MS = Number(process.env.LOCAL_KEEP_CHECKPOINT_MS || 5 * 60 * 1000)

const imageStore = createImageStore({ imagesDir: IMAGES_DIR })

// WebSocket clients storage: Map of token -> Set of WebSocket connections
const clients = new Map()

// Collaboration: per-note state for real-time sync
const noteStates = new Map()  // noteId -> { elements, files, sessions, pendingPersist, _thumbnail }
const textSessions = new Map() // noteId -> Set<WebSocket> for live text drafts
const notePresence = new Map() // noteId -> Map<WebSocket, { user, kinds:Set<'text'|'canvas'> }>
const mcpPresence = new Map() // noteId -> Map<sessionId, { user, kind:'mcp' }>

function getOrCreateNoteState(noteId) {
  if (!noteStates.has(noteId)) {
    noteStates.set(noteId, {
      elements: new Map(),
      files: {},
      sessions: new Set(),
      pendingPersist: null,
      _thumbnail: null,
      lastCheckpointAt: 0,
      forceCheckpoint: false
    })
  }
  return noteStates.get(noteId)
}

function loadNoteState(noteId) {
  const state = getOrCreateNoteState(noteId)
  if (state.elements.size > 0) return state  // already loaded
  const note = db.prepare('SELECT canvasData, thumbnail, last_checkpoint_at FROM notes WHERE id = ?').get(noteId)
  if (note && note.last_checkpoint_at) {
    state.lastCheckpointAt = new Date(note.last_checkpoint_at).getTime() || 0
  }
  if (note && note.canvasData) {
    try {
      const data = JSON.parse(note.canvasData)
      if (data.elements) {
        for (const el of data.elements) {
          state.elements.set(el.id, el)
        }
      }
      if (data.files) state.files = data.files
    } catch (e) { /* ignore parse errors */ }
  }
  if (note && note.thumbnail) {
    state._thumbnail = note.thumbnail
  }
  // Resolve hash references to serveable URLs for clients. Also hydrate any
  // legacy entries that pre-date this fix (which stored only {hash, ext,
  // mimeType}) by reconstituting the dataURL Excalidraw needs to render.
  for (const [fileId, fileData] of Object.entries(state.files)) {
    if (!fileData) continue
    if (fileData.hash && !fileData.dataURL) {
      const ext = fileData.ext || MIME_TO_EXT[fileData.mimeType] || 'bin'
      const filePath = path.join(IMAGES_DIR, `${fileData.hash}.${ext}`)
      try {
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath)
          const mimeType = fileData.mimeType || EXT_TO_MIME[ext] || 'application/octet-stream'
          fileData.dataURL = `data:${mimeType};base64,${buf.toString('base64')}`
        }
      } catch (e) { /* leave entry as-is if disk read fails */ }
    }
    if (fileData.hash) {
      const ext = fileData.ext || MIME_TO_EXT[fileData.mimeType] || 'bin'
      state.files[fileId] = { ...fileData, url: `/api/images/${fileData.hash}.${ext}` }
    }
  }
  return state
}

function applyDelta(state, deltaElements, serverTs) {
  let changed = false
  for (const el of deltaElements) {
    el._collab_ts = serverTs
    const existing = state.elements.get(el.id)
    if (!existing || (existing._collab_ts || 0) <= serverTs) {
      if (el.isDeleted) {
        state.elements.delete(el.id)
      } else {
        state.elements.set(el.id, el)
      }
      changed = true
    }
  }
  return changed
}

// Merge incoming files from a delta into note state, extracting base64 to disk.
// Preserves Excalidraw-required fields (id, mimeType, dataURL, created) and
// augments with hash/ext for content-addressed deduplication and serving.
function mergeFiles(state, incomingFiles) {
  if (!incomingFiles || typeof incomingFiles !== 'object') return
  for (const [fileId, fileData] of Object.entries(incomingFiles)) {
    if (fileData && fileData.dataURL) {
      // Client sent raw Excalidraw file with dataURL — extract to disk
      const stored = imageStore.storeImageFromDataURL(fileData.dataURL)
      if (stored) {
        state.files[fileId] = { ...fileData, ...stored }
      }
    } else if (fileData && fileData.hash) {
      // Already a hash reference (from another server session)
      state.files[fileId] = fileData
    }
  }
}

function persistNoteState(noteId) {
  const state = noteStates.get(noteId)
  if (!state) return
  const noteRow = db.prepare('SELECT id, title, content, thumbnail, archived_at FROM notes WHERE id = ?').get(noteId)
  if (!noteRow || noteRow.archived_at) {
    clearNoteState(noteId)
    return
  }
  const elements = [...state.elements.values()]
  const cleanElements = elements.map(({ _collab_ts, ...el }) => el)

  // Ensure any file entries still carrying only a dataURL are extracted to disk.
  // file entries already extracted at delta time keep their dataURL (needed by
  // Excalidraw to render), so we augment without dropping it.
  for (const [fileId, fileData] of Object.entries(state.files || {})) {
    if (fileData && fileData.dataURL && !fileData.hash) {
      const stored = imageStore.storeImageFromDataURL(fileData.dataURL)
      if (stored) state.files[fileId] = { ...fileData, ...stored }
    }
  }

  const data = JSON.stringify({ elements: cleanElements, files: state.files || {} })
  const updatedAt = new Date().toISOString()
  // A persist without a freshly generated thumbnail must not erase the last
  // good cover. The client only sends thumbnails on actual scene deltas.
  let thumbnail = state._thumbnail || noteRow.thumbnail || null
  if (!thumbnail) {
    // Recover a missing cover from the latest rendered page (legacy boards
    // whose thumbnail was previously cleared by a checkpoint).
    try {
      const manifest = renderService?.latest?.(noteId)
      thumbnail = manifest?.tiles?.[0]?.url || null
    } catch (_) { /* best effort */ }
  }

  db.prepare('UPDATE notes SET canvasData = ?, thumbnail = ?, updatedAt = ? WHERE id = ?')
    .run(data, thumbnail, updatedAt, noteId)
  state._thumbnail = null

  imageRefs.syncHeadRefs(noteId, noteRow.content || '', data)

  try {
    indexNote(db, {
      noteId,
      title: noteRow.title || '',
      content: noteRow.content || '',
      canvasText: extractCanvasText(data)
    })
  } catch (e) { /* ignore FTS errors */ }

  // Checkpoint only at meaningful boundaries (leave/manual/interval), never on
  // every 500 ms delta. The revision service skips unchanged canvases.
  const now = Date.now()
  const due = state.forceCheckpoint ||
    !state.lastCheckpointAt ||
    now - state.lastCheckpointAt >= CHECKPOINT_MS
  if (due) {
    try {
      const revision = revisions.checkpointCanvas({
        noteId,
        canvasData: data,
        thumbnail,
        actor: state.lastActor || 'ui',
        force: state.forceCheckpoint
      })
      // Throttle further attempts even when the scene is unchanged.
      state.lastCheckpointAt = now
      if (revision) {
        log('checkpoint %s -> revision %s', noteId, revision.revision_no)
      }
    } catch (error) {
      console.error('Whiteboard checkpoint failed:', error.message)
    } finally {
      state.forceCheckpoint = false
    }
  }

  broadcastNotes()
}

function schedulePersist(noteId) {
  const state = noteStates.get(noteId)
  if (!state) return
  clearTimeout(state.pendingPersist)
  state.pendingPersist = setTimeout(() => persistNoteState(noteId), 500)
}

function broadcastToNote(noteId, message, excludeWs = null) {
  const state = noteStates.get(noteId)
  if (!state) return
  for (const ws of state.sessions) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { mode: 0o700 })
}

// Open SQLite Database connection and create the pre-revision base schema.
// Versioned migrations add the note-thread/revision layer below.
const db = openDatabase(DB_FILE)
createBaseSchema(db)

// Session store: opaque, server-stored sessions signed via HMAC. Used for
// persistent auth (cookie) and validated for both REST (cookie/X-Auth-Token)
// and WebSocket (?token=) flows.
const sessions = createSessionStore({ db, dataDir: DATA_DIR })

// Compatibility wrapper for the whiteboard persist path; the canonical
// implementation lives in the image-ref service.
function syncImageRefs(noteId, content, canvasData) {
  imageRefs.syncHeadRefs(noteId, content, canvasData)
}

// Automatic Data Migration from JSON to SQLite
try {
  // 1. Password migration
  const pwdCheck = db.prepare('SELECT hash FROM password WHERE id = 1').get()
  if (!pwdCheck && fs.existsSync(PASSWORD_FILE)) {
    console.log('🔄 Migrating password.json to SQLite...')
    const pwdData = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'))
    if (pwdData && pwdData.hash) {
      db.prepare('INSERT INTO password (id, hash) VALUES (1, ?)').run(pwdData.hash)
      console.log('✓ Hashed password migrated successfully')
    }
    // Rename original file safely
    fs.renameSync(PASSWORD_FILE, `${PASSWORD_FILE}.bak`)
  }

  // 2. Notes migration
  const notesCountRow = db.prepare('SELECT COUNT(*) as count FROM notes').get()
  if (notesCountRow.count === 0 && fs.existsSync(NOTES_FILE)) {
    console.log('🔄 Migrating notes.json to SQLite...')
    const notesData = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'))
    if (Array.isArray(notesData)) {
      const insert = db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      for (const note of notesData) {
        insert.run(note.id, note.title || '', note.content || '', note.createdAt, note.updatedAt)
      }
      console.log(`✓ Migrated ${notesData.length} notes successfully`)
    }
    // Rename original file safely
    fs.renameSync(NOTES_FILE, `${NOTES_FILE}.bak`)
  }
} catch (e) {
  console.error('⚠️ Data migration error:', e.message)
}

// Versioned schema migrations (note threads/revisions). This runs after the
// legacy JSON migration so first-boot upgrades include those notes.
try {
  const migration = runMigrations({
    db,
    migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens, migration004MultiuserAuth, migration005Embeddings, migration006OptionalRerank, migration007LiveTextCollab, migration008EmbeddingVariants, migration009EmbeddingTuning, migration010TokenAdmin, migration011McpSessionLimits, migration012AppSettings, migration013NoteColor],
    backupDir: BACKUPS_DIR,
    context: { imageStore }
  })
  if (migration.backupPath) {
    console.log(`💾 Pre-migration backup: ${migration.backupPath}`)
  }
  if (migration.applied.length > 0) {
    console.log(`✓ Schema migrated to version ${migration.target}`)
  }
} catch (error) {
  console.error('💥 Fatal: schema migration failed:', error.message)
  if (error.migrationBackupPath) {
    console.error(`   Backup kept at: ${error.migrationBackupPath}`)
  }
  process.exit(1)
}

// Hydrate sessions after migration 4 has ensured sessions.user_id exists.
sessions.hydrate()
const users = createUserService({ db })

// Shared services. Route/WS handlers below are thin adapters over these.
const bus = createEventBus()
const imageRefs = createImageRefService({ db, imageStore })
const tags = createTagService({ db })
const links = createLinkService({ db })
const tokens = createTokenService({ db })
const mcpSettings = createMcpSettingsService({ db })
const appConfig = loadConfig()
const uiSettings = createUiSettingsService({
  db,
  defaults: appConfig.ui,
  filePath: appConfig.filePath,
  fileError: appConfig.fileError
})
const embeddings = createEmbeddingService({ db, dataDir: DATA_DIR, tags })
const revisions = createRevisionService({ db, imageStore, imageRefs, bus, tags, links, embeddings })
const textCollab = createTextCollabService({ db })
const notesService = createNoteService({ db, revisions, imageRefs, bus, tags, links, embeddings })
const renderService = createRenderService({ db, imageRefs, bus })
const mcpEditing = createMcpEditingService({
  db,
  notes: notesService,
  revisions,
  textCollab,
  ttlMs: Number(process.env.LOCAL_KEEP_MCP_EDIT_TTL_MS || 30 * 60 * 1000),
  getLimits: () => mcpSettings.get(),
  onOpen(session) {
    addMcpPresence(session.noteId, session)
  },
  onClose(session, { discard }) {
    removeMcpPresence(session.noteId, session.id)
    const remaining = notePresenceCount(session.noteId)
    let discarded = false
    if (remaining === 0) {
      if (discard) {
        textCollab.discard(session.noteId)
        discarded = true
      } else {
        try { textCollab.discardIfClean(session.noteId) } catch (_) { /* best effort */ }
      }
    }
    return {
      discarded,
      remaining,
      draftKept: textCollab.hasDraft(session.noteId)
    }
  },
  onDraftChange(noteId, update) {
    if (!update?.length) return
    broadcastToTextSessions(noteId, {
      type: 'text-update',
      noteId,
      update: bytesToBase64(update)
    })
  }
})

const searchService = createSearchService({
  db,
  notes: notesService,
  revisions,
  tags,
  renders: renderService,
  embeddings
})
embeddings.initialize()

const pendingRenderRequests = new Map()
function requestWhiteboardRender(noteId, timeoutMs = 20000) {
  const state = noteStates.get(noteId)
  if (!state || state.sessions.size === 0) {
    return Promise.resolve({ requested: false, reason: 'no-client' })
  }
  const requestId = randomUUID()
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingRenderRequests.delete(requestId)
      resolve({ requested: true, requestId, timedOut: true, manifest: renderService.latest(noteId) })
    }, Math.max(1000, Math.min(60000, Number(timeoutMs) || 20000)))
    pendingRenderRequests.set(requestId, { resolve, timer, noteId })
    for (const session of state.sessions) {
      if (session.readyState === WebSocket.OPEN) {
        session.send(JSON.stringify({ type: 'render-request', noteId, requestId }))
      }
    }
  })
}

// Ensure FTS index is up to date
try {
  const ftsCount = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get()
  const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes').get()
  if (ftsCount.count !== notesCount.count) {
    console.log(`🔍 Rebuilding FTS index (${ftsCount.count} indexed, ${notesCount.count} notes)...`)
    const count = rebuildFts(db)
    console.log(`✓ FTS index rebuilt with ${count} notes`)
  } else {
    console.log(`✓ FTS index up to date (${ftsCount.count} notes indexed)`)
  }
} catch (e) {
  console.error('⚠️ FTS index error:', e.message)
}

// Ensure image_refs table is populated for existing notes
try {
  const refCount = db.prepare('SELECT COUNT(*) as count FROM image_refs').get()
  const noteCount = db.prepare('SELECT COUNT(*) as count FROM notes').get()
  if (refCount.count === 0 && noteCount.count > 0) {
    console.log(`🔍 Populating image_refs for ${noteCount.count} existing notes...`)
    const notes = db.prepare('SELECT id, content, canvasData FROM notes').all()
    for (const note of notes) {
      syncImageRefs(note.id, note.content || '', note.canvasData)
    }
    const newRefCount = db.prepare('SELECT COUNT(*) as count FROM image_refs').get()
    console.log(`✓ image_refs populated: ${newRefCount.count} references`)
  }
} catch (e) {
  console.error('⚠️ image_refs migration error:', e.message)
}

function getAllNotes() {
  return notesService.listNoteIndex({ includeArchived: true })
}

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Image upload middleware (max 20MB)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported image type'))
    }
  }
})

// Image routes
app.post('/api/images', checkAuth, imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' })
    const stored = imageStore.storeImageBuffer(req.file.buffer, req.file.mimetype)
    if (!stored) return res.status(400).json({ error: 'Unsupported image type' })
    res.json({
      hash: stored.hash,
      url: `/api/images/${stored.hash}.${stored.ext}`,
      mimeType: stored.mimeType
    })
  } catch (e) {
    console.error('Image upload error:', e)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/images/:filename', (req, res) => {
  const filename = req.params.filename
  // Validate filename to prevent path traversal
  if (!/^[a-f0-9]{16}\.[a-z]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  const filePath = path.join(IMAGES_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' })
  }
  const ext = path.extname(filename).slice(1)
  res.setHeader('Content-Type', imageMimeForExt(ext))
  res.sendFile(filePath)
})

// Image garbage collection: remove orphaned images not referenced by any note,
// revision, or whiteboard tile.
app.post('/api/images/cleanup', checkAuth, (req, res) => {
  try {
    const deletedFiles = imageRefs.cleanupImages()
    res.json({ success: true, deleted: deletedFiles.length, files: deletedFiles })
  } catch (e) {
    console.error('Image cleanup error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Broadcast notes to all authenticated clients
function broadcastNotes(excludeWs = null) {
  const notes = getAllNotes()
  const message = JSON.stringify({ type: 'notes', notes })

  console.log(`📢 Broadcasting to ${countClients()} clients, ${notes.length} notes`)

  let sent = 0
  for (const [token, wsSet] of clients) {
    for (const ws of wsSet) {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message)
          sent++
          console.log(`  ✓ Sent to one client`)
        } catch (e) {
          console.error('  ✗ Failed to send:', e.message)
        }
      }
    }
  }
  console.log(`📢 Broadcast complete, sent to ${sent} clients`)
}

// Broadcast an arbitrary message to all connected WS clients.
function broadcastToAllClients(message) {
  const str = typeof message === 'string' ? message : JSON.stringify(message)
  let sent = 0
  for (const wsSet of clients.values()) {
    for (const ws of wsSet) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(str); sent++ } catch (_) {}
      }
    }
  }
  return sent
}

// ── Live presence (dashboard dots) ───────────────────────────────────────
function presenceUser(ws) {
  if (!ws._presenceUser) {
    ws._presenceUser = {
      id: randomUUID(),
      username: ws._user?.username || 'unknown',
      displayName: ws._user?.displayName || ws._user?.username || 'Unknown'
    }
  }
  return ws._presenceUser
}

function presencePayload(noteId) {
  const entries = notePresence.get(noteId)
  const mcpEntries = mcpPresence.get(noteId)
  const count = (entries?.size || 0) + (mcpEntries?.size || 0)
  if (count === 0) return { noteId, count: 0, users: [] }
  const users = []
  const seen = new Set()
  for (const info of entries?.values() || []) {
    const key = info.user.username
    if (seen.has(key)) continue
    seen.add(key)
    users.push({ username: info.user.username, displayName: info.user.displayName })
  }
  for (const info of mcpEntries?.values() || []) {
    const key = info.user.username
    if (seen.has(key)) continue
    seen.add(key)
    users.push({ username: info.user.username, displayName: info.user.displayName })
  }
  return { noteId, count, users }
}

function notePresenceCount(noteId) {
  return (notePresence.get(noteId)?.size || 0) + (mcpPresence.get(noteId)?.size || 0)
}

function presenceSnapshot() {
  const result = {}
  const noteIds = new Set([...notePresence.keys(), ...mcpPresence.keys()])
  for (const noteId of noteIds) {
    const payload = presencePayload(noteId)
    if (payload.count > 0) result[noteId] = payload
  }
  return result
}

function broadcastPresence(noteId) {
  broadcastToAllClients({ type: 'presence', ...presencePayload(noteId) })
}

function addNotePresence(noteId, ws, kind) {
  let entries = notePresence.get(noteId)
  if (!entries) {
    entries = new Map()
    notePresence.set(noteId, entries)
  }
  let record = entries.get(ws)
  if (!record) {
    record = { user: presenceUser(ws), kinds: new Set() }
    entries.set(ws, record)
  }
  const before = record.kinds.size
  record.kinds.add(kind)
  if (record.kinds.size !== before || before === 0) broadcastPresence(noteId)
}

function removeNotePresence(noteId, ws, kind = null) {
  const entries = notePresence.get(noteId)
  if (!entries) return
  const record = entries.get(ws)
  if (!record) return
  if (kind) record.kinds.delete(kind)
  else record.kinds.clear()
  if (record.kinds.size === 0) entries.delete(ws)
  if (entries.size === 0) notePresence.delete(noteId)
  broadcastPresence(noteId)
}

function addMcpPresence(noteId, session) {
  let entries = mcpPresence.get(noteId)
  if (!entries) {
    entries = new Map()
    mcpPresence.set(noteId, entries)
  }
  const rawName = String(session.actor || 'mcp').replace(/^mcp:/, '') || 'mcp'
  entries.set(session.id, {
    kind: 'mcp',
    mode: session.mode || 'write',
    user: {
      username: `mcp:${rawName}`,
      displayName: `MCP (${rawName}${session.mode ? ` · ${session.mode}` : ''})`
    }
  })
  broadcastPresence(noteId)
}

function removeMcpPresence(noteId, sessionId) {
  const entries = mcpPresence.get(noteId)
  if (!entries) return
  entries.delete(sessionId)
  if (entries.size === 0) mcpPresence.delete(noteId)
  broadcastPresence(noteId)
}

function removeAllPresenceForSocket(ws) {
  for (const noteId of [...notePresence.keys()]) {
    const entries = notePresence.get(noteId)
    if (entries?.has(ws)) removeNotePresence(noteId, ws)
  }
}

// ── Live text sessions ────────────────────────────────────────────────────
function getTextSessions(noteId) {
  let sessions = textSessions.get(noteId)
  if (!sessions) {
    sessions = new Set()
    textSessions.set(noteId, sessions)
  }
  return sessions
}

function addTextSession(noteId, ws) {
  getTextSessions(noteId).add(ws)
  ws._textNoteId = noteId
  addNotePresence(noteId, ws, 'text')
}

function removeTextSession(noteId, ws) {
  const sessions = textSessions.get(noteId)
  if (!sessions) return
  sessions.delete(ws)
  if (sessions.size === 0) {
    textSessions.delete(noteId)
    try {
      textCollab.persistNow(noteId)
      textCollab.discardIfClean(noteId)
    } catch (error) {
      console.error('Text draft persist failed:', error.message)
    }
  }
  if (ws._textNoteId === noteId) ws._textNoteId = null
  removeNotePresence(noteId, ws, 'text')
}

function broadcastToTextSessions(noteId, message, excludeWs = null) {
  const sessions = textSessions.get(noteId)
  if (!sessions) return
  const str = JSON.stringify(message)
  for (const ws of sessions) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(str) } catch (_) { /* ignore individual socket failures */ }
    }
  }
}

function broadcastTextReset(noteId) {
  const snapshot = textCollab.resetToHead(noteId)
  if (!snapshot) return
  broadcastToTextSessions(noteId, {
    type: 'text-reset',
    noteId,
    update: bytesToBase64(snapshot.update),
    stateVector: bytesToBase64(snapshot.stateVector),
    baseRevisionId: snapshot.baseRevisionId,
    revisionNo: snapshot.revisionNo
  })
}

function sendTextSnapshot(ws, noteId, { reset = false } = {}) {
  const snapshot = textCollab.snapshot(noteId)
  if (!snapshot) {
    ws.send(JSON.stringify({ type: 'note-gone', noteId }))
    return false
  }
  ws.send(JSON.stringify({
    type: reset ? 'text-reset' : 'text-snapshot',
    noteId,
    update: bytesToBase64(snapshot.update),
    stateVector: bytesToBase64(snapshot.stateVector),
    baseRevisionId: snapshot.baseRevisionId,
    revisionNo: snapshot.revisionNo
  }))
  return true
}

// Close live WebSocket connections for a user when their sessions are revoked
// (password reset/change, disable, sign out all). `exceptToken` keeps the
// caller's current session connected after a self-service password change.
function closeSocketsForUser(userId, exceptToken = null) {
  let closed = 0
  for (const [token, wsSet] of clients.entries()) {
    if (token === exceptToken) continue
    const entry = sessions.validate(token)
    if (entry?.userId === userId) {
      for (const ws of wsSet) {
        try { ws.close(1008, 'Session revoked') } catch (_) { /* noop */ }
      }
      clients.delete(token)
      closed += wsSet.size
    }
  }
  return closed
}

// Purge in-memory collab state for a deleted note so further deltas to it are
// rejected (the delta handler replies with `note-gone`).
function clearNoteState(noteId) {
  const state = noteStates.get(noteId)
  if (state) {
    clearTimeout(state.pendingPersist)
    noteStates.delete(noteId)
  }
}

// Broadcast a per-note deletion event to all clients.
function broadcastNoteDeleted(noteId) {
  clearNoteState(noteId)
  broadcastToAllClients({ type: 'note-deleted', noteId, deletedAt: Date.now() })
}

// ── Human authentication ────────────────────────────────────────────────
// Accounts are shared-workspace users. Admins manage accounts; members use
// the same notes. Password hashes are scrypt; the legacy single-password hash
// is upgraded on the first successful login.

function authError(res, status, message, code = 'auth_error') {
  return res.status(status).json({ error: message, code })
}

function issueSession(res, user) {
  const { sessionId, expiresAt } = sessions.issue({ userId: user.id, hash: '' })
  res.setHeader('Set-Cookie', sessions.cookieHeader(sessionId))
  return { token: sessionId, expiresAt, user }
}

function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin' || req.auth?.scopes?.includes('admin')) {
    return next()
  }
  return authError(res, 403, 'Admin access required', 'forbidden')
}

app.get('/api/auth/bootstrap', (req, res) => {
  const userCount = users.count()
  res.json({
    needsSetup: userCount === 0,
    userCount,
    sessionMaxAge: sessions.SESSION_MAX_AGE_SECONDS
  })
})

app.post('/api/auth/setup', async (req, res) => {
  try {
    if (users.count() > 0) {
      return authError(res, 409, 'This workspace is already set up', 'already_setup')
    }
    const username = String(req.body?.username || 'admin').trim()
    const displayName = String(req.body?.displayName || 'Administrator').trim()
    const password = req.body?.password
    const passwordError = validatePassword(password, { username })
    if (passwordError) return authError(res, 400, passwordError, 'invalid_password')
    const user = await users.create({ username, displayName, password, role: 'admin' })
    res.json({ success: true, ...issueSession(res, user) })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = req.body?.password
    if (!username || !password) return authError(res, 400, 'Username and password are required', 'invalid_credentials')
    const user = await users.verifyCredentials(username, password)
    if (!user) return authError(res, 401, 'Invalid username or password', 'invalid_credentials')
    users.touchLogin(user.id)
    res.json({ success: true, ...issueSession(res, user), mustChangePassword: user.mustChangePassword })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.get('/api/auth/me', checkAuth, (req, res) => {
  res.json({ user: req.user, expiresAt: req.session?.expiresAt || null })
})

app.get('/api/auth/status', (req, res) => {
  const auth = authenticate(req)
  if (!auth) {
    return res.json({
      authenticated: false,
      user: null,
      expiresAt: null,
      needsSetup: users.count() === 0
    })
  }
  res.json({
    authenticated: true,
    user: auth.user || null,
    expiresAt: auth.session?.expiresAt || null,
    needsSetup: false
  })
})

app.post('/api/auth/change-password', checkAuth, async (req, res) => {
  try {
    const currentPassword = req.body?.currentPassword
    const newPassword = req.body?.newPassword
    if (!currentPassword || !newPassword) {
      return authError(res, 400, 'Current and new passwords are required', 'invalid_password')
    }
    const verified = await users.verifyCredentials(req.user.username, currentPassword)
    if (!verified) return authError(res, 401, 'Current password is incorrect', 'invalid_password')
    const user = await users.changePassword(req.user.id, newPassword)
    closeSocketsForUser(req.user.id, req.sessionId)
    sessions.revokeUser(req.user.id, { exceptSessionId: req.sessionId })
    res.json({ success: true, user })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/auth/logout', (req, res) => {
  const sessionId = sessions.sessionIdFromRequest(req) || req.headers['x-auth-token']
  if (sessionId) sessions.revoke(sessionId)
  res.setHeader('Set-Cookie', sessions.cookieHeader('', { clear: true }))
  res.json({ success: true })
})

app.post('/api/auth/logout-all', checkAuth, (req, res) => {
  closeSocketsForUser(req.user.id)
  const count = sessions.revokeUser(req.user.id)
  res.setHeader('Set-Cookie', sessions.cookieHeader('', { clear: true }))
  res.json({ success: true, revokedSessions: count })
})

// ── User administration ────────────────────────────────────────────────
app.get('/api/users', checkAuth, requireAdmin, (req, res) => {
  res.json({ users: users.list() })
})

app.post('/api/users', checkAuth, requireAdmin, async (req, res) => {
  try {
    const user = await users.create({
      username: req.body?.username,
      displayName: req.body?.displayName,
      password: req.body?.password,
      role: req.body?.role === 'admin' ? 'admin' : 'member',
      mustChangePassword: req.body?.mustChangePassword !== false
    })
    res.json({ user })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.patch('/api/users/:id', checkAuth, requireAdmin, (req, res) => {
  try {
    const user = users.update(req.params.id, {
      displayName: req.body?.displayName,
      role: req.body?.role,
      disabled: req.body?.disabled
    })
    if (user.disabledAt) {
      closeSocketsForUser(user.id)
      sessions.revokeUser(user.id)
    }
    res.json({ user })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/users/:id/reset-password', checkAuth, requireAdmin, async (req, res) => {
  try {
    const generated = req.body?.password ? null : temporaryPassword()
    const password = req.body?.password || generated
    const user = await users.resetPassword(req.params.id, password)
    closeSocketsForUser(req.params.id)
    sessions.revokeUser(req.params.id)
    res.json({ success: true, user, temporaryPassword: generated })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// ── Admin: semantic search / embeddings ─────────────────────────────────
app.get('/api/admin/embeddings', checkAuth, requireAdmin, (req, res) => {
  try { res.json(embeddings.status()) } catch (error) { sendServiceError(res, error) }
})

app.put('/api/admin/embeddings', checkAuth, requireAdmin, async (req, res) => {
  try {
    const result = await embeddings.saveConfig(req.body || {})
    res.json({ ...embeddings.status(), ...result })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.post('/api/admin/embeddings/test', checkAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await embeddings.testConfig(req.body || {}))
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.post('/api/admin/embeddings/test-rerank', checkAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await embeddings.testRerankConfig(req.body || {}))
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code })
  }
})

app.post('/api/admin/embeddings/reset', checkAuth, requireAdmin, (req, res) => {
  try {
    const result = embeddings.resetIndex({ reindex: req.body?.reindex !== false })
    res.json({ ...result, status: embeddings.status() })
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/admin/embeddings/reindex', checkAuth, requireAdmin, (req, res) => {
  try {
    const queued = embeddings.enqueueAll({ force: true })
    res.json({ success: true, queued, status: embeddings.status() })
  } catch (error) {
    sendServiceError(res, error)
  }
})

// Legacy single-password aliases. They create/login the `admin` account so
// older clients and scripts keep working during the transition.
app.get('/api/password', (req, res) => {
  res.json({ hasPassword: users.count() > 0 })
})

app.post('/api/password/setup', async (req, res) => {
  try {
    if (users.count() > 0) {
      return authError(res, 409, 'This workspace is already set up', 'already_setup')
    }
    const password = req.body?.password
    const username = String(req.body?.username || 'admin').trim()
    const passwordError = validatePassword(password, { username })
    if (passwordError) return authError(res, 400, passwordError, 'invalid_password')
    const user = await users.create({
      username,
      displayName: String(req.body?.displayName || 'Administrator').trim(),
      password,
      role: 'admin'
    })
    res.json({ success: true, ...issueSession(res, user) })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/password/verify', async (req, res) => {
  try {
    const username = String(req.body?.username || 'admin').trim()
    const user = await users.verifyCredentials(username, req.body?.password)
    if (!user) return authError(res, 401, 'Invalid username or password', 'invalid_credentials')
    users.touchLogin(user.id)
    res.json({ success: true, ...issueSession(res, user), mustChangePassword: user.mustChangePassword })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Resolve a request identity from a bearer token, session cookie, or legacy
// X-Auth-Token session id. Returns { actor, authInfo, token, session } or null.
function authenticate(req) {
  const header = String(req.headers.authorization || '')
  if (header.startsWith('Bearer ')) {
    const token = tokens.verify(header.slice(7).trim())
    if (token) {
      const actor = token.name.startsWith('mcp:') ? token.name : `mcp:${token.name}`
      return {
        actor,
        token,
        authInfo: {
          clientId: token.id,
          actor,
          tokenId: token.id,
          scopes: token.scopes
        }
      }
    }
  }

  const sessionId = sessions.sessionIdFromRequest(req) || req.headers['x-auth-token']
  const entry = sessions.validate(sessionId)
  if (entry) {
    let user = entry.userId ? users.getById(entry.userId) : null
    // Compatibility for sessions issued before migration 4.
    if (!user) user = users.getByUsername('admin')
    if (!user || user.disabledAt) {
      sessions.revoke(sessionId)
      return null
    }
    return {
      actor: `user:${user.username}`,
      session: entry,
      sessionId,
      user,
      authInfo: {
        clientId: `user:${user.username}`,
        actor: `user:${user.username}`,
        scopes: ['read', 'write']
      }
    }
  }
  return null
}

function checkAuth(req, res, next) {
  const auth = authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  if (auth.token && req.method !== 'GET' &&
      !auth.token.scopes.includes('write') && !auth.token.scopes.includes('admin')) {
    return res.status(403).json({ error: 'Token lacks write scope' })
  }
  req.actor = auth.actor
  req.auth = auth.authInfo
  req.mcpToken = auth.token || null
  req.user = auth.user || null
  req.session = auth.session || null
  req.sessionId = auth.sessionId || null
  if (req.user?.mustChangePassword) {
    const allowed = new Set([
      '/api/auth/change-password',
      '/api/auth/logout',
      '/api/auth/logout-all',
      '/api/auth/me'
    ])
    if (!allowed.has(req.path)) {
      return res.status(403).json({
        error: 'You must change your password before continuing',
        code: 'password_change_required'
      })
    }
  }
  next()
}

function mcpAuth(req, res, next) {
  const auth = authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized MCP request' })
  req.actor = auth.actor
  req.auth = auth.authInfo
  req.mcpToken = auth.token || null
  req.user = auth.user || null
  req.session = auth.session || null
  req.sessionId = auth.sessionId || null
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', code: 'password_change_required' })
  }
  next()
}

// MCP token management. Human admins and admin-scoped tokens may manage
// client tokens; only a human admin session may mint another admin token.
app.get('/api/mcp/tokens', checkAuth, requireAdmin, (req, res) => {
  try { res.json(tokens.list()) } catch (e) { sendServiceError(res, e) }
})

app.post('/api/mcp/tokens', checkAuth, requireAdmin, (req, res) => {
  try {
    const scopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes
      : String(req.body?.scopes || 'read,write').split(',')
    const cleanScopes = [...new Set(scopes.map(scope => String(scope).trim()).filter(Boolean))]
    if (cleanScopes.includes('admin') && req.mcpToken) {
      return res.status(403).json({
        error: 'Admin tokens can only be created from a human admin session',
        code: 'admin_token_requires_human'
      })
    }
    const created = tokens.create({
      name: req.body?.name,
      scopes: cleanScopes,
      expiresAt: req.body?.expiresAt || null,
      createdBy: req.actor
    })
    res.json(created)
  } catch (e) { sendServiceError(res, e) }
})

app.delete('/api/mcp/tokens/:id', checkAuth, requireAdmin, (req, res) => {
  try {
    const token = tokens.getById(req.params.id)
    const result = tokens.revoke(req.params.id)
    if (token) mcpEditing?.closeForToken(token.id, { discard: false, reason: 'token-revoked' })
    res.json(result)
  } catch (e) { sendServiceError(res, e) }
})

app.get('/api/mcp/settings', checkAuth, requireAdmin, (req, res) => {
  try { res.json(mcpSettings.get()) } catch (e) { sendServiceError(res, e) }
})

app.put('/api/mcp/settings', checkAuth, requireAdmin, (req, res) => {
  try {
    res.json(mcpSettings.update({
      maxWriteSessions: req.body?.maxWriteSessions,
      maxReadSessions: req.body?.maxReadSessions
    }))
  } catch (e) { sendServiceError(res, e) }
})

app.get('/api/config', checkAuth, (req, res) => {
  try {
    const embeddingStatus = embeddings.status()
    const settings = embeddingStatus.settings
    res.json({
      ui: uiSettings.get().ui,
      search: {
        semanticEnabled: !!(settings.enabled && settings.model &&
          settings.dimensions && embeddingStatus.vector.loaded),
        model: settings.model || null,
        rerankEnabled: !!(settings.rerankEnabled && settings.rerankModel)
      }
    })
  } catch (e) { sendServiceError(res, e) }
})

app.get('/api/admin/config', checkAuth, requireAdmin, (req, res) => {
  try { res.json(uiSettings.get()) } catch (e) { sendServiceError(res, e) }
})

app.put('/api/admin/config', checkAuth, requireAdmin, (req, res) => {
  try {
    const result = uiSettings.update(req.body?.ui)
    res.json(result)
    broadcastToAllClients({ type: 'config', config: { ui: result.ui } })
  } catch (e) { sendServiceError(res, e) }
})

app.delete('/api/admin/config', checkAuth, requireAdmin, (req, res) => {
  try {
    const result = uiSettings.reset()
    res.json(result)
    broadcastToAllClients({ type: 'config', config: { ui: result.ui } })
  } catch (e) { sendServiceError(res, e) }
})

app.get('/api/drafts', checkAuth, (req, res) => {
  try {
    res.json(textCollab.listDrafts())
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes', checkAuth, (req, res) => {
  try {
    const notes = notesService.listNotes({
      includeArchived: req.query.includeArchived === '1' || req.query.includeArchived === 'true',
      type: req.query.type || null,
      tag: req.query.tag || null,
      exactTag: req.query.exactTag === '1' || req.query.exactTag === 'true',
      limit: req.query.limit != null ? Number(req.query.limit) : null,
      offset: req.query.offset != null ? Number(req.query.offset) : 0
    })
    res.json(notes)
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes', checkAuth, (req, res) => {
  try {
    const note = notesService.createNote({
      title: req.body.title || '',
      content: req.body.content || '',
      type: req.body.type || 'text',
      canvasData: req.body.canvasData || null,
      thumbnail: req.body.thumbnail || null,
      actor: req.actor || 'ui',
      source: 'ui'
    })
    const head = revisions.getHead(note.id)
    const revision = head ? revisions.getRevision(head.head_revision_id) : null
    res.json({ ...note, revision: notesService.revisionDto(revision) })
    broadcastNotes()
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/index', checkAuth, (req, res) => {
  try {
    res.json(notesService.listNoteIndex({
      includeArchived: req.query.includeArchived !== '0' && req.query.includeArchived !== 'false'
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/window', checkAuth, (req, res) => {
  try {
    const ids = req.body?.ids
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' })
    }
    if (ids.length > 200) {
      return res.status(400).json({ error: 'At most 200 note ids are allowed' })
    }
    res.json(notesService.listNoteCardsByIds(ids))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id', checkAuth, (req, res) => {
  try {
    res.json(notesService.getNote(req.params.id))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/links/summary', checkAuth, (req, res) => {
  try {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array', code: 'invalid_ids' })
    }
    if (ids.length > 2000) {
      return res.status(400).json({ error: 'At most 2000 note ids are supported', code: 'too_many_ids' })
    }
    res.json(links.summary(ids, {
      includeArchived: req.body?.includeArchived === true || req.body?.includeArchived === 1
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id/links', checkAuth, (req, res) => {
  try {
    res.json(links.outgoing(req.params.id, {
      includeArchived: req.query.includeArchived === '1'
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id/backlinks', checkAuth, (req, res) => {
  try {
    res.json(links.backlinks(req.params.id, {
      includeArchived: req.query.includeArchived === '1'
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id/renders/latest', checkAuth, (req, res) => {
  try {
    res.json(renderService.latest(req.params.id))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.put('/api/notes/:id/renders', checkAuth, (req, res) => {
  try {
    const manifest = renderService.saveManifest({
      noteId: req.params.id,
      tiles: req.body.tiles || [],
      source: req.body.source || 'client',
      rendererVersion: req.body.rendererVersion || 1,
      requestId: req.body.requestId || null
    })
    res.json(manifest)
    if (req.body.requestId) {
      broadcastToNote(req.params.id, {
        type: 'render-complete',
        noteId: req.params.id,
        requestId: req.body.requestId,
        renderId: manifest.renderId
      })
    }
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/:id/renders/request', checkAuth, (req, res) => {
  const state = noteStates.get(req.params.id)
  if (!state || state.sessions.size === 0) {
    return res.status(202).json({ requested: false, reason: 'no-client' })
  }
  const requestId = randomUUID()
  for (const session of state.sessions) {
    if (session.readyState === WebSocket.OPEN) {
      session.send(JSON.stringify({ type: 'render-request', noteId: req.params.id, requestId }))
    }
  }
  res.status(202).json({ requested: true, requestId })
})

app.put('/api/notes/:id', checkAuth, (req, res) => {
  try {
    const updated = notesService.updateNote({
      id: req.params.id,
      title: req.body.title,
      content: req.body.content,
      type: req.body.type,
      canvasData: req.body.canvasData,
      thumbnail: req.body.thumbnail,
      baseRevisionId: req.body.baseRevisionId || null,
      mode: req.body.mode || 'append',
      actor: req.actor || 'ui',
      source: 'ui',
      message: req.body.message || null
    })
    res.json(updated)
    broadcastNotes()
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.put('/api/notes/:id/color', checkAuth, (req, res) => {
  try {
    const note = notesService.setNoteColor(req.params.id, req.body?.color ?? null)
    res.json(note)
    broadcastToAllClients({
      type: 'note-color',
      noteId: note.id,
      color: note.color ?? null
    })
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id/history', checkAuth, (req, res) => {
  try {
    res.json(notesService.history(req.params.id))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/notes/:id/history/:revisionId', checkAuth, (req, res) => {
  try {
    res.json(notesService.revisionSnapshot(req.params.id, req.params.revisionId))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/:id/history/:revisionId/restore', checkAuth, (req, res) => {
  try {
    const result = notesService.restoreRevision(
      req.params.id, req.params.revisionId, req.actor || 'ui'
    )
    res.json(result)
    broadcastNotes()
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/:id/history/:revisionId/promote', checkAuth, (req, res) => {
  try {
    const result = notesService.promoteRevision(
      req.params.id, req.params.revisionId, req.actor || 'ui'
    )
    res.json(result)
    broadcastNotes()
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/:id/restore', checkAuth, (req, res) => {
  try {
    const note = notesService.restoreNote(req.params.id, req.actor || 'ui')
    res.json(note)
    broadcastNotes()
  } catch (error) {
    sendServiceError(res, error)
  }
})

function sendServiceError(res, error) {
  const status = error.status && error.status >= 400 ? error.status : 500
  res.status(status).json({
    error: error.message || 'Request failed',
    code: error.code || 'internal_error'
  })
}

app.delete('/api/notes/:id', checkAuth, (req, res) => {
  try {
    const purge = req.query.purge === '1' || req.query.purge === 'true'
    if (purge) {
      notesService.purgeNote(req.params.id, req.actor || 'ui')
    } else {
      notesService.archiveNote(req.params.id, req.actor || 'ui')
    }
    clearNoteState(req.params.id)
    res.json({ success: true, purged: purge, archived: !purge })
    broadcastNotes()
    broadcastNoteDeleted(req.params.id)
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.post('/api/notes/batch-delete', checkAuth, (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid note IDs' })
    }

    const changed = notesService.archiveNotes(ids, req.actor || 'ui')
    res.json({ success: true, count: changed, archived: true })
    broadcastNotes()
    for (const id of ids) {
      clearNoteState(id)
      broadcastNoteDeleted(id)
    }
  } catch (e) {
    console.error('🗑️ ERROR in POST /api/notes/batch-delete:', e)
    if (!res.headersSent) {
      sendServiceError(res, e)
    }
  }
})

app.get('/api/tags', checkAuth, (req, res) => {
  try {
    res.json(tags.tree({ prefix: req.query.prefix || '' }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/graph', checkAuth, (req, res) => {
  try {
    res.json(links.graph({
      noteId: req.query.noteId || null,
      depth: req.query.depth != null ? Number(req.query.depth) : 1,
      tag: req.query.tag || null,
      limit: req.query.limit != null ? Number(req.query.limit) : 300,
      includeUnresolved: req.query.includeUnresolved === '1' || req.query.includeUnresolved === 'true'
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/search/semantic', checkAuth, async (req, res) => {
  try {
    res.json(await searchService.search({
      query: req.query.q || '',
      mode: 'semantic',
      tags: req.query.tag ? [req.query.tag] : [],
      tagMode: req.query.tagMode || req.query.tag_mode || 'any',
      type: req.query.type || null,
      includeArchived: req.query.includeArchived === '1',
      limit: req.query.limit != null ? Number(req.query.limit) : 20,
      offset: req.query.offset != null ? Number(req.query.offset) : 0
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/search/hybrid', checkAuth, async (req, res) => {
  try {
    res.json(await searchService.search({
      query: req.query.q || '',
      mode: 'hybrid',
      tags: req.query.tag ? [req.query.tag] : [],
      tagMode: req.query.tagMode || req.query.tag_mode || 'any',
      type: req.query.type || null,
      includeArchived: req.query.includeArchived === '1',
      limit: req.query.limit != null ? Number(req.query.limit) : 20,
      offset: req.query.offset != null ? Number(req.query.offset) : 0
    }))
  } catch (error) {
    sendServiceError(res, error)
  }
})

app.get('/api/search', checkAuth, (req, res) => {
  const raw = (req.query.q || '').trim()
  const tag = req.query.tag || null
  const exactTag = req.query.exactTag === '1' || req.query.exactTag === 'true'
  let tagIds = null
  if (tag) tagIds = tags.noteIdsForTag(tag, { exact: exactTag })

  if (!raw) {
    if (tagIds) return res.json([...tagIds])
    return res.json([])
  }

  // Sanitize and build prefix query
  const tokens = raw
    .replace(/["'*^()+\-~]/g, ' ')   // strip FTS5 special chars
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t}"*`)              // prefix match each token

  if (tokens.length === 0) return res.json([])
  const query = tokens.join(' ')

  try {
    const rows = db.prepare(`
      SELECT f.note_id AS note_id
      FROM notes_fts f
      JOIN notes n ON n.id = f.note_id
      WHERE notes_fts MATCH ? AND n.archived_at IS NULL
      ORDER BY rank
      LIMIT 100
    `).all(query)
    let ids = rows.map(r => r.note_id)
    if (tagIds) ids = ids.filter(id => tagIds.has(id))
    res.json(ids)
  } catch (e) {
    console.error('Search error:', e.message)
    res.json([])
  }
})

// ── Domain events → WebSocket clients ─────────────────────────────────────
bus.on(EVENTS.NOTE_CREATED, payload => {
  broadcastToAllClients({ type: 'note-created', ...payload })
})
bus.on(EVENTS.NOTE_REVISED, payload => {
  broadcastToAllClients({ type: 'note-revised', ...payload })

  // A browser Save and an open-MCP Save are the shared draft's commit points.
  // Do not move the draft base for a branch or for a one-shot external/MCP
  // edit: the next Save must still detect the stale base and preserve history.
  if ((payload.source === 'ui' || payload.source === 'mcp-open') &&
      !payload.conflict && payload.headRevisionId) {
    textCollab.setBaseRevision(payload.noteId, payload.headRevisionId)
    mcpEditing.applySavedHead(payload.noteId, payload.headRevisionId, payload.revisionNo)
    const savedHead = revisions.getHead(payload.noteId)
    broadcastToTextSessions(payload.noteId, {
      type: 'text-saved',
      noteId: payload.noteId,
      baseRevisionId: payload.headRevisionId,
      revisionNo: payload.revisionNo,
      title: savedHead?.title || '',
      content: savedHead?.content || ''
    })
  }

  // Restore/promote replace the head by design. Close any live MCP edit
  // lease and reset the shared draft so open editors do not continue editing
  // a document based on the replaced version.
  if (payload.source === 'restore' || payload.source === 'promote') {
    mcpEditing.closeForNote(payload.noteId, { reason: 'head-replaced' })
    broadcastTextReset(payload.noteId)
  }
})
bus.on(EVENTS.NOTE_ARCHIVED, payload => {
  mcpEditing.closeForNote(payload.noteId, { reason: 'archived' })
  textCollab.discard(payload.noteId)
  broadcastToAllClients({ type: 'note-archived', ...payload })
})
bus.on(EVENTS.NOTE_RESTORED, payload => {
  mcpEditing.closeForNote(payload.noteId, { reason: 'restored' })
  textCollab.discard(payload.noteId)
  broadcastToAllClients({ type: 'note-restored', ...payload })
})
bus.on(EVENTS.NOTE_PURGED, payload => {
  mcpEditing.closeForNote(payload.noteId, { reason: 'purged' })
  textCollab.discard(payload.noteId)
  broadcastToAllClients({ type: 'note-purged', ...payload })
})
bus.on(EVENTS.RENDER_UPDATED, payload => {
  broadcastToNote(payload.noteId, { type: 'render-updated', ...payload })
  if (payload.requestId && pendingRenderRequests.has(payload.requestId)) {
    const pending = pendingRenderRequests.get(payload.requestId)
    clearTimeout(pending.timer)
    pendingRenderRequests.delete(payload.requestId)
    pending.resolve({
      requested: true,
      requestId: payload.requestId,
      manifest: renderService.latest(payload.noteId)
    })
  }
})

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  // Extract token from URL query params: ws://host/ws?token=<sessionId>
  const url = new URL(req.url, `http://${req.headers.host}`)
  // Prefer the explicit token (used immediately after login), but fall back to
  // the HttpOnly session cookie so a page reload can reconnect without ever
  // exposing the session ID to JavaScript.
  const token = url.searchParams.get('token') || sessions.sessionIdFromRequest(req)

  if (!token) {
    ws.close(1008, 'No token provided')
    return
  }

  // Verify token against the session store (session ID, not raw password hash)
  const entry = sessions.validate(token)
  if (!entry) {
    ws.close(1008, 'Invalid token')
    return
  }
  let user = entry.userId ? users.getById(entry.userId) : users.getByUsername('admin')
  if (!user || user.disabledAt) {
    sessions.revoke(token)
    ws.close(1008, 'Account disabled')
    return
  }
  ws._user = user
  ws._actor = `user:${user.username}`
  ws._lastAuthCheck = Date.now()

  // Add client to the set for this token
  if (!clients.has(token)) {
    clients.set(token, new Set())
  }
  clients.get(token).add(ws)

  console.log(`WebSocket client connected. Total clients: ${countClients()}`)

  // Send current notes immediately on connection
  const notes = getAllNotes()
  ws.send(JSON.stringify({ type: 'notes', notes }))
  ws.send(JSON.stringify({ type: 'config', config: { ui: uiSettings.get().ui } }))
  ws.send(JSON.stringify({ type: 'presence', presence: presenceSnapshot() }))

  ws.on('close', () => {
    const wsSet = clients.get(token)
    if (wsSet) {
      wsSet.delete(ws)
      if (wsSet.size === 0) {
        clients.delete(token)
      }
    }
    // Clean up from any note sessions this client was in
    const noteId = ws._collabNoteId
    if (noteId) {
      const state = noteStates.get(noteId)
      if (state) {
        state.sessions.delete(ws)
        if (state.sessions.size === 0) {
          state.forceCheckpoint = true
          schedulePersist(noteId)
        }
      }
      ws._collabNoteId = null
      removeNotePresence(noteId, ws, 'canvas')
    }
    if (ws._textNoteId) {
      removeTextSession(ws._textNoteId, ws)
    }
    removeAllPresenceForSocket(ws)
    console.log(`WebSocket client disconnected. Total clients: ${countClients()}`)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })

  ws.on('message', (data) => {
    try {
      if (!ws._lastAuthCheck || Date.now() - ws._lastAuthCheck > 5000) {
        ws._lastAuthCheck = Date.now()
        const current = sessions.validate(token)
        if (!current) {
          ws.close(1008, 'Session revoked')
          return
        }
        const currentUser = current.userId ? users.getById(current.userId) : null
        if (!currentUser || currentUser.disabledAt) {
          ws.close(1008, 'Account disabled')
          return
        }
      }
      const msg = JSON.parse(data.toString())
      switch (msg.type) {
        case 'join': {
          const noteRow = db.prepare('SELECT id, title, archived_at FROM notes WHERE id = ?').get(msg.noteId)
          if (!noteRow || noteRow.archived_at) {
            ws.send(JSON.stringify({ type: 'note-gone', noteId: msg.noteId }))
            break
          }
          const state = loadNoteState(msg.noteId)
          state.sessions.add(ws)
          state.lastActor = ws._actor || 'ui'
          ws._collabNoteId = msg.noteId
          addNotePresence(msg.noteId, ws, 'canvas')
          const elements = [...state.elements.values()]
          ws.send(JSON.stringify({
            type: 'snapshot',
            noteId: msg.noteId,
            title: noteRow.title || '',
            elements,
            files: state.files || {}
          }))
          console.log(`👤 Joined ${msg.noteId} (${state.sessions.size})`)
          break
        }
        case 'leave': {
          if (!msg.noteId) break
          const state = noteStates.get(msg.noteId)
          if (state) {
            state.sessions.delete(ws)
            if (state.sessions.size === 0) {
              state.forceCheckpoint = true
              schedulePersist(msg.noteId)
            }
          }
          ws._collabNoteId = null
          removeNotePresence(msg.noteId, ws, 'canvas')
          console.log(`👋 Client left note ${msg.noteId}`)
          break
        }
        case 'text-join': {
          const noteRow = db.prepare('SELECT id, archived_at FROM notes WHERE id = ?').get(msg.noteId)
          if (!noteRow || noteRow.archived_at) {
            ws.send(JSON.stringify({ type: 'note-gone', noteId: msg.noteId }))
            break
          }
          if (ws._textNoteId && ws._textNoteId !== msg.noteId) {
            removeTextSession(ws._textNoteId, ws)
          }
          addTextSession(msg.noteId, ws)
          if (!sendTextSnapshot(ws, msg.noteId)) {
            removeTextSession(msg.noteId, ws)
            break
          }
          console.log(`📝 Text join ${msg.noteId} (${getTextSessions(msg.noteId).size})`)
          break
        }
        case 'text-leave': {
          if (!msg.noteId) break
          removeTextSession(msg.noteId, ws)
          console.log(`📝 Text leave ${msg.noteId}`)
          break
        }
        case 'text-update': {
          if (!ws._textNoteId || ws._textNoteId !== msg.noteId) break
          let update
          try {
            update = base64ToBytes(msg.update)
          } catch (_) {
            break
          }
          if (!textCollab.applyUpdate(msg.noteId, update)) {
            ws.send(JSON.stringify({ type: 'note-gone', noteId: msg.noteId }))
            break
          }
          broadcastToTextSessions(msg.noteId, {
            type: 'text-update',
            noteId: msg.noteId,
            update: msg.update
          }, ws)
          break
        }
        case 'text-discard': {
          if (!ws._textNoteId || ws._textNoteId !== msg.noteId) break
          const sessions = getTextSessions(msg.noteId)
          // Do not let one client erase a shared draft that other editors are
          // still using. The last editor may discard it explicitly.
          if (sessions.size <= 1) {
            textCollab.discard(msg.noteId)
            ws.send(JSON.stringify({ type: 'text-discarded', noteId: msg.noteId }))
          }
          break
        }
        case 'title': {
          if (!msg.noteId) break
          const row = db.prepare(
            'SELECT id, type, title, archived_at, head_revision_id FROM notes WHERE id = ?'
          ).get(msg.noteId)
          if (!row || row.archived_at) {
            ws.send(JSON.stringify({ type: 'note-gone', noteId: msg.noteId }))
            break
          }
          const title = String(msg.title ?? '')
          if (title === (row.title || '')) {
            ws.send(JSON.stringify({ type: 'title-saved', noteId: msg.noteId, title }))
            break
          }
          try {
            const result = notesService.updateNote({
              id: msg.noteId,
              title,
              type: row.type || 'canvas',
              baseRevisionId: row.head_revision_id || null,
              mode: 'append',
              actor: ws._actor || 'ui',
              source: 'title',
              message: 'Whiteboard title'
            })
            broadcastToNote(msg.noteId, {
              type: 'title-updated',
              noteId: msg.noteId,
              title: result.title || title
            }, ws)
            broadcastNotes()
            ws.send(JSON.stringify({
              type: 'title-saved',
              noteId: msg.noteId,
              title: result.title || title,
              revisionNo: result.revisionNo
            }))
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'title-error',
              noteId: msg.noteId,
              error: error.message
            }))
          }
          break
        }
        case 'checkpoint': {
          if (!msg.noteId) break
          const state = noteStates.get(msg.noteId)
          if (state) {
            state.lastActor = ws._actor || state.lastActor || 'ui'
            state.forceCheckpoint = true
            clearTimeout(state.pendingPersist)
            persistNoteState(msg.noteId)
            ws.send(JSON.stringify({ type: 'checkpoint-saved', noteId: msg.noteId }))
          }
          break
        }
        case 'delta': {
          if (!msg.noteId || !Array.isArray(msg.elements)) break
          const state = noteStates.get(msg.noteId)
          if (!state) {
            // Note no longer exists on server (deleted elsewhere); tell the sender.
            ws.send(JSON.stringify({ type: 'note-gone', noteId: msg.noteId }))
            break
          }
          state.lastActor = ws._actor || state.lastActor || 'ui'
          const serverTs = Date.now()
          // Merge any incoming files (extract base64 to disk)
          if (msg.files) mergeFiles(state, msg.files)
          const changed = applyDelta(state, msg.elements, serverTs)
          const filesChanged = msg.files && Object.keys(msg.files).length > 0
          console.log(`📝 Delta ${msg.noteId}: ${msg.elements.length}el, changed=${changed}, files=${filesChanged}`)
          if (changed || filesChanged) {
            if (msg.thumbnail) state._thumbnail = msg.thumbnail
            schedulePersist(msg.noteId)
            const stampedElements = msg.elements.map(el => ({ ...el, _collab_ts: serverTs }))
            // Resolve file hash references to URLs for broadcast
            const resolvedFiles = {}
            for (const [fileId, fileData] of Object.entries(state.files)) {
              if (fileData && fileData.hash) {
                const ext = fileData.ext || MIME_TO_EXT[fileData.mimeType] || 'bin'
                resolvedFiles[fileId] = { ...fileData, url: `/api/images/${fileData.hash}.${ext}` }
              } else {
                resolvedFiles[fileId] = fileData
              }
            }
            broadcastToNote(msg.noteId, {
              type: 'delta',
              noteId: msg.noteId,
              elements: stampedElements,
              files: resolvedFiles,
              serverTs
            }, ws)
          }
          break
        }
      }
    } catch (e) {
      console.error('WS message error:', e.message)
    }
  })
})

function countClients() {
  let count = 0
  for (const wsSet of clients.values()) {
    count += wsSet.size
  }
  return count
}

// ── Embedded MCP server (Streamable HTTP) ────────────────────────────────
const mcpPublicUrl = process.env.LOCAL_KEEP_PUBLIC_URL || `http://localhost:${PORT}`
const mcpHandler = createMcpHandler(({ authInfo }) => createMcpServer({
  services: {
    db,
    notes: notesService,
    revisions,
    tags,
    links,
    renders: renderService,
    search: searchService,
    imageStore,
    mcpEditing
  },
  authInfo,
  baseUrl: mcpPublicUrl.replace(/\/$/, ''),
  requestRender: requestWhiteboardRender
}))
const mcpNodeHandler = toNodeHandler(mcpHandler)
app.all('/mcp', mcpAuth, (req, res) => mcpNodeHandler(req, res, req.body))

// Serve static files from dist ONLY in production mode
// In development, use Vite dev server on port 5174 instead
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
} else if (process.env.NODE_ENV !== 'production') {
  console.log('ℹ️  Development mode: backend on :5173, frontend served by Vite on :5174')
} else {
  console.log('⚠️  dist/ not found. Run "npm run build" first, or use "npm run dev" for development.')
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📝 Local Keep server running at:`)
  console.log(`   → http://localhost:${PORT}`)
  console.log(`   → http://0.0.0.0:${PORT}`)
  if (process.env.LOCAL_KEEP_PUBLIC_URL) {
    console.log(`   → UI: ${process.env.LOCAL_KEEP_PUBLIC_URL}`)
  }
  console.log(`\n💾 Data stored in: ${DATA_DIR}`)
  console.log(`🔄 Real-time sync enabled via WebSocket\n`)
})
