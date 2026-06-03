import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { DatabaseSync } from 'node:sqlite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

// Always use port 5173
const PORT = 5173
const DATA_DIR = path.join(__dirname, 'data')
const NOTES_FILE = path.join(DATA_DIR, 'notes.json')
const PASSWORD_FILE = path.join(DATA_DIR, 'password.json')
const DB_FILE = path.join(DATA_DIR, 'local-keep.db')

// WebSocket clients storage: Map of token -> Set of WebSocket connections
const clients = new Map()

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { mode: 0o700 })
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
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`)

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
    const newNote = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      title: req.body.title || '',
      content: req.body.content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    db.prepare('INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(newNote.id, newNote.title, newNote.content, newNote.createdAt, newNote.updatedAt)
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
  const { title = '', content = '' } = req.body
  const updatedAt = new Date().toISOString()

  const info = db.prepare('UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?')
    .run(title, content, updatedAt, req.params.id)

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Note not found' })
  }

  const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)
  res.json(updatedNote)
  broadcastNotes()
})

app.delete('/api/notes/:id', checkAuth, (req, res) => {
  const info = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id)

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Note not found' })
  }

  res.json({ success: true })
  broadcastNotes()
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
    console.log(`WebSocket client disconnected. Total clients: ${countClients()}`)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
})

function countClients() {
  let count = 0
  for (const wsSet of clients.values()) {
    count += wsSet.size
  }
  return count
}

// Serve static files from dist in production, or use Vite dev in development
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
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
