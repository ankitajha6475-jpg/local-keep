<template>
  <div id="app">
    <!-- Setup / Onboarding Screen -->
    <div v-if="showSetup" class="auth-screen">
      <div class="auth-box">
        <h1>📝 Local Keep</h1>
        <p class="subtitle">Set a password to protect your notes</p>
        <form @submit.prevent="setupPassword">
          <input
            v-model="setupForm.password"
            type="password"
            placeholder="Enter password"
            required
            autofocus
          >
          <input
            v-model="setupForm.confirm"
            type="password"
            placeholder="Confirm password"
            required
          >
          <p v-if="setupError" class="error">{{ setupError }}</p>
          <button type="submit">Get Started</button>
        </form>
      </div>
    </div>

    <!-- Login Screen -->
    <div v-else-if="!isAuthenticated" class="auth-screen">
      <div class="auth-box">
        <h1>📝 Local Keep</h1>
        <p class="subtitle">Enter your password to continue</p>
        <form @submit.prevent="login">
          <input
            v-model="loginForm.password"
            type="password"
            placeholder="Password"
            required
            autofocus
          >
          <p v-if="loginError" class="error">{{ loginError }}</p>
          <button type="submit">Unlock</button>
        </form>
      </div>
    </div>

    <!-- Main App -->
    <div v-else class="main-app">
      <header>
        <h1>📝 Local Keep</h1>
        <div class="header-right">
          <span class="sync-status" :class="{ connected: wsConnected, connecting: wsConnecting }">
            {{ wsConnected ? '● Synced' : wsConnecting ? '○ Connecting...' : '○ Offline' }}
          </span>
          <button @click="loadNotes" class="refresh-btn" title="Refresh notes">↻</button>
          <button @click="logout" class="logout-btn">Lock</button>
        </div>
      </header>

      <main>
        <form @submit.prevent="addNote" class="note-form">
          <input
            v-model="newNoteTitle"
            type="text"
            placeholder="Title"
            class="note-title-input"
          >
          <textarea
            v-model="newNoteContent"
            placeholder="Take a note..."
            rows="3"
            required
            @keydown.ctrl.enter="addNote"
          ></textarea>
          <div class="note-form-actions">
            <button type="submit">Add Note</button>
            <small>Ctrl+Enter to quick add</small>
          </div>
        </form>

        <div v-if="notes.length === 0" class="empty-state">
          <p>No notes yet. Create your first note above!</p>
        </div>

        <div class="notes-grid">
          <div v-for="note in sortedNotes" :key="note.id" class="note-card" :class="{ editing: note.id === editingId }">
            <!-- View Mode -->
            <template v-if="note.id !== editingId">
              <div @click="startEditing(note)" class="note-content">
                <h3 v-if="note.title">{{ note.title }}</h3>
                <p>{{ note.content }}</p>
                <small class="note-date">{{ formatDate(note.updatedAt) }}</small>
              </div>
              <button @click.stop="deleteNote(note.id)" class="delete-btn" title="Delete note">×</button>
            </template>

            <!-- Edit Mode -->
            <template v-else>
              <input
                v-model="editForm.title"
                type="text"
                placeholder="Title"
                class="edit-title"
                @keydown.ctrl.enter="saveEdit"
              >
              <textarea
                v-model="editForm.content"
                rows="4"
                @keydown.ctrl.enter="saveEdit"
              ></textarea>
              <div class="edit-actions">
                <button @click="saveEdit" class="save-btn">Save</button>
                <button @click="cancelEdit" class="cancel-btn">Cancel</button>
              </div>
            </template>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const API_BASE = window.location.origin

// API helper
async function api(url, options = {}) {
  const token = sessionStorage.getItem('local-keep-token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Auth-Token'] = token

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export default {
  name: 'App',
  setup() {
    // Auth state
    const showSetup = ref(false)
    const isAuthenticated = ref(false)
    const setupForm = ref({ password: '', confirm: '' })
    const loginForm = ref({ password: '' })
    const setupError = ref('')
    const loginError = ref('')

    // Notes state
    const notes = ref([])
    const newNoteTitle = ref('')
    const newNoteContent = ref('')
    const editingId = ref(null)
    const editForm = ref({ title: '', content: '' })

    // WebSocket state
    let ws = null
    let reconnectTimer = null
    const wsConnecting = ref(false)
    const wsConnected = ref(false)

    // Create WebSocket connection
    const connectWebSocket = () => {
      const token = sessionStorage.getItem('local-keep-token')
      if (!token || wsConnecting.value) return

      wsConnecting.value = true

      // Build WebSocket URL - use ws:// or wss:// based on current protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${token}`

      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('✅ WebSocket connected')
          wsConnecting.value = false
          wsConnected.value = true

          // Clear any existing reconnect timer
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }
        }

        ws.onmessage = (event) => {
          const now = new Date().toISOString().split('T')[1].split('.')[0]
          console.log(`[${now}] 📨 WS received`)
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'notes' && Array.isArray(data.notes)) {
              console.log(`[${now}] 📨 Updating notes, count: ${data.notes.length}`)
              // Only update notes if we're not currently editing
              if (!editingId.value) {
                // Force reactivity by creating a new array reference
                notes.value = [...data.notes]
                console.log(`[${now}] 📨 Notes set in Vue, length: ${notes.value.length}`)
                // Force DOM update using queuePostFlushCb
                requestAnimationFrame(() => {
                  console.log(`[${now}] 📨 After RAF, notes length: ${notes.value.length}`)
                })
              } else {
                console.log(`[${now}] 📨 Skipping - editing mode`)
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onclose = () => {
          console.log('❌ WebSocket disconnected')
          ws = null
          wsConnecting.value = false
          wsConnected.value = false

          // Attempt to reconnect after 3 seconds if still authenticated
          if (isAuthenticated.value) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              connectWebSocket()
            }, 3000)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
        }
      } catch (e) {
        console.error('Failed to create WebSocket:', e)
        wsConnecting.value = false
      }
    }

    const disconnectWebSocket = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (ws) {
        ws.close()
        ws = null
      }
      wsConnecting.value = false
    }

    // Notes methods
    const loadNotes = async () => {
      try {
        notes.value = await api('/api/notes')
        // WebSocket will be started after successful login
      } catch (e) {
        console.error('Failed to load notes', e)
      }
    }

    // Check if setup is needed on mount
    onMounted(async () => {
      try {
        const data = await api('/api/password')
        if (!data.hasPassword) {
          showSetup.value = true
        } else {
          const token = sessionStorage.getItem('local-keep-token')
          if (token) {
            isAuthenticated.value = true
            await loadNotes()
            connectWebSocket()
          }
        }
      } catch (e) {
        console.error('Failed to check password status', e)
      }
    })

    onUnmounted(() => {
      disconnectWebSocket()
    })

    // Auth methods
    const setupPassword = async () => {
      try {
        if (setupForm.value.password.length < 4) {
          setupError.value = 'Password must be at least 4 characters'
          return
        }
        if (setupForm.value.password !== setupForm.value.confirm) {
          setupError.value = 'Passwords do not match'
          return
        }

        // First setup, then verify to get token
        await api('/api/password/setup', {
          method: 'POST',
          body: JSON.stringify({ password: setupForm.value.password })
        })

        const verifyData = await api('/api/password/verify', {
          method: 'POST',
          body: JSON.stringify({ password: setupForm.value.password })
        })

        sessionStorage.setItem('local-keep-token', verifyData.token)
        isAuthenticated.value = true
        showSetup.value = false
        setupError.value = ''
        await loadNotes()
        connectWebSocket()
      } catch (e) {
        setupError.value = e.message
      }
    }

    const login = async () => {
      try {
        const data = await api('/api/password/verify', {
          method: 'POST',
          body: JSON.stringify({ password: loginForm.value.password })
        })

        sessionStorage.setItem('local-keep-token', data.token)
        isAuthenticated.value = true
        loginError.value = ''
        await loadNotes()
        connectWebSocket()
      } catch (e) {
        loginError.value = e.message
      }
    }

    const logout = () => {
      isAuthenticated.value = false
      sessionStorage.removeItem('local-keep-token')
      loginForm.value.password = ''
      loginError.value = ''
      disconnectWebSocket()
    }

    const addNote = async () => {
      if (!newNoteContent.value.trim()) return
      try {
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content: newNoteContent.value.trim()
          })
        })
        notes.value.unshift(note)
        newNoteTitle.value = ''
        newNoteContent.value = ''
      } catch (e) {
        console.error('Failed to add note', e)
      }
    }

    const deleteNote = async (id) => {
      if (confirm('Delete this note?')) {
        try {
          await api(`/api/notes/${id}`, { method: 'DELETE' })
          notes.value = notes.value.filter(n => n.id !== id)
        } catch (e) {
          console.error('Failed to delete note', e)
        }
      }
    }

    const startEditing = (note) => {
      editingId.value = note.id
      editForm.value = { title: note.title, content: note.content }
    }

    const saveEdit = async () => {
      try {
        const updated = await api(`/api/notes/${editingId.value}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: editForm.value.title.trim(),
            content: editForm.value.content.trim()
          })
        })
        const index = notes.value.findIndex(n => n.id === editingId.value)
        if (index !== -1) {
          notes.value[index] = updated
        }
        cancelEdit()
      } catch (e) {
        console.error('Failed to save note', e)
      }
    }

    const cancelEdit = () => {
      editingId.value = null
      editForm.value = { title: '', content: '' }
    }

    // Computed
    const sortedNotes = computed(() => {
      return [...notes.value].sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
      )
    })

    // Utilities
    const formatDate = (isoString) => {
      const date = new Date(isoString)
      const now = new Date()
      const diff = now - date
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      if (minutes < 1) return 'Just now'
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`
      if (days < 7) return `${days}d ago`
      return date.toLocaleDateString()
    }

    return {
      // Auth
      showSetup,
      isAuthenticated,
      setupForm,
      loginForm,
      setupError,
      loginError,
      setupPassword,
      login,
      logout,
      // Notes
      notes,
      newNoteTitle,
      newNoteContent,
      editingId,
      editForm,
      sortedNotes,
      addNote,
      deleteNote,
      startEditing,
      saveEdit,
      cancelEdit,
      formatDate,
      // WebSocket
      wsConnected,
      wsConnecting
    }
  }
}
</script>

<style>
.auth-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.auth-box {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  width: 100%;
  max-width: 400px;
}

.auth-box h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  text-align: center;
}

.subtitle {
  text-align: center;
  color: #5f6368;
  margin-bottom: 1.5rem;
}

.auth-box form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-box input {
  padding: 0.875rem 1rem;
  border: 1px solid #dadce0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.auth-box input:focus {
  outline: none;
  border-color: #667eea;
}

.auth-box button {
  padding: 0.875rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.auth-box button:hover {
  background: #5568d3;
}

.error {
  color: #d93025;
  font-size: 0.875rem;
  margin: -0.5rem 0 0 0;
}

.main-app {
  min-height: 100vh;
}

header {
  background: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f3f4;
  position: sticky;
  top: 0;
  z-index: 10;
}

header h1 {
  font-size: 1.5rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.sync-status {
  font-size: 0.75rem;
  color: #80868b;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #f1f3f4;
}

.sync-status.connected {
  color: #1a73e8;
  background: #e8f0fe;
}

.sync-status.connecting {
  color: #f9ab00;
  background: #fef7e0;
}

.logout-btn {
  padding: 0.5rem 1rem;
  background: #f1f3f4;
  color: #5f6368;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #e8eaed;
}

.refresh-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f3f4;
  color: #5f6368;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.refresh-btn:hover {
  background: #e8eaed;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.note-form {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.note-title-input {
  width: 100%;
  padding: 0.5rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.note-title-input:focus {
  outline: none;
}

.note-form textarea {
  width: 100%;
  padding: 0.5rem;
  border: none;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
}

.note-form textarea:focus {
  outline: none;
}

.note-form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.note-form-actions button {
  padding: 0.5rem 1.25rem;
  background: #fff;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.note-form-actions button:hover {
  background: #f8f9fa;
}

.note-form-actions small {
  color: #80868b;
  font-size: 0.75rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #80868b;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.note-card {
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 8px;
  padding: 1rem;
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.note-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.note-card.editing {
  cursor: default;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.note-content h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.note-content p {
  white-space: pre-wrap;
  word-break: break-word;
  color: #202124;
  line-height: 1.5;
}

.note-date {
  display: block;
  margin-top: 0.75rem;
  color: #80868b;
  font-size: 0.75rem;
}

.delete-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  line-height: 1;
}

.note-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #d93025;
}

.edit-title {
  width: 100%;
  padding: 0.5rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.edit-title:focus {
  outline: none;
}

.note-card.editing textarea {
  width: 100%;
  padding: 0.5rem;
  border: none;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
}

.note-card.editing textarea:focus {
  outline: none;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.edit-actions button {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
}

.save-btn {
  background: #1a73e8;
  color: white;
}

.save-btn:hover {
  background: #1557b0;
}

.cancel-btn {
  background: #f1f3f4;
  color: #5f6368;
}

.cancel-btn:hover {
  background: #e8eaed;
}

@media (max-width: 600px) {
  main {
    padding: 1rem;
  }

  .notes-grid {
    grid-template-columns: 1fr;
  }
}
</style>
