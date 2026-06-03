import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

// Always use port 5173
const PORT = 5173
const DATA_DIR = path.join(__dirname, 'data')
const NOTES_FILE = path.join(DATA_DIR, 'notes.json')
const PASSWORD_FILE = path.join(DATA_DIR, 'password.json')

// WebSocket clients storage: Map of token -> Set of WebSocket connections
const clients = new Map()

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { mode: 0o700 })
}

// Middleware
app.use(cors())
app.use(express.json())

// Helper functions for file operations
function readJson(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message)
  }
  return defaultVal
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    return true
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e.message)
    return false
  }
}

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
  const notes = readJson(NOTES_FILE, [])
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
  const passwordData = readJson(PASSWORD_FILE, null)
  res.json({ hasPassword: passwordData !== null })
})

app.post('/api/password/setup', (req, res) => {
  const { password } = req.body
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }

  const hash = simpleHash(password)
  writeJson(PASSWORD_FILE, { hash })
  res.json({ success: true })
})

app.post('/api/password/verify', (req, res) => {
  const { password } = req.body
  const passwordData = readJson(PASSWORD_FILE, null)

  if (!passwordData) {
    return res.status(400).json({ error: 'Password not set up' })
  }

  const hash = simpleHash(password)
  if (hash === passwordData.hash) {
    res.json({ success: true, token: hash })
  } else {
    res.status(401).json({ error: 'Incorrect password' })
  }
})

// Notes routes (protected by token in header)
function checkAuth(req, res, next) {
  const token = req.headers['x-auth-token']
  const passwordData = readJson(PASSWORD_FILE, null)

  if (!passwordData) {
    return res.status(400).json({ error: 'Password not set up' })
  }

  if (token === passwordData.hash) {
    next()
  } else {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

app.get('/api/notes', checkAuth, (req, res) => {
  const notes = readJson(NOTES_FILE, [])
  res.json(notes)
})

app.post('/api/notes', checkAuth, (req, res) => {
  try {
    console.log('➕ POST /api/notes - Adding note')
    const notes = readJson(NOTES_FILE, [])
    const newNote = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      title: req.body.title || '',
      content: req.body.content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    notes.unshift(newNote)
    writeJson(NOTES_FILE, notes)
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
  const notes = readJson(NOTES_FILE, [])
  const index = notes.findIndex(n => n.id === req.params.id)

  if (index === -1) {
    return res.status(404).json({ error: 'Note not found' })
  }

  notes[index] = {
    ...notes[index],
    title: req.body.title || '',
    content: req.body.content || '',
    updatedAt: new Date().toISOString()
  }

  writeJson(NOTES_FILE, notes)
  res.json(notes[index])
  broadcastNotes()
})

app.delete('/api/notes/:id', checkAuth, (req, res) => {
  let notes = readJson(NOTES_FILE, [])
  const initialLength = notes.length
  notes = notes.filter(n => n.id !== req.params.id)

  if (notes.length === initialLength) {
    return res.status(404).json({ error: 'Note not found' })
  }

  writeJson(NOTES_FILE, notes)
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
  const passwordData = readJson(PASSWORD_FILE, null)
  if (!passwordData || token !== passwordData.hash) {
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
  const notes = readJson(NOTES_FILE, [])
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
