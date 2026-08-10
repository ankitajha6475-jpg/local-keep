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

    <!-- Whiteboard Editor (full-screen) -->
    <WhiteboardEditor
      v-else-if="isAuthenticated && currentView === 'canvas'"
      ref="whiteboardEditorRef"
      :noteId="editingCanvasId"
      :canvasData="editingCanvasData"
      :initialTitle="editingCanvasTitle"
      :ws="wsRef"
      @back="closeCanvasEditor"
      @note-gone="handleNoteDeletedElsewhere"
    />

    <!-- Canvas deletion-elsewhere mask (no alert; inline prompt) -->
    <div
      v-if="currentView === 'canvas' && deletedMask && deletedMask.noteId === editingCanvasId"
      class="deleted-mask"
    >
      <div class="deleted-mask-panel">
        <h3>⚠️ This whiteboard was deleted on another client</h3>
        <p>Your local edits are still here. Save them as a new note, or discard.</p>
        <div class="deleted-mask-actions">
          <button type="button" class="save-btn" @click="saveDeletedAsNew">Save as new note</button>
          <button type="button" class="cancel-btn" @click="discardDeleted">Discard</button>
        </div>
      </div>
    </div>

    <!-- Main App -->
    <div v-else-if="isAuthenticated" class="main-app">
      <header @click="fabMenuOpen = false">
        <template v-if="!searchOpen">
          <h1>📝 Local Keep</h1>
          <div class="header-right">
            <span class="sync-status" :class="{ connected: wsConnected, connecting: wsConnecting }">
              {{ wsConnected ? '● Synced' : wsConnecting ? '○ Connecting...' : '○ Offline' }}
            </span>
            <button v-if="!wsConnected && !wsConnecting" @click="manualReconnect" class="reconnect-btn" title="Reconnect now">🔌 Connect</button>
            <button @click="loadNotes" class="refresh-btn" title="Refresh notes">↻</button>
            <button @click="openSearch" class="search-toggle-btn" title="Search (Ctrl+I)">🔍</button>
            <button @click="cleanupImages" class="cleanup-btn" :disabled="cleanupRunning" title="Clean unused images">🧹</button>
            <button @click="logout" class="logout-btn">Lock</button>
          </div>
        </template>
        <template v-else>
          <div class="header-search-field">
            <span class="search-icon">🔍</span>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              placeholder="Search notes..."
              class="search-input"
              @input="onSearchInput"
            >
            <button v-if="searchQuery" @click="clearSearch" class="search-clear-btn" title="Clear search">×</button>
            <button @click="closeSearch" class="search-close-btn" title="Close search (Esc)">✕</button>
          </div>
        </template>
      </header>

      <main @click="fabMenuOpen = false">
        <!-- Selection Action Bar -->
        <div v-if="selectedNoteIds.size > 0" class="selection-bar">
          <div class="selection-info">
            <span class="selection-count">{{ selectedNoteIds.size }} selected</span>
          </div>
          <div class="selection-actions">
            <button @click="selectAll" class="btn-select-all">Select All</button>
            <button @click="deselectAll" class="btn-deselect-all">Deselect All</button>
            <button @click="triggerDeleteConfirm(null)" class="btn-delete-selected" title="Delete selected notes">
              🗑️ Delete
            </button>
          </div>
        </div>

        <!-- Sort / Control Bar -->
        <div v-else class="control-bar">
          <div class="control-left">
            <span class="notes-count" v-if="!searchQuery">{{ notes.length }} notes</span>
            <span class="notes-count" v-else-if="searchLoading">Searching...</span>
            <span class="notes-count" v-else>{{ sortedNotes.length }} results</span>
          </div>
          <div class="control-right">
            <span class="sort-label">Sort by:</span>
            <select v-model="sortBy" class="sort-select">
              <option value="updatedAt">Last Modified</option>
              <option value="createdAt">Date Created</option>
              <option value="title">Title</option>
            </select>
            <button @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'" class="sort-dir-btn" :title="sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'">
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </button>
          </div>
        </div>

        <div class="notes-grid" :class="{ 'notes-grid-selection-active': selectedNoteIds.size > 0 }">
          <!-- Always Show Shortcuts Tip Card First -->
          <div class="note-card shortcut-tips-card">
            <div class="note-content">
              <h3>💡 Quick Shortcuts</h3>
              <div class="shortcut-tips-content">
                <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>{{ modKey }}</kbd> + <kbd>Enter</kbd></span>
                <span class="shortcut-desc">Create note (closed)</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><kbd>{{ modKey }}</kbd> + <kbd>Enter</kbd></span>
                <span class="shortcut-desc">Save note (editing)</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><kbd>{{ modKey }}</kbd> + <kbd>V</kbd></span>
                  <span class="shortcut-desc">Paste clipboard note</span>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-keys"><kbd>Esc</kbd></span>
                  <span class="shortcut-desc">Cancel edit / delete</span>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-keys"><kbd>{{ modKey }}</kbd> + <kbd>I</kbd></span>
                  <span class="shortcut-desc">Open search</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Real Note Cards -->
          <div 
            v-for="note in sortedNotes" 
            :key="note.id" 
            class="note-card" 
            :class="{ 
              editing: note.id === editingId,
              selected: selectedNoteIds.has(note.id),
              'canvas-note': note.type === 'canvas'
            }"
            @click="handleCardClick(note)"
          >
            <!-- Toolbar row: checkbox + copy + delete -->
            <div class="card-toolbar">
              <div class="card-checkbox-container" @click.stop>
                <input 
                  type="checkbox" 
                  :checked="selectedNoteIds.has(note.id)" 
                  @change="toggleSelect(note.id)"
                  class="card-checkbox"
                >
              </div>
              <div class="toolbar-spacer"></div>
              <!-- Copy button (text notes only) -->
              <button
                v-if="note.type !== 'canvas'"
                @click.stop="copyNote(note)"
                class="copy-btn"
                :class="{ copied: copiedId === note.id }"
                :title="copiedId === note.id ? 'Copied!' : 'Copy note'"
              >
                <svg v-if="copiedId === note.id" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              <button @click.stop="triggerDeleteConfirm(note.id)" class="delete-btn" title="Delete note">×</button>
            </div>

            <div class="note-content">
              <!-- Canvas note: show thumbnail -->
              <div v-if="note.type === 'canvas'" class="canvas-thumbnail-wrapper">
                <img 
                  v-if="note.thumbnail" 
                  :src="note.thumbnail" 
                  class="canvas-thumbnail" 
                  alt="Canvas thumbnail"
                />
                <div v-else class="canvas-thumbnail-placeholder">
                  <span>✏️</span>
                  <span>Whiteboard</span>
                </div>
              </div>
              <h3>{{ getDisplayTitle(note, { fallback: note.type === 'canvas' ? 'Untitled Whiteboard' : 'Untitled' }) }}</h3>
              <p v-if="note.type !== 'canvas'" v-html="renderContent(note.content)"></p>
              <small class="note-date">{{ formatDate(note.updatedAt) }}</small>
            </div>
          </div>
        </div>
      </main>

      <!-- Modal for Add/Edit Note -->
      <div v-if="isModalOpen" class="modal-overlay" @mousedown.self="closeModal">
        <div
          class="modal-content note-form-modal"
          :class="{ 'editing-form': editingId !== null }"
          :style="modalSize.width ? { width: modalSize.width + 'px', height: modalSize.height + 'px', maxWidth: 'none', maxHeight: 'none' } : {}"
        >
          <div class="modal-header">
            <h2>{{ editingId ? 'Editing Note' : 'New Note' }}</h2>
            <button @click="closeModal" class="close-modal-btn">×</button>
          </div>
          <form @submit.prevent="editingId ? saveEdit() : addNote()">
            <input
              ref="modalTitleInput"
              v-model="newNoteTitle"
              type="text"
              placeholder="Title"
              class="note-title-input"
              @keydown.ctrl.enter.stop.prevent="editingId ? saveEdit() : addNote()"
              @keydown.meta.enter.stop.prevent="editingId ? saveEdit() : addNote()"
            >
            <div class="note-editor-toolbar">
              <button type="button" @click="formatBold" class="toolbar-btn" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
              <button type="button" @click="formatItalic" class="toolbar-btn" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
              <button type="button" @click="insertLink" class="toolbar-btn" title="Insert link" aria-label="Insert link">🔗</button>
              <button type="button" @click="insertCheckbox" class="toolbar-btn" title="Checkbox (to-do item)" aria-label="Checkbox">☑</button>
              <span class="toolbar-spacer"></span>
              <button type="button" @click="triggerImageUpload" class="image-btn" :disabled="imageUploading" title="Insert image">
                {{ imageUploading ? '⏳' : '🖼️' }}
              </button>
            </div>
            <div
              ref="imageEditor"
              class="note-editor"
              contenteditable="true"
              data-placeholder="Take a note..."
              @input="onEditorInput"
              @keydown="onEditorKeydown"
              @paste="onEditorPaste"
              @focus="onEditorFocus"
              @blur="onEditorBlur"
              @click="onEditorClick"
            ></div>
            <div class="note-form-actions">
              <div class="action-buttons">
                <button type="submit" class="save-btn">{{ editingId ? 'Save' : 'Add Note' }}</button>
                <button type="button" @click="closeModal" class="cancel-btn">Cancel</button>
              </div>
              <small>{{ editingId ? `${modKey}+Enter to save` : `${modKey}+Enter to add` }}</small>
            </div>
            <input
              ref="imageUploadInput"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              style="display: none"
              @change="onImageFileSelected"
            >
          </form>
          <div class="modal-resize-handle" @mousedown.prevent="startResize"></div>

          <!-- Text-note deletion-elsewhere mask (no alert; inline prompt) -->
          <div
            v-if="deletedMask && editingId === deletedMask.noteId"
            class="deleted-mask deleted-mask--in-modal"
          >
            <div class="deleted-mask-panel">
              <h3>⚠️ This note was deleted on another client</h3>
              <p>Your local edits are still here. Save them as a new note, or discard.</p>
              <div class="deleted-mask-actions">
                <button type="button" class="save-btn" @click="saveDeletedAsNew">Save as new note</button>
                <button type="button" class="cancel-btn" @click="discardDeleted">Discard</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Unsaved Changes Confirmation Modal -->
      <div v-if="isUnsavedChangesOpen" class="modal-overlay" @mousedown.self="cancelDiscardChanges">
        <div class="modal-content confirm-modal">
          <h2>Unsaved Changes</h2>
          <p>
            You have unsaved changes. What would you like to do?
          </p>
          <div class="confirm-actions">
            <button @click="saveAndClose" class="save-btn">Save</button>
            <button @click="discardChanges" class="cancel-confirm-btn">Discard</button>
            <button @click="cancelDiscardChanges" class="delete-confirm-btn">Continue Editing</button>
          </div>
        </div>
      </div>

      <!-- Custom Confirmation Modal for Deletion -->
      <div v-if="isConfirmOpen" class="modal-overlay" @mousedown.self="closeConfirm">
        <div class="modal-content confirm-modal">
          <h2>{{ noteToDeleteId ? 'Delete Note?' : 'Delete Selected Notes?' }}</h2>
          <p>
            {{ noteToDeleteId ? 'Are you sure you want to delete this note?' : `Are you sure you want to delete these ${selectedNoteIds.size} selected notes?` }}
            This action cannot be undone.
          </p>
          <div class="confirm-actions">
            <button @click="confirmDelete" class="delete-confirm-btn">Delete</button>
            <button @click="closeConfirm" class="cancel-confirm-btn">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Floating Action Button -->
      <div v-if="isAuthenticated" class="fab-container">
        <div v-if="fabMenuOpen" class="fab-menu">
          <button @click="fabNewTextNote" class="fab-menu-item">
            <span class="fab-menu-icon">📝</span>
            <span>Text Note</span>
          </button>
          <button @click="fabNewWhiteboard" class="fab-menu-item">
            <span class="fab-menu-icon">✏️</span>
            <span>Whiteboard</span>
          </button>
        </div>
        <button
          @click="toggleFabMenu"
          class="fab-btn"
          :class="{ 'fab-open': fabMenuOpen }"
          title="Create new"
        >
          +
        </button>
      </div>

      <!-- Hidden paste receiver for clipboard interception -->
      <textarea
        ref="pasteReceiver"
        class="paste-receiver"
      ></textarea>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import debug from 'debug'
import WhiteboardEditor from './components/WhiteboardEditor.vue'
import { getDisplayTitle } from './utils/notes.js'

const log = debug('local-keep:client')
const API_BASE = window.location.origin

// API helper
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (runtimeToken) headers['X-Auth-Token'] = runtimeToken

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

// In-memory session token (NOT persisted to storage). Used for the WebSocket
// `?token=` query string and as a redundant X-Auth-Token header. REST auth
// relies on the httpOnly cookie the server sets on verify/setup.
let runtimeToken = null

// Platform detection
const isMac = /Mac/.test(navigator.userAgent)
const modKey = isMac ? 'Cmd' : 'Ctrl'

export default {
  name: 'App',
  components: { WhiteboardEditor },
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
    const isModalOpen = ref(false)
    const copiedId = ref(null)
    const isConfirmOpen = ref(false)
    const noteToDeleteId = ref(null)
    const isUnsavedChangesOpen = ref(false)
    const fabMenuOpen = ref(false)
    const sortBy = ref('updatedAt')
    const sortOrder = ref('desc')
    const selectedNoteIds = ref(new Set())

    // Search state
    const searchOpen = ref(false)
    const searchQuery = ref('')
    const searchResults = ref(null)
    const searchLoading = ref(false)
    let searchTimer = null

    // Canvas / Whiteboard state
    const currentView = ref('list') // 'list' | 'canvas'
    const editingCanvasId = ref(null)
    const editingCanvasData = ref(null)
    const editingCanvasTitle = ref('')

    // Deletion-elsewhere mask state: { noteId, deletedAt } | null.
    // When set AND the user is viewing/editing that note, an inline overlay
    // (NOT an alert) is shown with Save-as / Discard actions.
    const deletedMask = ref(null)
    const whiteboardEditorRef = ref(null)

    // Modal resize state
    const modalSize = ref({ width: null, height: null })
    const isResizing = ref(false)
    const justResized = ref(false)
    let resizeStartX = 0
    let resizeStartY = 0
    let resizeStartWidth = 0
    let resizeStartHeight = 0

    // Template refs
    const modalTitleInput = ref(null)
    const modalContentInput = ref(null)
    const searchInput = ref(null)
    const imageUploadInput = ref(null)
    const imageUploading = ref(false)
    const imageEditor = ref(null)
    const selectedImageForResize = ref(null)
    const cleanupRunning = ref(false)

    // WebSocket state
    let ws = null
    const wsRef = ref(null)
    let reconnectTimer = null
    const wsConnecting = ref(false)
    const wsConnected = ref(false)
    const pendingNotes = ref(null)
    const reconnectAttempts = ref(0)

    // Create WebSocket connection
    const connectWebSocket = () => {
      if (!runtimeToken || wsConnecting.value) return

      wsConnecting.value = true

      // Build WebSocket URL - use ws:// or wss:// based on current protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${runtimeToken}`

      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('✅ WebSocket connected')
          wsRef.value = ws
          wsConnecting.value = false
          wsConnected.value = true
          reconnectAttempts.value = 0

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
              // Only update notes if the editor modal is not open
              if (!isModalOpen.value) {
                // Force reactivity by creating a new array reference
                notes.value = [...data.notes]
                pendingNotes.value = null
                console.log(`[${now}] 📨 Notes set in Vue, length: ${notes.value.length}`)
                // Force DOM update using queuePostFlushCb
                requestAnimationFrame(() => {
                  console.log(`[${now}] 📨 After RAF, notes length: ${notes.value.length}`)
                })
              } else {
                console.log(`[${now}] 📨 Skipping - modal open. Buffering update.`)
                pendingNotes.value = [...data.notes]
              }
            } else if (data.type === 'note-deleted' && data.noteId) {
              handleNoteDeletedElsewhere(data.noteId)
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onclose = () => {
          console.log('❌ WebSocket disconnected')
          wsRef.value = null
          ws = null
          wsConnecting.value = false
          wsConnected.value = false

          // Attempt to reconnect with exponential backoff if still authenticated
          if (isAuthenticated.value) {
            const delay = Math.min(3000 * Math.pow(2, reconnectAttempts.value), 30000)
            console.log(`🔌 Attempting reconnect in ${delay / 1000}s (attempt ${reconnectAttempts.value + 1})...`)
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              connectWebSocket()
            }, delay)
            reconnectAttempts.value++
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          wsRef.value = null
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
      wsRef.value = null
      if (ws) {
        ws.close()
        ws = null
      }
      wsConnecting.value = false
      reconnectAttempts.value = 0
    }

    const manualReconnect = () => {
      console.log('🔌 Manual reconnect triggered')
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      reconnectAttempts.value = 0
      connectWebSocket()
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

    // Global KeyDown handler for shortcuts
    const handleKeyDown = async (e) => {
      if (!isAuthenticated.value) return

      log('keydown: key=%s ctrl=%s meta=%s shift=%s alt=%s target=%s',
        e.key, e.ctrlKey, e.metaKey, e.shiftKey, e.altKey,
        document.activeElement?.tagName || 'none')

      // 0. Skip keyboard shortcuts when in canvas editor view
      if (currentView.value === 'canvas') return

      // 1. Handlers when delete confirmation modal is open
      if (isConfirmOpen.value) {
        if (e.key === 'Enter') {
          e.preventDefault()
          confirmDelete()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          closeConfirm()
          return
        }
      }

      // 2. Handlers when unsaved changes confirmation is open
      if (isUnsavedChangesOpen.value) {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveAndClose()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelDiscardChanges()
          return
        }
      }

      // 3. Ctrl+I / Cmd+I to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        if (!isModalOpen.value && !isConfirmOpen.value) {
          e.preventDefault()
          openSearch()
          return
        }
      }

      // 4. Handlers when note editor modal is open
      if (isModalOpen.value) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeModal()
          return
        }
      }

      // 5. Search bar Escape handling
      if (searchOpen.value && e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        closeSearch()
        return
      }

      const activeEl = document.activeElement
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      )

      // Cmd/Ctrl + Enter: Open new note modal if closed
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        log('Cmd/Ctrl+Enter: modalOpen=%s confirmOpen=%s', isModalOpen.value, isConfirmOpen.value)
        if (!isModalOpen.value && !isConfirmOpen.value) {
          e.preventDefault()
          openNewNoteModal()
        }
      }
    }

    // Check if setup is needed on mount
    onMounted(async () => {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('paste', handleWindowPaste)
      try {
        const data = await api('/api/password')
        if (!data.hasPassword) {
          showSetup.value = true
        } else {
          // Cookie is sent automatically; check auth status to skip the
          // password screen if a valid session cookie is present.
          const status = await api('/api/auth/status')
          if (status.authenticated) {
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
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handleWindowPaste)
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

        // Setup issues a session cookie + session token directly
        const data = await api('/api/password/setup', {
          method: 'POST',
          body: JSON.stringify({ password: setupForm.value.password })
        })

        runtimeToken = data.token || null
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

        runtimeToken = data.token || null
        isAuthenticated.value = true
        loginError.value = ''
        await loadNotes()
        connectWebSocket()
      } catch (e) {
        loginError.value = e.message
      }
    }

    const logout = async () => {
      // Revoke the session server-side (also clears the cookie)
      try {
        await api('/api/auth/logout', { method: 'POST' })
      } catch (e) {
        console.error('Logout failed', e)
      }
      runtimeToken = null
      isAuthenticated.value = false
      loginForm.value.password = ''
      loginError.value = ''
      disconnectWebSocket()
      closeModal(true)
    }

    // Modal creation/editing triggers
    const toggleFabMenu = () => {
      fabMenuOpen.value = !fabMenuOpen.value
    }

    const fabNewTextNote = () => {
      fabMenuOpen.value = false
      openNewNoteModal()
    }

    const fabNewWhiteboard = () => {
      fabMenuOpen.value = false
      openNewCanvas()
    }

    // ── Image editor helpers ──
    function markdownToHTML(text) {
      if (!text) return ''
      const parts = []
      let lastIndex = 0
      const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g
      let match
      while ((match = imgRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(document.createTextNode(text.slice(lastIndex, match.index)))
        }
        const img = document.createElement('img')
        img.src = match[2]
        img.alt = match[1]
        // Parse optional width: ![alt](url){width=N}
        const widthMatch = match[0].match(/\{width=(\d+)\}$/)
        if (widthMatch) {
          img.setAttribute('data-width', widthMatch[1])
          img.style.width = widthMatch[1] + 'px'
        }
        img.setAttribute('data-md', match[0])
        // Broken image → convert to editable markdown text
        img.onerror = function() {
          if (this.parentNode) {
            const md = this.getAttribute('data-md') || ''
            const textNode = document.createTextNode(md)
            this.parentNode.replaceChild(textNode, this)
            newNoteContent.value = serializeEditorToMarkdown()
          }
        }
        parts.push(img)
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < text.length) {
        parts.push(document.createTextNode(text.slice(lastIndex)))
      }
      if (parts.length === 0) return ''
      const fragment = document.createDocumentFragment()
      parts.forEach(p => fragment.appendChild(p))
      const temp = document.createElement('div')
      temp.appendChild(fragment)
      return temp.innerHTML
    }

    function renderEditorContent() {
      const el = imageEditor.value
      if (!el) return
      el.innerHTML = markdownToHTML(newNoteContent.value)
    }

    const openNewNoteModal = () => {
      isModalOpen.value = true
      editingId.value = null
      newNoteTitle.value = ''
      newNoteContent.value = ''
      modalSize.value = { width: null, height: null }
      setTimeout(() => {
        if (modalTitleInput.value) {
          modalTitleInput.value.focus()
        }
      }, 50)
    }

    const handleWindowPaste = (e) => {
      if (!isAuthenticated.value) return
      if (currentView.value === 'canvas') return
      const activeEl = document.activeElement
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      )
      log('paste event: inputActive=%s target=%s', isInputActive, activeEl?.tagName || 'none')
      if (isInputActive) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text') || ''
      log('paste intercepted: textLength=%d', text.length)
      if (!text.trim()) return
      isModalOpen.value = true
      editingId.value = null
      newNoteTitle.value = ''
      newNoteContent.value = text
      modalSize.value = { width: null, height: null }
      setTimeout(() => {
        if (modalContentInput.value) {
          modalContentInput.value.focus()
        }
      }, 50)
    }

    const hasUnsavedChanges = () => {
      if (editingId.value) {
        const original = notes.value.find(n => n.id === editingId.value)
        if (original) {
          return newNoteTitle.value !== original.title || newNoteContent.value !== original.content
        }
        return true
      }
      return newNoteTitle.value.trim() !== '' || newNoteContent.value.trim() !== ''
    }

    const closeModal = (force = false) => {
      if (justResized.value) return
      if (force !== true && hasUnsavedChanges()) {
        isUnsavedChangesOpen.value = true
        return
      }
      isModalOpen.value = false
      editingId.value = null
      newNoteTitle.value = ''
      newNoteContent.value = ''
      if (pendingNotes.value) {
        notes.value = [...pendingNotes.value]
        pendingNotes.value = null
      }
      modalSize.value = { width: null, height: null }
    }

    const discardChanges = () => {
      isUnsavedChangesOpen.value = false
      closeModal(true)
    }

    const saveAndClose = async () => {
      isUnsavedChangesOpen.value = false
      if (editingId.value) {
        await saveEdit()
      } else {
        await addNote()
      }
    }

    const cancelDiscardChanges = () => {
      isUnsavedChangesOpen.value = false
    }

    const startResize = (e) => {
      isResizing.value = true
      resizeStartX = e.clientX
      resizeStartY = e.clientY
      resizeStartWidth = e.target.closest('.modal-content').offsetWidth
      resizeStartHeight = e.target.closest('.modal-content').offsetHeight
      window.addEventListener('mousemove', onResize)
      window.addEventListener('mouseup', stopResize)
    }

    const onResize = (e) => {
      if (!isResizing.value) return
      const dx = e.clientX - resizeStartX
      const dy = e.clientY - resizeStartY
      modalSize.value = {
        width: Math.max(340, resizeStartWidth + dx),
        height: Math.max(280, resizeStartHeight + dy)
      }
    }

    const stopResize = () => {
      isResizing.value = false
      justResized.value = true
      setTimeout(() => { justResized.value = false }, 0)
      window.removeEventListener('mousemove', onResize)
      window.removeEventListener('mouseup', stopResize)
    }

    // Copy note action
    const copyNote = async (note) => {
      console.log('[DEBUG] copyNote called for note:', note.id)
      try {
        const textToCopy = note.title ? `${note.title}\n\n${note.content}` : note.content
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy)
        } else {
          // Fallback for non-secure contexts (e.g., LAN IP access)
          const textarea = document.createElement('textarea')
          textarea.value = textToCopy
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }
        console.log('[DEBUG] Clipboard write successful')
        copiedId.value = note.id
        setTimeout(() => {
          if (copiedId.value === note.id) {
            copiedId.value = null
          }
        }, 1500)
      } catch (err) {
        console.error('[DEBUG] Failed to copy note content:', err)
      }
    }

    const addNote = async () => {
      try {
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content: newNoteContent.value.trim()
          })
        })
        notes.value.unshift(note)
        closeModal(true)
      } catch (e) {
        console.error('Failed to add note', e)
      }
    }

    const triggerDeleteConfirm = (id = null) => {
      console.log('[DEBUG] triggerDeleteConfirm called for ID:', id)
      noteToDeleteId.value = id
      isConfirmOpen.value = true
    }

    const closeConfirm = () => {
      console.log('[DEBUG] closeConfirm called')
      isConfirmOpen.value = false
      noteToDeleteId.value = null
    }

    const confirmDelete = async () => {
      console.log('[DEBUG] confirmDelete called')
      try {
        if (noteToDeleteId.value) {
          const id = noteToDeleteId.value
          const result = await api(`/api/notes/${id}`, { method: 'DELETE' })
          console.log('[DEBUG] API response:', result)
          notes.value = notes.value.filter(n => n.id !== id)
          if (selectedNoteIds.value.has(id)) {
            toggleSelect(id)
          }
        } else if (selectedNoteIds.value.size > 0) {
          const ids = Array.from(selectedNoteIds.value)
          const result = await api('/api/notes/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids })
          })
          console.log('[DEBUG] API response:', result)
          notes.value = notes.value.filter(n => !selectedNoteIds.value.has(n.id))
          deselectAll()
        }
        closeConfirm()
      } catch (e) {
        console.error('[DEBUG] Error in confirmDelete:', e)
      }
    }

    const toggleSelect = (id) => {
      console.log('[DEBUG] toggleSelect called for ID:', id)
      const next = new Set(selectedNoteIds.value)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      selectedNoteIds.value = next
    }

    const selectAll = () => {
      console.log('[DEBUG] selectAll called')
      selectedNoteIds.value = new Set(sortedNotes.value.map(n => n.id))
    }

    const deselectAll = () => {
      console.log('[DEBUG] deselectAll called')
      selectedNoteIds.value = new Set()
    }

    const handleCardClick = (note) => {
      if (selectedNoteIds.value.size > 0) {
        toggleSelect(note.id)
      } else if (note.type === 'canvas') {
        openCanvasNote(note)
      } else {
        startEditing(note)
      }
    }

    const startEditing = (note) => {
      pendingNotes.value = null
      editingId.value = note.id
      newNoteTitle.value = note.title
      newNoteContent.value = note.content
      isModalOpen.value = true
      modalSize.value = { width: null, height: null }
      nextTick(() => {
        renderEditorContent()
        if (modalTitleInput.value) modalTitleInput.value.focus()
      })
    }

    const saveEdit = async () => {
      try {
        const updated = await api(`/api/notes/${editingId.value}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content: newNoteContent.value.trim()
          })
        })
        const index = notes.value.findIndex(n => n.id === editingId.value)
        if (index !== -1) {
          notes.value[index] = updated
        }
        closeModal(true)
      } catch (e) {
        console.error('Failed to save note', e)
      }
    }

    // Search methods
    const openSearch = () => {
      searchOpen.value = true
      setTimeout(() => {
        if (searchInput.value) searchInput.value.focus()
      }, 100)
    }

    const closeSearch = () => {
      searchOpen.value = false
      searchQuery.value = ''
      searchResults.value = null
      if (searchTimer) clearTimeout(searchTimer)
    }

    const toggleSearch = () => {
      if (searchOpen.value) {
        closeSearch()
      } else {
        openSearch()
      }
    }

    const onSearchInput = () => {
      if (searchTimer) clearTimeout(searchTimer)
      const q = searchQuery.value.trim()
      if (!q) {
        searchResults.value = null
        return
      }
      searchTimer = setTimeout(async () => {
        searchLoading.value = true
        try {
          searchResults.value = await api(`/api/search?q=${encodeURIComponent(q)}`)
        } catch (e) {
          searchResults.value = []
        } finally {
          searchLoading.value = false
        }
      }, 250)
    }

    const clearSearch = () => {
      searchQuery.value = ''
      searchResults.value = null
      if (searchTimer) clearTimeout(searchTimer)
      if (searchInput.value) searchInput.value.focus()
    }

    // Canvas note methods
    const openNewCanvas = async () => {
      try {
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: '',
            content: '',
            type: 'canvas',
            canvasData: null
          })
        })
        editingCanvasId.value = note.id
        editingCanvasData.value = null
        editingCanvasTitle.value = ''
        currentView.value = 'canvas'
      } catch (e) {
        console.error('Failed to create canvas note', e)
      }
    }

    const openCanvasNote = (note) => {
      editingCanvasId.value = note.id
      editingCanvasData.value = note.canvasData || null
      editingCanvasTitle.value = note.title || ''
      currentView.value = 'canvas'
    }

    const closeCanvasEditor = () => {
      currentView.value = 'list'
      editingCanvasId.value = null
      editingCanvasData.value = null
      editingCanvasTitle.value = ''
      // If the canvas was masked because of an external deletion, drop it now.
      if (deletedMask.value) deletedMask.value = null
    }

    // ── Deletion-elsewhere detection (no alert/confirm; mask + Save-as / Discard) ──

    // Called when a WS `note-deleted` arrives. If the user is currently editing
    // or viewing that note, enter the masked state. Otherwise ignore (gallery
    // refresh happens via the bulk `notes` broadcast).
    const handleNoteDeletedElsewhere = (noteId) => {
      if (!noteId) return
      const isOpenTextNote = isModalOpen.value && editingId.value === noteId
      const isOpenCanvas = currentView.value === 'canvas' && editingCanvasId.value === noteId
      if (!isOpenTextNote && !isOpenCanvas) return
      // Idempotent: if already masked for this note, no-op.
      if (deletedMask.value && deletedMask.value.noteId === noteId) return
      deletedMask.value = { noteId, deletedAt: Date.now() }
    }

    // Save-as: create a NEW note from the current local buffer, then switch to it.
    const saveDeletedAsNew = async () => {
      const mask = deletedMask.value
      if (!mask) return
      try {
        const isOpenTextNote = isModalOpen.value && editingId.value === mask.noteId
        const isOpenCanvas = currentView.value === 'canvas' && editingCanvasId.value === mask.noteId

        if (isOpenTextNote) {
          const note = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
              title: newNoteTitle.value.trim(),
              content: newNoteContent.value.trim()
            })
          })
          notes.value.unshift(note)
          closeModal(true)
          deletedMask.value = null
        } else if (isOpenCanvas) {
          // Gather the current Excalidraw scene to save as a new canvas note.
          const scene = whiteboardEditorRef.value?.getCurrentScene?.() || { elements: [], files: {} }
          const canvasData = JSON.stringify({
            elements: (scene.elements || []).map(({ _collab_ts, ...el }) => el),
            files: scene.files || {}
          })
          const note = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
              title: '',
              content: '',
              type: 'canvas',
              canvasData
            })
          })
          notes.value.unshift(note)
          // Close the masked canvas and open the freshly-saved note.
          // Toggling the view off then on unmounts the old editor (calling
          // its collab.detach via onUnmounted) and remounts onto the new id.
          deletedMask.value = null
          editingCanvasData.value = null
          editingCanvasId.value = note.id
          editingCanvasTitle.value = ''
          currentView.value = 'list'
          await nextTick()
          currentView.value = 'canvas'
        }
      } catch (e) {
        console.error('Save-as failed', e)
      }
    }

    // Discard: close the editor without saving.
    const discardDeleted = () => {
      deletedMask.value = null
      if (currentView.value === 'canvas') {
        closeCanvasEditor()
      } else if (isModalOpen.value) {
        newNoteTitle.value = ''
        newNoteContent.value = ''
        closeModal(true)
      }
    }

    // Computed
    const sortedNotes = computed(() => {
      let filtered = notes.value
      if (searchQuery.value.trim() && searchResults.value !== null) {
        const matchIds = new Set(searchResults.value)
        filtered = notes.value.filter(n => matchIds.has(n.id))
      }
      return [...filtered].sort((a, b) => {
        let valA, valB
        if (sortBy.value === 'title') {
          valA = (a.title || '').toLowerCase()
          valB = (b.title || '').toLowerCase()
        } else {
          valA = new Date(a[sortBy.value])
          valB = new Date(b[sortBy.value])
        }

        if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1
        if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1
        return 0
      })
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
      sortedNotes,
      addNote,
      startEditing,
      saveEdit,
      formatDate,
      getDisplayTitle,
      // Modal/Shortcuts
      isModalOpen,
      modalSize,
      startResize,
      copiedId,
      modalTitleInput,
      modalContentInput,
      openNewNoteModal,
      toggleFabMenu,
      fabNewTextNote,
      fabNewWhiteboard,
      closeModal,
      copyNote,
      // Delete Confirmation Modal
      isConfirmOpen,
      triggerDeleteConfirm,
      closeConfirm,
      confirmDelete,
      // Unsaved Changes Confirmation
      isUnsavedChangesOpen,
      fabMenuOpen,
      discardChanges,
      saveAndClose,
      cancelDiscardChanges,
      // Sorting and Selection
      sortBy,
      sortOrder,
      selectedNoteIds,
      toggleSelect,
      selectAll,
      deselectAll,
      handleCardClick,
      // WebSocket
      wsConnected,
      wsConnecting,
      manualReconnect,
      // Platform
      modKey,
      // Search
      searchOpen,
      searchQuery,
      searchResults,
      searchLoading,
      searchInput,
      openSearch,
      closeSearch,
      toggleSearch,
      onSearchInput,
      clearSearch,
      // Canvas
      currentView,
      editingCanvasId,
      editingCanvasData,
      editingCanvasTitle,
      wsRef,
      openNewCanvas,
      openCanvasNote,
      closeCanvasEditor,
      // Deletion-elsewhere mask
      deletedMask,
      whiteboardEditorRef,
      handleNoteDeletedElsewhere,
      saveDeletedAsNew,
      discardDeleted,
      // Image insertion
      imageUploadInput,
      imageUploading,
      imageEditor,
      selectedImageForResize,
      cleanupRunning,
      cleanupImages,
      triggerImageUpload,
      // Text formatting toolbar
      formatBold,
      formatItalic,
      insertLink,
      insertCheckbox,
      onImageFileSelected,
      onEditorInput,
      onEditorKeydown,
      onEditorPaste,
      onEditorFocus,
      onEditorBlur,
      onEditorClick,
      renderContent
    }

    // ── ContentEditable editor functions (after return) ──
    function serializeEditorToMarkdown() {
      const el = imageEditor.value
      if (!el) return newNoteContent.value

      function serialize(node) {
        if (node.nodeType === 3) return node.textContent
        if (node.nodeType !== 1) return ''
        const tag = node.tagName

        if (tag === 'IMG') {
          const md = node.getAttribute('data-md') || `![${node.alt || 'image'}](${node.src || ''})`
          const w = node.getAttribute('data-width')
          return w ? md.replace(/\{width=\d+\}$/, '') + `{width=${w}}` : md
        }
        if (tag === 'BR') return '\n'
        if (tag === 'DIV') {
          let result = ''
          for (const child of node.childNodes) result += serialize(child)
          return result + '\n'
        }
        if (tag === 'B' || tag === 'STRONG') {
          let inner = ''
          for (const child of node.childNodes) inner += serialize(child)
          return `**${inner}**`
        }
        if (tag === 'I' || tag === 'EM') {
          let inner = ''
          for (const child of node.childNodes) inner += serialize(child)
          return `*${inner}*`
        }
        if (tag === 'A') {
          let inner = ''
          for (const child of node.childNodes) inner += serialize(child)
          return `[${inner}](${node.href || ''})`
        }
        let result = ''
        for (const child of node.childNodes) result += serialize(child)
        return result
      }

      let md = ''
      for (const child of el.childNodes) md += serialize(child)
      return md.replace(/^\n+/, '').replace(/\n+$/, '')
    }

    function isCursorBeforeImage() {
      const sel = window.getSelection()
      if (!sel || !sel.isCollapsed) return false
      const range = sel.getRangeAt(0)
      const container = range.startContainer
      const offset = range.startOffset
      const editor = imageEditor.value
      if (!editor) return false

      // Case 1: cursor is at editor level, first child is an image
      if (container === editor && offset === 0) {
        const el = editor.firstChild
        return el && el.tagName === 'IMG'
      }
      // Case 2: cursor is in a text node, right before a sibling image
      if (container.nodeType === 3 && offset === container.textContent.length) {
        const next = container.nextSibling
        if (next && next.tagName === 'IMG') return true
      }
      // Case 3: cursor is at editor level, before a non-first image child
      if (container === editor && offset > 0) {
        const child = editor.childNodes[offset]
        return child && child.tagName === 'IMG'
      }
      return false
    }

    // ── Editor event handlers ──
    function onEditorInput() {
      const el = imageEditor.value
      if (!el) return

      // Auto-convert completed markdown image: ![...](...)  →  <img>
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        let node = range.startContainer
        if (node.nodeType === 3) {
          const text = node.textContent
          const imgMatch = text.match(/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/)
          if (imgMatch) {
            const before = text.slice(0, imgMatch.index)
            const after = text.slice(imgMatch.index + imgMatch[0].length)
            const parent = node.parentNode
            const img = document.createElement('img')
            img.src = imgMatch[2]
            img.alt = imgMatch[1]
            img.setAttribute('data-md', imgMatch[0])
            if (imgMatch[3]) {
              img.setAttribute('data-width', imgMatch[3])
              img.style.width = imgMatch[3] + 'px'
            }
            const frag = document.createDocumentFragment()
            if (before) frag.appendChild(document.createTextNode(before))
            frag.appendChild(img)
            const afterNode = document.createTextNode(after || '')
            frag.appendChild(afterNode)
            parent.replaceChild(frag, node)
            // Place cursor after the image
            const newRange = document.createRange()
            newRange.setStart(afterNode, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
          }
        }
      }

      newNoteContent.value = serializeEditorToMarkdown()
    }

    function onEditorKeydown(e) {
      // Cmd/Ctrl+Enter to save
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        editingId.value ? saveEdit() : addNote()
        return
      }
      // Backspace on image → convert to editable markdown text
      if (e.key === 'Backspace' && isCursorBeforeImage()) {
        e.preventDefault()
        hideResizeHandles()
        const sel = window.getSelection()
        const range = sel.getRangeAt(0)
        const container = range.startContainer
        const offset = range.startOffset
        const editor = imageEditor.value

        let img
        if (container === editor) {
          img = editor.childNodes[offset] || editor.firstChild
        } else if (container.nodeType === 3 && container.nextSibling?.tagName === 'IMG') {
          img = container.nextSibling
        }
        if (!img || img.tagName !== 'IMG') return

        const md = img.getAttribute('data-md') || `![${img.alt || 'image'}](${img.src || ''})`
        const textNode = document.createTextNode(md)
        img.parentNode.replaceChild(textNode, img)
        // Place cursor at start of the markdown text
        const newRange = document.createRange()
        newRange.setStart(textNode, 0)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)
        newNoteContent.value = serializeEditorToMarkdown()
      }
    }

    function onEditorFocus() {
      // Re-render any remaining markdown images when editor gains focus
      const text = newNoteContent.value
      if (text && text.includes('![')) {
        requestAnimationFrame(() => renderEditorContent())
      }
    }

    // ── Image click-to-select and resize ──
    function onEditorClick(e) {
      const img = e.target.closest('img')
      if (img && imageEditor.value?.contains(img)) {
        e.preventDefault()
        showResizeHandles(img)
      } else if (selectedImageForResize.value) {
        hideResizeHandles()
      }
    }

    function showResizeHandles(img) {
      hideResizeHandles()
      selectedImageForResize.value = img
      img.classList.add('img-selected')
      const wrapper = document.createElement('span')
      wrapper.className = 'img-resize-wrapper'
      img.parentNode.insertBefore(wrapper, img)
      wrapper.appendChild(img)
      const handle = document.createElement('span')
      handle.className = 'img-resize-handle'
      handle.addEventListener('mousedown', (e) => onResizeStart(e, img))
      wrapper.appendChild(handle)
    }

    function hideResizeHandles() {
      if (!selectedImageForResize.value) return
      const img = selectedImageForResize.value
      img.classList.remove('img-selected')
      const wrapper = img.closest('.img-resize-wrapper')
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(img, wrapper)
        wrapper.remove()
      }
      selectedImageForResize.value = null
      newNoteContent.value = serializeEditorToMarkdown()
    }

    function onResizeStart(e, img) {
      e.preventDefault()
      e.stopPropagation()
      // Allow image to grow beyond container during resize
      img.style.maxWidth = 'none'
      const startWidth = img.offsetWidth
      const startHeight = img.offsetHeight
      const aspectRatio = startWidth / startHeight
      const startX = e.clientX

      function onMouseMove(e) {
        const newWidth = Math.max(50, Math.round(startWidth + (e.clientX - startX)))
        img.style.width = newWidth + 'px'
        img.style.height = Math.round(newWidth / aspectRatio) + 'px'
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        const finalWidth = img.offsetWidth
        img.setAttribute('data-width', String(finalWidth))
        // Update data-md to include width
        const oldMd = img.getAttribute('data-md') || ''
        const baseMd = oldMd.replace(/\{width=\d+\}$/, '')
        img.setAttribute('data-md', baseMd + `{width=${finalWidth}}`)
        newNoteContent.value = serializeEditorToMarkdown()
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    function onEditorBlur() {
      newNoteContent.value = serializeEditorToMarkdown()
    }

    // ── Image upload ──
    function triggerImageUpload() {
      imageUploadInput.value?.click()
    }

    // ── Text formatting toolbars ──
    // The editor uses document.execCommand on the contentEditable body; the
    // resulting <b>/<i>/<a> nodes are serialized to markdown by
    // serializeEditorToMarkdown(). Checkbox inserts a markdown "- [ ] " prefix.

    function focusEditorAtSelection() {
      const el = imageEditor.value
      if (!el) return null
      // Make sure the editor is focused; if the selection isn't inside it,
      // place the caret at the end so we have a stable anchor.
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      return sel
    }

    function formatBold() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('bold', false, null)
      newNoteContent.value = serializeEditorToMarkdown()
    }

    function formatItalic() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('italic', false, null)
      newNoteContent.value = serializeEditorToMarkdown()
    }

    function insertLink() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const hasSelection = sel.rangeCount && !sel.getRangeAt(0).collapsed
      const url = window.prompt('Link URL:', 'https://')
      if (!url) return
      const ok = document.execCommand('createLink', false, url)
      if (!ok) {
        // Fallback: insert "<url>" as plain text link
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(document.createTextNode(url))
      }
      newNoteContent.value = serializeEditorToMarkdown()
    }

    function insertCheckbox() {
      const el = imageEditor.value
      if (!el) return
      const sel = focusEditorAtSelection()
      if (!sel) return
      const range = sel.getRangeAt(0)
      // Find the start of the current line so we can prefix it.
      let node = range.startContainer
      let lineStart = 0
      if (node.nodeType === 3) {
        const textBefore = node.textContent.slice(0, range.startOffset)
        const nl = textBefore.lastIndexOf('\n')
        lineStart = nl === -1 ? 0 : nl + 1
      }
      // Insert "- [ ] " at the caret; the content is preserved on serialize.
      const marker = document.createTextNode('- [ ] ')
      range.insertNode(marker)
      // Move caret after the marker
      const newRange = document.createRange()
      newRange.setStartAfter(marker)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
      newNoteContent.value = serializeEditorToMarkdown()
    }

    async function uploadImageFile(file) {
      imageUploading.value = true
      try {
        const formData = new FormData()
        formData.append('image', file)
        const headers = {}
        if (runtimeToken) headers['X-Auth-Token'] = runtimeToken
        const res = await fetch(`${API_BASE}/api/images`, {
          method: 'POST',
          headers,
          body: formData
        })
        if (!res.ok) throw new Error('Upload failed')
        const data = await res.json()
        return `![image](${data.url})`
      } catch (e) {
        console.error('Image upload failed:', e)
        return null
      } finally {
        imageUploading.value = false
      }
    }

    function insertImageInEditor(mdRef) {
      const el = imageEditor.value
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (!sel) return
      const imgHTML = markdownToHTML(mdRef)
      const temp = document.createElement('div')
      temp.innerHTML = imgHTML
      const imgNode = temp.firstChild
      if (!imgNode) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(imgNode)
      // Place cursor after the image
      const afterRange = document.createRange()
      afterRange.setStartAfter(imgNode)
      afterRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(afterRange)
      newNoteContent.value = serializeEditorToMarkdown()
    }

    async function onImageFileSelected(e) {
      const file = e.target.files?.[0]
      if (!file) return
      const mdRef = await uploadImageFile(file)
      if (mdRef) insertImageInEditor(mdRef)
      e.target.value = ''
    }

    async function onEditorPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const mdRef = await uploadImageFile(file)
            if (mdRef) insertImageInEditor(mdRef)
          }
          return
        }
      }
    }

    // Gallery rendering (skip broken images)
    function renderContent(content) {
      if (!content) return ''
      const escaped = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
      return escaped
        // Images: ![alt](url){width=N}
        .replace(
          /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g,
          (match, alt, src, width) => {
            const style = width
              ? `max-width:none;width:${width}px;border-radius:4px;margin:4px 0`
              : 'max-width:100%;border-radius:4px;margin:4px 0'
            return `<img src="${src}" alt="${alt}" style="${style}" onerror="this.style.display='none'">`
          }
        )
        // Checkboxes: "- [ ] " → unchecked ☐, "- [x] " → checked ☑
        .replace(/(^|\n)[ \t]*- \[ \] /g, '$1☐ ')
        .replace(/(^|\n)[ \t]*- \[[xX]\] /g, '$1☑ ')
        // Bold
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        // Italic (avoid eating image alt's already consumed above)
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br>')
    }

    // Image garbage collection
    async function cleanupImages() {
      cleanupRunning.value = true
      try {
        const res = await api('/api/images/cleanup', { method: 'POST' })
        if (res.deleted > 0) {
          alert(`Cleaned up ${res.deleted} unused image(s)`)
        } else {
          alert('No unused images found')
        }
      } catch (e) {
        console.error('Image cleanup failed:', e)
        alert('Cleanup failed: ' + e.message)
      } finally {
        cleanupRunning.value = false
      }
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

.header-search-field {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0;
  background: #f1f3f4;
  border-radius: 8px;
  transition: background 0.2s, box-shadow 0.2s;
  max-width: 600px;
}

.header-search-field:focus-within {
  background: white;
  box-shadow: 0 1px 4px rgba(26, 115, 232, 0.2);
}

.header-search-field .search-icon {
  padding-left: 12px;
  font-size: 1rem;
  color: #80868b;
  flex-shrink: 0;
}

.search-toggle-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #f1f3f4;
  color: #5f6368;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.search-toggle-btn:hover {
  background: #e8eaed;
}

.cleanup-btn {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.cleanup-btn:hover:not(:disabled) {
  background: #e8eaed;
}

.cleanup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-input {
  width: 100%;
  padding: 0.55rem 0.5rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: #202124;
  outline: none;
  border-radius: 8px;
}

.search-input::placeholder {
  color: #80868b;
}

.search-clear-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
  flex-shrink: 0;
}

.search-clear-btn:hover {
  background: #e0e0e0;
  color: #202124;
}

.search-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
  flex-shrink: 0;
  margin-right: 4px;
}

.search-close-btn:hover {
  background: #e0e0e0;
  color: #202124;
}

.search-input-wrapper {
  max-width: 600px;
  margin: 0 auto;
  position: relative;
  display: flex;
  align-items: center;
  background: #f1f3f4;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
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

.reconnect-btn {
  padding: 0.25rem 0.5rem;
  background: #e8f0fe;
  color: #1a73e8;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.2s, border-color 0.2s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.reconnect-btn:hover {
  background: #d2e3fc;
  border-color: #1a73e8;
}

/* Canvas note card */
.note-card.canvas-note {
  cursor: pointer;
}

.canvas-thumbnail-wrapper {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  background: #f8f9fa;
  border: 1px solid #e8eaed;
}

.canvas-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.canvas-thumbnail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  color: #80868b;
  font-size: 0.8125rem;
  padding: 1rem;
}

.canvas-thumbnail-placeholder span:first-child {
  font-size: 2rem;
}

.canvas-untitled {
  color: #80868b;
  font-style: italic;
}

.shortcut-tips-card {
  background: #fdfcf7;
  border-color: #f1ebd9;
  cursor: default !important;
}

.shortcut-tips-content {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  flex: 1;
}

.shortcut-tips-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: #202124;
  flex-shrink: 0;
}

.shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.375rem 0;
  font-size: 0.8125rem;
  text-align: left;
}

.shortcut-row:not(:last-child) {
  border-bottom: 1px dashed #e8eaed;
}

.shortcut-keys {
  display: flex;
  gap: 0.25rem;
}

.shortcut-keys kbd {
  background: white;
  border: 1px solid #dadce0;
  border-radius: 4px;
  box-shadow: 0 1px 1px rgba(0,0,0,0.1);
  color: #3c4043;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
}

.shortcut-desc {
  color: #5f6368;
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
  transition: box-shadow 0.2s, border-color 0.2s, background-color 0.2s;
  height: 380px;
  width: 100%;
  max-width: 260px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.note-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.note-card.editing {
  border-color: #1a73e8;
  background-color: #f8fafd;
  outline: 2px solid #1a73e8;
}

.card-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.toolbar-spacer {
  flex: 1;
}

.note-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.note-content h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #202124;
  flex-shrink: 0;
}

.note-content p {
  white-space: pre-wrap;
  word-break: break-word;
  color: #202124;
  line-height: 1.5;
  margin: 0;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: #dadce0 transparent;
}

.note-content p::-webkit-scrollbar {
  width: 4px;
}

.note-content p::-webkit-scrollbar-track {
  background: transparent;
}

.note-content p::-webkit-scrollbar-thumb {
  background-color: #dadce0;
  border-radius: 2px;
}

.note-date {
  display: block;
  margin-top: 0.75rem;
  color: #80868b;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.25rem;
  cursor: pointer;
  transition: color 0.2s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #80868b;
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-btn.copied {
  opacity: 1;
  color: #1e8e3e;
}

.delete-btn:hover {
  color: #d93025;
}

.copy-btn:hover:not(.copied) {
  color: #1a73e8;
}

/* Custom Confirm Modal styling */
.confirm-modal {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  position: relative;
  animation: slideUp 0.2s ease-out;
  text-align: center;
  box-sizing: border-box;
}

.confirm-modal h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: #202124;
}

.confirm-modal p {
  font-size: 0.9rem;
  color: #5f6368;
  margin: 0 0 1.5rem 0;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.delete-confirm-btn {
  padding: 0.5rem 1.5rem;
  background: #d93025;
  color: white;
  border: 1px solid #d93025;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.delete-confirm-btn:hover {
  background: #b8251b;
  border-color: #b8251b;
}

.cancel-confirm-btn {
  padding: 0.5rem 1.5rem;
  background: #f1f3f4;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.cancel-confirm-btn:hover {
  background: #e8eaed;
}

/* Modal Layout */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.note-form-modal {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  width: min(620px, 90vw);
  min-height: min(700px, 90vh);
  max-height: 90vh;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  position: relative;
  animation: slideUp 0.2s ease-out;
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.note-form-modal.editing-form {
  border: 2px solid #1a73e8;
  box-shadow: 0 10px 25px rgba(26, 115, 232, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.5rem;
}

.modal-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: #202124;
}

.close-modal-btn {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  color: #80868b;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.close-modal-btn:hover {
  background: #f1f3f4;
  color: #202124;
}

.note-form-modal .note-title-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  box-sizing: border-box;
}

.note-form-modal form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.note-form-modal textarea,
.note-form-modal .note-editor {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  margin-bottom: 0.75rem;
  box-sizing: border-box;
  flex: 1;
  min-height: 100px;
  overflow-y: auto;
}

.note-form-modal textarea {
  resize: none;
}

.note-form-modal .note-editor {
  white-space: pre-wrap;
  word-wrap: break-word;
  outline: none;
  cursor: text;
  line-height: 1.5;
}

.note-form-modal .note-editor:empty::before {
  content: attr(data-placeholder);
  color: #9aa0a6;
  pointer-events: none;
}

.note-form-modal .note-editor img[data-md] {
  max-width: 100%;
  border-radius: 4px;
  margin: 4px 0;
  cursor: default;
  vertical-align: middle;
}

.note-form-modal .note-editor img[data-width] {
  max-width: none;
}

.note-form-modal .note-editor img.img-selected {
  outline: 2px solid #1a73e8;
  outline-offset: 2px;
  cursor: nwse-resize;
}

.note-form-modal .note-editor .img-resize-wrapper {
  position: relative;
  display: inline-block;
  line-height: 0;
}

.note-form-modal .note-editor .img-resize-handle {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  background: #1a73e8;
  border: 2px solid white;
  border-radius: 2px;
  cursor: nwse-resize;
  z-index: 1;
}

.note-form-modal .note-title-input:focus,
.note-form-modal textarea:focus,
.note-form-modal .note-editor:focus {
  outline: none;
  border-color: #1a73e8;
}

.modal-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
}
.modal-resize-handle::after {
  content: '';
  display: block;
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 10px;
  height: 10px;
  border-right: 2px solid #bcc0c4;
  border-bottom: 2px solid #bcc0c4;
}

.note-form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.image-btn {
  padding: 0.5rem 0.75rem;
  background: #f8f9fa;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.image-btn:hover:not(:disabled) {
  background: #e8eaed;
}

.image-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.note-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid #ededed;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.toolbar-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 0.5rem;
  background: #f8f9fa;
  color: #3c4043;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.toolbar-btn:hover {
  background: #e8eaed;
}
.toolbar-btn:active {
  background: #dadce0;
}

/* Deletion-elsewhere mask (no alert; inline overlay + prompt) */
.deleted-mask {
  position: fixed;
  inset: 0;
  background: rgba(32, 33, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.deleted-mask--in-modal {
  position: absolute;
  inset: 0;
  border-radius: 8px;
}
.deleted-mask-panel {
  background: #fff;
  border-radius: 8px;
  padding: 1.5rem 1.75rem;
  max-width: 420px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  text-align: center;
}
.deleted-mask-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  color: #b3261e;
}
.deleted-mask-panel p {
  margin: 0 0 1.25rem;
  color: #5f6368;
  font-size: 0.9rem;
}
.deleted-mask-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.save-btn {
  padding: 0.5rem 1.25rem;
  background: #1a73e8;
  color: white;
  border: 1px solid #1a73e8;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #1557b0;
  border-color: #1557b0;
}

.cancel-btn {
  padding: 0.5rem 1.25rem;
  background: #f1f3f4;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.cancel-btn:hover {
  background: #e8eaed;
}

.note-form-actions small {
  color: #80868b;
  font-size: 0.75rem;
}

/* Sort / Action Bar */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 8px;
}

.notes-count {
  font-size: 0.875rem;
  color: #5f6368;
  font-weight: 500;
}

.control-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-label {
  font-size: 0.875rem;
  color: #5f6368;
}

.sort-select {
  padding: 0.375rem 0.5rem;
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: white;
  font-size: 0.875rem;
  color: #202124;
  cursor: pointer;
  outline: none;
}

.sort-select:focus {
  border-color: #1a73e8;
}

.sort-dir-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #dadce0;
  background: white;
  color: #5f6368;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: bold;
  transition: background 0.2s, color 0.2s;
}

.sort-dir-btn:hover {
  background: #f1f3f4;
  color: #202124;
}

/* Selection Action Bar */
.selection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 0.5rem 1rem;
  background: #e8f0fe;
  border: 1px solid #d2e3fc;
  border-radius: 8px;
  color: #1a73e8;
  animation: fadeIn 0.2s ease-out;
}

.selection-count {
  font-size: 0.9rem;
  font-weight: 600;
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-select-all,
.btn-deselect-all {
  padding: 0.375rem 0.75rem;
  background: transparent;
  color: #1a73e8;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-select-all:hover,
.btn-deselect-all:hover {
  background: #d2e3fc;
}

.btn-delete-selected {
  padding: 0.375rem 1rem;
  background: #d93025;
  color: white;
  border: 1px solid #d93025;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-delete-selected:hover {
  background: #b8251b;
  border-color: #b8251b;
}

/* Card Selection Checkboxes */
.card-checkbox-container {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: #1a73e8;
}

.note-card.selected {
  border-color: #1a73e8 !important;
  background-color: #f8fafd !important;
  outline: 2px solid #1a73e8;
}

/* Floating Action Button */
.fab-btn {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  font-size: 2rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(118, 75, 162, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  z-index: 99;
}

.fab-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 15px rgba(118, 75, 162, 0.6);
}

.fab-btn.fab-open {
  transform: rotate(45deg);
}

.fab-container {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 100;
}

.fab-menu {
  position: absolute;
  bottom: 68px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  animation: slideUp 0.15s ease-out;
}

.fab-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: background 0.15s;
}

.fab-menu-item:hover {
  background: #f5f5f5;
}

.fab-menu-icon {
  font-size: 1.125rem;
}

.paste-receiver {
  position: fixed;
  top: -9999px;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 600px) {
  main {
    padding: 1rem;
  }

  .notes-grid {
    grid-template-columns: 1fr;
  }
  
  .fab-btn {
    bottom: 1.5rem;
    right: 1.5rem;
    width: 48px;
    height: 48px;
    font-size: 1.75rem;
  }
}
</style>
