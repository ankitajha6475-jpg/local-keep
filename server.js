import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { DatabaseSync } from 'node:sqlite'
import multer from 'multer'

import debugLib from 'debug'
const log = debugLib('local-keep:server')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

// Always use port 5173
const PORT = 5173
const DATA_DIR = path.join(__dirname, 'data')
const IMAGES_DIR = path.join(DATA_DIR, 'images')
const NOTES_FILE = path.join(DATA_DIR, 'notes.json')
const PASSWORD_FILE = path.join(DATA_DIR, 'password.json')
const DB_FILE = path.join(DATA_DIR, 'local-keep.db')

// WebSocket clients storage: Map of token -> Set of WebSocket connections
const clients = new Map()

// Collaboration: per-note state for real-time sync
const noteStates = new Map()  // noteId -> { elements, files, sessions, pendingPersist, _thumbnail }

function getOrCreateNoteState(noteId) {
  if (!noteStates.has(noteId)) {
    noteStates.set(noteId, {
      elements: new Map(),
      files: {},
      sessions: new Set(),
      pendingPersist: null,
      _thumbnail: null
    })
  }
  return noteStates.get(noteId)
}

function loadNoteState(noteId) {
  const state = getOrCreateNoteState(noteId)
  if (state.elements.size > 0) return state  // already loaded
  const note = db.prepare('SELECT canvasData, thumbnail FROM notes WHERE id = ?').get(noteId)
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
  // Resolve hash references to serveable URLs for clients
  for (const [fileId, fileData] of Object.entries(state.files)) {
    if (fileData && fileData.hash && !fileData.dataURL) {
      const ext = fileData.ext || MIME_TO_EXT[fileData.mimeType] || 'bin'
      state.files[fileId] = {
        ...fileData,
        url: `/api/images/${fileData.hash}.${ext}`
      }
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

// Accepted image MIME types
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
])
const MIME_TO_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg'
}

// Store an image file from base64 dataURL to disk, return { hash, ext, mimeType }
function storeImageFromDataURL(dataURL) {
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const b64 = match[2]
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null
  const ext = MIME_TO_EXT[mimeType] || 'bin'
  const buffer = Buffer.from(b64, 'base64')
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const filename = `${hash}.${ext}`
  const filePath = path.join(IMAGES_DIR, filename)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer)
  }
  return { hash, ext, mimeType }
}

// Merge incoming files from a delta into note state, extracting base64 to disk
function mergeFiles(state, incomingFiles) {
  if (!incomingFiles || typeof incomingFiles !== 'object') return
  for (const [fileId, fileData] of Object.entries(incomingFiles)) {
    if (fileData && fileData.dataURL) {
      // Client sent raw Excalidraw file with dataURL — extract to disk
      const stored = storeImageFromDataURL(fileData.dataURL)
      if (stored) {
        state.files[fileId] = stored
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
  const elements = [...state.elements.values()]
  const cleanElements = elements.map(({ _collab_ts, ...el }) => el)

  // Extract any remaining base64 dataURLs in files to disk
  for (const [fileId, fileData] of Object.entries(state.files || {})) {
    if (fileData && fileData.dataURL) {
      const stored = storeImageFromDataURL(fileData.dataURL)
      if (stored) state.files[fileId] = stored
    }
  }

  const data = JSON.stringify({ elements: cleanElements, files: state.files || {} })
  const canvasText = elements
    .filter(el => el.type === 'text' && !el.isDeleted)
    .map(el => el.text || '')
    .join(' ')
  const updatedAt = new Date().toISOString()
  const thumbnail = state._thumbnail
  state._thumbnail = null

  db.prepare('UPDATE notes SET canvasData = ?, thumbnail = ?, updatedAt = ? WHERE id = ?')
    .run(data, thumbnail, updatedAt, noteId)

  // Sync image references for this canvas note
  const note = db.prepare('SELECT content FROM notes WHERE id = ?').get(noteId)
  syncImageRefs(noteId, note?.content || '', data)

  try {
    db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId)
    const note = db.prepare('SELECT title, content FROM notes WHERE id = ?').get(noteId)
    db.prepare('INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)')
      .run(noteId, note?.title || '', note?.content || '', canvasText)
  } catch (e) { /* ignore FTS errors */ }
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
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { mode: 0o700 })
}

// Open SQLite Database connection
const db = new DatabaseSync(DB_FILE)

// Setup Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS password (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hash TEXT NOT NULL
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    type TEXT DEFAULT 'text',
    canvasData TEXT,
    thumbnail TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`)

// Migration: add columns if they don't exist (for existing DBs)
for (const col of [
  "ALTER TABLE notes ADD COLUMN type TEXT DEFAULT 'text'",
  "ALTER TABLE notes ADD COLUMN canvasData TEXT",
  "ALTER TABLE notes ADD COLUMN thumbnail TEXT"
]) {
  try { db.exec(col) } catch (e) { /* column already exists */ }
}

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    note_id, title, content, canvas_text,
    tokenize='porter unicode61'
  );
`)

// Image reference tracking table
// Tracks which images are referenced by which notes, for garbage collection
// NOTE: canvas notes store image refs via canvasData.files (hash references)
// Text notes store image refs via content markdown: ![...](/api/images/<hash>.ext)
db.exec(`
  CREATE TABLE IF NOT EXISTS image_refs (
    image_hash TEXT NOT NULL,
    note_id TEXT NOT NULL,
    PRIMARY KEY (image_hash, note_id)
  );
`)

// Migration: add canvas_text column to FTS if missing
try {
  const ftsColumns = db.prepare("PRAGMA table_info('notes_fts')").all().map(c => c.name)
  if (!ftsColumns.includes('canvas_text')) {
    // Drop & recreate FTS with new column
    db.exec('DROP TABLE IF EXISTS notes_fts')
    db.exec(`
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        note_id, title, content, canvas_text,
        tokenize='porter unicode61'
      );
    `)
    console.log('ℹ️  FTS table recreated with canvas_text column')
  }
} catch (e) {
  console.error('⚠️ FTS migration error:', e.message)
}

// Helper: extract text from canvasData JSON for FTS indexing
function extractCanvasText(canvasData) {
  if (!canvasData) return ''
  try {
    const data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
    const elements = data.elements || []
    return elements
      .filter(el => el.type === 'text' && !el.isDeleted)
      .map(el => el.text || '')
      .join(' ')
  } catch { return '' }
}

// Helper: extract image hash references from note content and canvasData
function extractImageRefs(noteId, content, canvasData) {
  const hashes = new Set()
  // From markdown content: ![...](/api/images/<hash>.ext)
  if (content) {
    const mdImgRegex = /!\[[^\]]*\]\(\/api\/images\/([a-f0-9]{16})\.[a-z]+\)/g
    let match
    while ((match = mdImgRegex.exec(content)) !== null) {
      hashes.add(match[1])
    }
  }
  // From canvas data: files with hash references
  if (canvasData) {
    try {
      const data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
      for (const fileData of Object.values(data.files || {})) {
        if (fileData && fileData.hash && /^[a-f0-9]{16}$/.test(fileData.hash)) {
          hashes.add(fileData.hash)
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return hashes
}

// Sync image references for a note (delete old refs, insert new ones)
function syncImageRefs(noteId, content, canvasData) {
  try {
    db.prepare('DELETE FROM image_refs WHERE note_id = ?').run(noteId)
    const hashes = extractImageRefs(noteId, content, canvasData)
    if (hashes.size > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO image_refs (image_hash, note_id) VALUES (?, ?)')
      for (const hash of hashes) {
        insert.run(hash, noteId)
      }
    }
  } catch (e) {
    console.error('Image ref sync error:', e.message)
  }
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

// Ensure FTS index is up to date
try {
  const ftsCount = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get()
  const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes').get()
  if (ftsCount.count !== notesCount.count) {
    console.log(`🔍 Rebuilding FTS index (${ftsCount.count} indexed, ${notesCount.count} notes)...`)
    db.exec('DELETE FROM notes_fts')
    const notes = db.prepare('SELECT id, title, content, canvasData FROM notes').all()
    const insert = db.prepare('INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)')
    for (const note of notes) {
      insert.run(note.id, note.title || '', note.content || '', extractCanvasText(note.canvasData))
    }
    console.log(`✓ FTS index rebuilt with ${notes.length} notes`)
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

// Helper functions for database operations
function getPasswordHash() {
  const row = db.prepare('SELECT hash FROM password WHERE id = 1').get()
  return row ? row.hash : null
}

function getAllNotes() {
  return db.prepare('SELECT * FROM notes ORDER BY updatedAt DESC').all()
}

// Middleware
app.use(cors())
app.use(express.json())

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
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 16)
    const ext = MIME_TO_EXT[req.file.mimetype] || 'bin'
    const filename = `${hash}.${ext}`
    const filePath = path.join(IMAGES_DIR, filename)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, req.file.buffer)
    }
    res.json({ hash, url: `/api/images/${filename}`, mimeType: req.file.mimetype })
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
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream')
  res.sendFile(filePath)
})

// Image garbage collection: remove orphaned images not referenced by any note
app.post('/api/images/cleanup', checkAuth, (req, res) => {
  try {
    // Build set of all referenced image hashes
    const referencedHashes = new Set()
    const rows = db.prepare('SELECT DISTINCT image_hash FROM image_refs').all()
    for (const row of rows) referencedHashes.add(row.image_hash)

    // Scan image files on disk
    const files = fs.readdirSync(IMAGES_DIR)
    let deletedCount = 0
    const deletedFiles = []
    for (const file of files) {
      const match = file.match(/^([a-f0-9]{16})\.[a-z]+$/)
      if (!match) continue
      const hash = match[1]
      if (!referencedHashes.has(hash)) {
        fs.unlinkSync(path.join(IMAGES_DIR, file))
        deletedCount++
        deletedFiles.push(file)
      }
    }
    res.json({ success: true, deleted: deletedCount, files: deletedFiles })
  } catch (e) {
    console.error('Image cleanup error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Simple hash function (same as client-side)
function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

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

// Password routes
app.get('/api/password', (req, res) => {
  const hash = getPasswordHash()
  res.json({ hasPassword: hash !== null })
})

app.post('/api/password/setup', (req, res) => {
  const { password } = req.body
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }

  const hash = simpleHash(password)
  db.prepare('INSERT OR REPLACE INTO password (id, hash) VALUES (1, ?)').run(hash)
  res.json({ success: true })
})

app.post('/api/password/verify', (req, res) => {
  const { password } = req.body
  const currentHash = getPasswordHash()

  if (!currentHash) {
    return res.status(400).json({ error: 'Password not set up' })
  }

  const hash = simpleHash(password)
  if (hash === currentHash) {
    res.json({ success: true, token: hash })
  } else {
    res.status(401).json({ error: 'Incorrect password' })
  }
})

// Notes routes (protected by token in header)
function checkAuth(req, res, next) {
  const token = req.headers['x-auth-token']
  const currentHash = getPasswordHash()

  if (!currentHash) {
    return res.status(400).json({ error: 'Password not set up' })
  }

  if (token === currentHash) {
    next()
  } else {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

app.get('/api/notes', checkAuth, (req, res) => {
  const notes = getAllNotes()
  res.json(notes)
})

app.post('/api/notes', checkAuth, (req, res) => {
  try {
    console.log('➕ POST /api/notes - Adding note')
    const canvasText = extractCanvasText(req.body.canvasData)
    const newNote = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      title: req.body.title || '',
      content: req.body.content || '',
      type: req.body.type || 'text',
      canvasData: req.body.canvasData || null,
      thumbnail: req.body.thumbnail || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    db.prepare(
      'INSERT INTO notes (id, title, content, type, canvasData, thumbnail, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newNote.id, newNote.title, newNote.content, newNote.type, newNote.canvasData, newNote.thumbnail, newNote.createdAt, newNote.updatedAt)
    // Index in FTS (content for text notes, canvas_text for canvas notes)
    db.prepare('INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)')
      .run(newNote.id, newNote.title, newNote.content, canvasText)
    syncImageRefs(newNote.id, newNote.content, newNote.canvasData)
    console.log('➕ Note saved, sending response...')
    res.json(newNote)
    console.log('➕ Response sent, broadcasting...')
    broadcastNotes()
  } catch (e) {
    console.error('➕ ERROR in POST /api/notes:', e)
    if (!res.headersSent) {
      res.status(500).json({ error: e.message })
    }
  }
})

app.put('/api/notes/:id', checkAuth, (req, res) => {
  const { title = '', content = '', type, canvasData, thumbnail } = req.body
  const updatedAt = new Date().toISOString()
  const canvasText = extractCanvasText(canvasData)

  // Build dynamic SET clause for fields that are provided
  const updates = ['title = ?', 'content = ?', 'updatedAt = ?']
  const params = [title, content, updatedAt]

  if (type !== undefined) { updates.push('type = ?'); params.push(type) }
  if (canvasData !== undefined) { updates.push('canvasData = ?'); params.push(canvasData) }
  if (thumbnail !== undefined) { updates.push('thumbnail = ?'); params.push(thumbnail) }

  params.push(req.params.id)
  const info = db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...params)

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Note not found' })
  }

  // Reindex in FTS
  try {
    db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(req.params.id)
    db.prepare('INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)')
      .run(req.params.id, title, content, canvasText)
  } catch (e) {
    console.error('FTS reindex error:', e.message)
  }
  syncImageRefs(req.params.id, content, canvasData)

  const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)
  res.json(updatedNote)
  broadcastNotes()
})

app.delete('/api/notes/:id', checkAuth, (req, res) => {
  const info = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id)

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Note not found' })
  }

  // Deindex from FTS and image refs
  try { db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(req.params.id) } catch (e) {}
  try { db.prepare('DELETE FROM image_refs WHERE note_id = ?').run(req.params.id) } catch (e) {}

  res.json({ success: true })
  broadcastNotes()
})

app.post('/api/notes/batch-delete', checkAuth, (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid note IDs' })
    }

    console.log(`🗑️ POST /api/notes/batch-delete - Deleting ${ids.length} notes`)
    const placeholders = ids.map(() => '?').join(',')
    const stmt = db.prepare(`DELETE FROM notes WHERE id IN (${placeholders})`)
    const info = stmt.run(...ids)

    console.log(`✓ Deleted ${info.changes} notes from SQLite`)
    // Deindex from FTS and image refs
    try {
      const delStmt = db.prepare(`DELETE FROM notes_fts WHERE note_id IN (${placeholders})`)
      delStmt.run(...ids)
    } catch (e) {}
    try {
      const delRefStmt = db.prepare(`DELETE FROM image_refs WHERE note_id IN (${placeholders})`)
      delRefStmt.run(...ids)
    } catch (e) {}
    res.json({ success: true, count: info.changes })
    broadcastNotes()
  } catch (e) {
    console.error('🗑️ ERROR in POST /api/notes/batch-delete:', e)
    if (!res.headersSent) {
      res.status(500).json({ error: e.message })
    }
  }
})

app.get('/api/search', checkAuth, (req, res) => {
  const raw = (req.query.q || '').trim()
  if (!raw) return res.json([])

  // Sanitize and build prefix query
  const tokens = raw
    .replace(/["'*^()+\-~]/g, ' ')   // strip FTS5 special chars
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t}"*`)              // prefix match each token

  if (tokens.length === 0) return res.json([])
  const query = tokens.join(' ')

  try {
    const rows = db.prepare(
      'SELECT note_id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT 100'
    ).all(query)
    res.json(rows.map(r => r.note_id))
  } catch (e) {
    console.error('Search error:', e.message)
    res.json([])
  }
})

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  // Extract token from URL query params: ws://host/ws?token=xyz
  const url = new URL(req.url, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')

  if (!token) {
    ws.close(1008, 'No token provided')
    return
  }

  // Verify token
  const currentHash = getPasswordHash()
  if (!currentHash || token !== currentHash) {
    ws.close(1008, 'Invalid token')
    return
  }

  // Add client to the set for this token
  if (!clients.has(token)) {
    clients.set(token, new Set())
  }
  clients.get(token).add(ws)

  console.log(`WebSocket client connected. Total clients: ${countClients()}`)

  // Send current notes immediately on connection
  const notes = getAllNotes()
  ws.send(JSON.stringify({ type: 'notes', notes }))

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
      }
      ws._collabNoteId = null
    }
    console.log(`WebSocket client disconnected. Total clients: ${countClients()}`)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      switch (msg.type) {
        case 'join': {
          const state = loadNoteState(msg.noteId)
          state.sessions.add(ws)
          ws._collabNoteId = msg.noteId
          const elements = [...state.elements.values()]
          ws.send(JSON.stringify({
            type: 'snapshot',
            noteId: msg.noteId,
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
          }
          ws._collabNoteId = null
          console.log(`👋 Client left note ${msg.noteId}`)
          break
        }
        case 'delta': {
          if (!msg.noteId || !Array.isArray(msg.elements)) break
          const state = noteStates.get(msg.noteId)
          if (!state) break
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
            })
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
  console.log(`\n💾 Data stored in: ${DATA_DIR}`)
  console.log(`🔄 Real-time sync enabled via WebSocket\n`)
})
