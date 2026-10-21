<template>
  <div id="app">
    <!-- Setup / Onboarding Screen -->
    <div v-if="showSetup" class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><span class="auth-logo">📝</span> Local Keep</div>
        <h1>Create your workspace</h1>
        <p class="subtitle">Set up the first admin account. You can add more people later.</p>
        <form class="auth-form" @submit.prevent="setupPassword">
          <label>
            Username
            <input
              v-model="setupForm.username"
              type="text"
              placeholder="admin"
              autocomplete="username"
              required
              autofocus
            >
          </label>
          <label>
            Display name
            <input
              v-model="setupForm.displayName"
              type="text"
              placeholder="Your name"
              autocomplete="name"
            >
          </label>
          <label>
            Password
            <span class="password-field">
              <input
                v-model="setupForm.password"
                :type="showSetupPassword ? 'text' : 'password'"
                placeholder="At least 8 characters"
                autocomplete="new-password"
                required
              >
              <button type="button" class="password-toggle" @click="showSetupPassword = !showSetupPassword">
                {{ showSetupPassword ? 'Hide' : 'Show' }}
              </button>
            </span>
          </label>
          <label>
            Confirm password
            <input
              v-model="setupForm.confirm"
              :type="showSetupPassword ? 'text' : 'password'"
              placeholder="Repeat password"
              autocomplete="new-password"
              required
            >
          </label>
          <p v-if="setupError" class="error">{{ setupError }}</p>
          <button type="submit" class="auth-primary">Create workspace</button>
        </form>
        <p class="auth-footnote">Local-first notes · your data stays on this machine</p>
      </div>
    </div>

    <!-- Login Screen -->
    <div v-else-if="!isAuthenticated" class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><span class="auth-logo">📝</span> Local Keep</div>
        <h1>Welcome back</h1>
        <p class="subtitle">Sign in to your private workspace.</p>
        <form class="auth-form" @submit.prevent="login">
          <label>
            Username
            <input
              v-model="loginForm.username"
              type="text"
              placeholder="Username"
              autocomplete="username"
              required
              autofocus
            >
          </label>
          <label>
            Password
            <span class="password-field">
              <input
                v-model="loginForm.password"
                :type="showLoginPassword ? 'text' : 'password'"
                placeholder="Password"
                autocomplete="current-password"
                required
              >
              <button type="button" class="password-toggle" @click="showLoginPassword = !showLoginPassword">
                {{ showLoginPassword ? 'Hide' : 'Show' }}
              </button>
            </span>
          </label>
          <div class="auth-row">
            <span class="auth-hint">Signed in for 30 days</span>
            <button type="button" class="link-btn" @click="showForgot = !showForgot">
              Forgot password?
            </button>
          </div>
          <p v-if="loginError" class="error">{{ loginError }}</p>
          <button type="submit" class="auth-primary">Sign in</button>
        </form>

        <div v-if="showForgot" class="forgot-panel">
          <strong>Password reset</strong>
          <p>
            This is a self-hosted workspace without email delivery. Ask an admin to reset
            your password, or run this on the server:
          </p>
          <code>npm run auth:reset -- &lt;username&gt;</code>
          <p class="auth-hint">The command prints a temporary password once.</p>
        </div>

        <p class="auth-footnote">Accounts are managed by a workspace admin.</p>
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
            <button @click="tagSidebarOpen = !tagSidebarOpen" class="search-toggle-btn" :class="{ active: tagSidebarOpen }" title="Toggle tags">🏷</button>
            <button @click="openGraph()" class="search-toggle-btn" title="Relationship graph">🕸</button>
            <button v-if="isAdmin" @click="openMcpSettings" class="search-toggle-btn" title="MCP access tokens">🔌</button>
            <button @click="openSearch" class="search-toggle-btn" title="Search (Ctrl+I)">🔍</button>
            <button @click="cleanupImages" class="cleanup-btn" :disabled="cleanupRunning" title="Clean unused images">🧹</button>
            <div class="account-menu-wrap" @click.stop>
              <button type="button" class="account-btn" @click="accountMenuOpen = !accountMenuOpen">
                <span class="account-avatar">{{ userInitials }}</span>
                <span class="account-name">{{ currentUser?.displayName || currentUser?.username }}</span>
                <span class="account-chevron">▾</span>
              </button>
              <div v-if="accountMenuOpen" class="account-menu">
                <div class="account-menu-head">
                  <strong>{{ currentUser?.displayName || currentUser?.username }}</strong>
                  <small>@{{ currentUser?.username }} · {{ currentUser?.role }}</small>
                </div>
                <button type="button" @click="openAccountSettings()">⚙️ Account settings</button>
                <button v-if="isAdmin" type="button" @click="openUsers">👥 Manage users</button>
                <button v-if="isAdmin" type="button" @click="openEmbeddingSettings">✨ Semantic search</button>
                <button type="button" class="account-menu-danger" @click="logout">🔒 Lock workspace</button>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="header-search-field">
            <span class="search-icon">🔍</span>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              :placeholder="semanticSearchEnabled ? 'Semantic search...' : 'Search notes...'"
              class="search-input"
              @input="onSearchInput"
            >
            <button
              type="button"
              class="search-semantic-btn"
              :class="{ active: semanticSearchEnabled }"
              @click="toggleSemanticSearch"
              :title="semanticSearchEnabled ? 'Semantic search on' : 'Semantic search off'"
            >✨</button>
            <button v-if="searchQuery" @click="clearSearch" class="search-clear-btn" title="Clear search">×</button>
            <button @click="closeSearch" class="search-close-btn" title="Close search (Esc)">✕</button>
          </div>
        </template>
      </header>

      <!-- Revision / conflict notice -->
      <div v-if="revisionNotice" class="revision-toast" role="status">
        <span>{{ revisionNotice }}</span>
        <button type="button" @click="dismissRevisionNotice" title="Dismiss">×</button>
      </div>

      <main @click="fabMenuOpen = false">
        <div class="workspace">
          <TagSidebar
            v-if="tagSidebarOpen"
            :tree="tagsTree"
            :active-tag="activeTag"
            :untagged-only="untaggedOnly"
            @select="selectTag"
            @close="tagSidebarOpen = false"
          />
          <div class="workspace-content">
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
            <span class="notes-count" v-if="!searchQuery">{{ sortedNotes.length }} notes</span>
            <span class="notes-count" v-else-if="searchLoading">Searching...</span>
            <span class="notes-count" v-else>{{ sortedNotes.length }} results</span>
            <span v-if="activeTag" class="tag-filter-chip">
              #{{ activeTag }}
              <button type="button" @click="clearTag" title="Clear tag filter">×</button>
            </span>
            <span v-else-if="untaggedOnly" class="tag-filter-chip">
              Untagged
              <button type="button" @click="clearTag" title="Clear tag filter">×</button>
            </span>
          </div>
          <div class="control-right">
            <button
              @click="toggleShowArchived"
              class="archived-toggle-btn"
              :class="{ active: showArchived }"
              :title="showArchived ? 'Hide archived notes' : 'Show archived notes'"
            >{{ showArchived ? '📥 Hide archived' : '📥 Archived' }}</button>
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
                <div class="shortcut-row">
                  <span class="shortcut-keys"><kbd>{{ modKey }}</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd></span>
                  <span class="shortcut-desc">Cycle Visual / Source</span>
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
              'canvas-note': note.type === 'canvas',
              archived: !!note.archivedAt
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
                v-if="note.type !== 'canvas' && !note.archivedAt"
                @click.stop="copyNote(note)"
                class="copy-btn"
                :class="{ copied: copiedId === note.id }"
                :title="copiedId === note.id ? 'Copied!' : 'Copy note'"
              >
                <svg v-if="copiedId === note.id" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              <button
                v-if="note.archivedAt"
                @click.stop="restoreArchivedNote(note)"
                class="restore-btn"
                title="Restore archived note"
              >Restore</button>
              <button
                v-else
                @click.stop="triggerDeleteConfirm(note.id)"
                class="delete-btn"
                title="Archive note"
              >×</button>
            </div>

            <div class="note-content">
              <span
                v-if="presenceCount(note.id)"
                class="presence-dot"
                :title="presenceTitle(note.id)"
                :aria-label="presenceTitle(note.id)"
              ></span>
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
              <h3>
                {{ getDisplayTitle(note, { fallback: note.type === 'canvas' ? 'Untitled Whiteboard' : 'Untitled' }) }}
                <span v-if="note.archivedAt" class="revision-badge">Archived</span>
              </h3>
              <div v-if="note.tags && note.tags.length" class="card-tags">
                <button
                  v-for="tag in note.tags"
                  :key="tag"
                  type="button"
                  class="tag-chip"
                  @click.stop="selectTag({ tag })"
                  :title="'Filter by #' + tag"
                >#{{ tag }}</button>
              </div>
              <MarkdownView
                v-if="note.type !== 'canvas'"
                class="note-preview"
                :html="renderContent(note.content)"
                @click="onContentClick($event, note)"
              />
              <small class="note-date">{{ formatDate(note.updatedAt) }}</small>
            </div>
          </div>
        </div>
          </div>
        </div>
      </main>

      <GraphView
        v-if="graphOpen"
        :nodes="graphData.nodes"
        :edges="graphData.edges"
        :center="graphCenter"
        :depth="graphDepth"
        :include-unresolved="graphIncludeUnresolved"
        :loading="graphLoading"
        :error="graphError"
        @close="graphOpen = false"
        @refresh="refreshGraph"
        @open="openGraphNode"
      />

      <!-- MCP settings -->
      <div v-if="mcpSettingsOpen" class="modal-overlay" @mousedown.self="mcpSettingsOpen = false">
        <div class="modal-content mcp-settings-modal">
          <div class="modal-header">
            <h2>🔌 MCP access</h2>
            <button class="close-modal-btn" @click="mcpSettingsOpen = false">×</button>
          </div>
          <p class="mcp-hint">
            MCP clients use one token per client. Read/write tokens can search, read, and edit;
            admin tokens can also manage tokens and configuration. Tokens are shown once and
            stored hashed. Only a human admin session can create another admin token.
          </p>
          <form class="mcp-token-form" @submit.prevent="createMcpToken">
            <input v-model="mcpTokenName" type="text" placeholder="Token name (e.g. Claude Desktop)">
            <select v-model="mcpTokenScopes" aria-label="Token scopes">
              <option value="read">read (read-only)</option>
              <option value="read,write">read, write (client)</option>
              <option value="read,write,admin">read, write, admin</option>
            </select>
            <input v-model.number="mcpTokenExpiresDays" type="number" min="0" placeholder="Expires in days">
            <button type="submit" class="save-btn" :disabled="!mcpTokenName.trim()">Create token</button>
          </form>
          <div v-if="mcpNewToken" class="mcp-token-reveal">
            <code>{{ mcpNewToken }}</code>
            <button type="button" @click="copyMcpToken">Copy</button>
          </div>
          <p v-if="mcpTokenError" class="error">{{ mcpTokenError }}</p>
          <p v-if="mcpTokenLoading" class="mcp-hint">Loading tokens…</p>
          <div v-else-if="mcpTokens.length === 0" class="mcp-hint">No tokens yet.</div>
          <div v-else class="mcp-token-list">
            <div v-for="token in mcpTokens" :key="token.id" class="mcp-token-row">
              <div>
                <strong>{{ token.name }}</strong>
                <small>
                  {{ token.scopes.join(', ') }}
                  <template v-if="token.createdBy"> · by {{ token.createdBy }}</template>
                  <template v-if="token.expiresAt"> · expires {{ formatDate(token.expiresAt) }}</template>
                  <template v-if="token.lastUsedAt"> · last used {{ formatDate(token.lastUsedAt) }}</template>
                  <template v-if="token.revokedAt"> · revoked</template>
                </small>
              </div>
              <button
                v-if="!token.revokedAt"
                type="button"
                class="cancel-btn"
                @click="revokeMcpToken(token)"
              >Revoke</button>
            </div>
          </div>
          <details class="mcp-config">
            <summary>Client configuration</summary>
            <pre>{
  "mcpServers": {
    "local-keep": {
      "type": "http",
      "url": "{{ mcpEndpoint }}",
      "headers": { "Authorization": "Bearer &lt;token&gt;" }
    }
  }
}</pre>
          </details>
        </div>
      </div>

      <!-- Account settings -->
      <div v-if="accountSettingsOpen" class="modal-overlay" @mousedown.self="closeAccountSettings">
        <div class="modal-content account-modal">
          <div class="modal-header">
            <h2>{{ accountSettingsForced ? 'Set a new password' : 'Account settings' }}</h2>
            <button v-if="!accountSettingsForced" type="button" class="close-modal-btn" @click="closeAccountSettings">×</button>
          </div>
          <div class="account-summary">
            <span class="account-avatar large">{{ userInitials }}</span>
            <div>
              <strong>{{ currentUser?.displayName || currentUser?.username }}</strong>
              <small>@{{ currentUser?.username }} · {{ currentUser?.role }}</small>
            </div>
          </div>
          <p v-if="accountSettingsForced" class="account-notice">
            Your password was reset by an admin. Choose a new password to continue.
          </p>
          <form class="account-form" @submit.prevent="changePassword">
            <label>
              Current password
              <input v-model="changePasswordForm.currentPassword" type="password" autocomplete="current-password" required>
            </label>
            <label>
              New password
              <input v-model="changePasswordForm.newPassword" type="password" autocomplete="new-password" required>
            </label>
            <label>
              Confirm new password
              <input v-model="changePasswordForm.confirm" type="password" autocomplete="new-password" required>
            </label>
            <p v-if="changePasswordError" class="error">{{ changePasswordError }}</p>
            <p v-if="changePasswordNotice" class="account-success">{{ changePasswordNotice }}</p>
            <div class="account-actions">
              <button type="submit" class="save-btn">Update password</button>
              <button v-if="!accountSettingsForced" type="button" class="cancel-btn" @click="closeAccountSettings">Cancel</button>
            </div>
          </form>
          <div class="account-danger">
            <div>
              <strong>Sign out everywhere</strong>
              <small>Revoke all browser sessions for this account.</small>
            </div>
            <button type="button" class="cancel-btn" @click="logoutAll">Sign out all</button>
          </div>
        </div>
      </div>

      <!-- User administration -->
      <div v-if="usersOpen" class="modal-overlay" @mousedown.self="usersOpen = false">
        <div class="modal-content users-modal">
          <div class="modal-header">
            <h2>👥 People</h2>
            <button type="button" class="close-modal-btn" @click="usersOpen = false">×</button>
          </div>
          <p class="users-hint">Everyone shares this workspace. Admins can add people, reset passwords, and disable accounts.</p>

          <form class="new-user-form" @submit.prevent="createUser">
            <input v-model="newUserForm.username" type="text" placeholder="Username" required>
            <input v-model="newUserForm.displayName" type="text" placeholder="Display name">
            <input v-model="newUserForm.password" type="password" placeholder="Temporary password" autocomplete="new-password" required>
            <select v-model="newUserForm.role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" class="save-btn">Add person</button>
          </form>
          <p v-if="usersError" class="error">{{ usersError }}</p>
          <div v-if="resetPasswordResult" class="temp-password">
            <div>
              <strong>Temporary password</strong>
              <code>{{ resetPasswordResult }}</code>
              <small>Share it once; the user must change it after signing in.</small>
            </div>
            <button type="button" @click="copyToClipboard(resetPasswordResult)">Copy</button>
          </div>

          <p v-if="usersLoading" class="users-hint">Loading…</p>
          <div v-else class="users-list">
            <div v-for="user in usersList" :key="user.id" class="user-row" :class="{ disabled: user.disabledAt }">
              <div class="user-identity">
                <strong>{{ user.displayName || user.username }}</strong>
                <small>@{{ user.username }}<template v-if="user.lastLoginAt"> · last seen {{ formatDate(user.lastLoginAt) }}</template></small>
              </div>
              <select
                :value="user.role"
                :disabled="user.id === currentUser?.id"
                @change="updateUser(user, { role: $event.target.value })"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <span v-if="user.disabledAt" class="user-badge">Disabled</span>
              <span v-else-if="user.id === currentUser?.id" class="user-badge">You</span>
              <button v-if="user.id !== currentUser?.id" type="button" class="small-btn" @click="resetUserPassword(user)">Reset password</button>
              <button
                v-if="user.id !== currentUser?.id"
                type="button"
                class="small-btn"
                :class="{ danger: !user.disabledAt }"
                @click="updateUser(user, { disabled: !user.disabledAt })"
              >{{ user.disabledAt ? 'Enable' : 'Disable' }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Admin: semantic search settings -->
      <div v-if="embeddingSettingsOpen" class="modal-overlay" @mousedown.self="embeddingSettingsOpen = false">
        <div class="modal-content embedding-modal">
          <div class="modal-header">
            <h2>✨ Semantic search</h2>
            <button type="button" class="close-modal-btn" @click="embeddingSettingsOpen = false">×</button>
          </div>
          <p class="embedding-hint">
            OpenAI-compatible embeddings (SiliconFlow by default). The API key is encrypted at rest.
            Changing the model name or dimensions creates or reuses a separate variant table; old tables are preserved.
          </p>
          <p v-if="embeddingLoading" class="embedding-hint">Loading status…</p>
          <form class="embedding-form" @submit.prevent="saveEmbeddingSettings">
            <label class="embedding-check">
              <input v-model="embeddingForm.enabled" type="checkbox">
              Enable semantic search
            </label>
            <label>
              Base URL
              <input v-model="embeddingForm.baseUrl" type="url" placeholder="https://api.siliconflow.cn/v1" required>
            </label>
            <label>
              Model
              <input v-model="embeddingForm.model" type="text" placeholder="Qwen/Qwen3-Embedding-8B" required>
            </label>
            <label>
              Dimensions
              <input v-model.number="embeddingForm.dimensions" type="number" min="1" max="8192" placeholder="4096">
              <small>Qwen3-Embedding supports 64–4096; other models use their native dimensions.</small>
            </label>
            <label>
              API key
              <input
                v-model="embeddingForm.apiKey"
                type="password"
                autocomplete="new-password"
                :placeholder="embeddingSettings?.hasApiKey ? 'Saved key — leave blank to keep' : 'sk-...'"
              >
              <small v-if="embeddingSettings?.hasApiKey">A key is already saved. Leave blank to keep it.</small>
            </label>
            <div class="embedding-grid">
              <label>
                Chunk size (chars)
                <input v-model.number="embeddingForm.chunkSize" type="number" min="200" max="4000">
              </label>
              <label>
                Overlap (chars)
                <input v-model.number="embeddingForm.chunkOverlap" type="number" min="0" max="1000">
              </label>
            </div>
            <details class="embedding-advanced">
              <summary>Advanced indexing</summary>
              <div class="embedding-grid">
                <label>
                  Batch size
                  <input v-model.number="embeddingForm.batchSize" type="number" min="1" max="128">
                </label>
                <label>
                  Batch concurrency
                  <input v-model.number="embeddingForm.concurrency" type="number" min="1" max="8">
                </label>
                <label>
                  Note concurrency
                  <input v-model.number="embeddingForm.noteConcurrency" type="number" min="1" max="8">
                </label>
                <label>
                  Max batch chars
                  <input v-model.number="embeddingForm.maxBatchChars" type="number" min="1000" max="1000000">
                </label>
              </div>
              <small>Stored in SQLite; changes apply to the next note without restarting.</small>
            </details>
            <div class="embedding-rerank">
              <div class="embedding-rerank-head">
                <h3>Rerank <span>optional</span></h3>
                <label class="embedding-check">
                  <input v-model="embeddingForm.rerankEnabled" type="checkbox">
                  Enable rerank
                </label>
              </div>
              <p class="embedding-hint">
                When off, semantic search uses vector similarity only. When on, the top
                candidates are reordered by the reranker. If rerank fails, search falls
                back to vector order.
              </p>
              <label>
                Rerank model
                <input v-model="embeddingForm.rerankModel" type="text" placeholder="BAAI/bge-reranker-v2-m3">
              </label>
              <div class="embedding-grid">
                <label>
                  Rerank base URL (optional)
                  <input v-model="embeddingForm.rerankBaseUrl" type="url" placeholder="Uses embedding base URL">
                </label>
                <label>
                  Rerank API key (optional)
                  <input
                    v-model="embeddingForm.rerankApiKey"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="embeddingSettings?.rerankHasApiKey ? 'Saved rerank key — leave blank' : (embeddingSettings?.hasApiKey ? 'Uses embedding key' : 'API key (or use embedding key)')"
                  >
                </label>
              </div>
              <button type="button" class="rerank-test-btn" :disabled="rerankTesting" @click="testRerankSettings">
                {{ rerankTesting ? 'Testing rerank…' : 'Test rerank' }}
              </button>
            </div>

            <p v-if="embeddingError" class="error">{{ embeddingError }}</p>
            <p v-if="embeddingNotice" class="account-success">{{ embeddingNotice }}</p>
            <div class="embedding-actions">
              <button type="submit" class="save-btn" :disabled="embeddingSaving">
                {{ embeddingSaving ? 'Saving…' : 'Save & enable' }}
              </button>
              <button type="button" class="cancel-btn" :disabled="embeddingTesting" @click="testEmbeddingSettings">
                {{ embeddingTesting ? 'Testing…' : 'Test connection' }}
              </button>
              <button type="button" class="cancel-btn" @click="reindexEmbeddings">Rebuild index</button>
              <button type="button" class="cancel-btn" :disabled="embeddingQueue?.running" @click="resetEmbeddingIndex">Reset index</button>
              <button type="button" class="cancel-btn" @click="refreshEmbeddingStatus">Refresh status</button>
            </div>
          </form>

          <div v-if="embeddingSettings" class="embedding-status">
            <span>Status: <strong>{{ embeddingSettings.enabled ? 'enabled' : 'disabled' }}</strong></span>
            <span v-if="embeddingSettings.model">Model: <strong>{{ embeddingSettings.model }}</strong></span>
            <span v-if="embeddingSettings.dimensions">{{ embeddingSettings.dimensions }} dims</span>
            <span v-if="embeddingSettings.batchSize">Batch {{ embeddingSettings.batchSize }} · {{ embeddingSettings.concurrency }}× / {{ embeddingSettings.noteConcurrency }} notes</span>
            <span v-if="embeddingSettings.rerankEnabled">Rerank: <strong>{{ embeddingSettings.rerankModel }}</strong></span>
            <span v-if="embeddingQueue?.queued">Queue: {{ embeddingQueue.queued }}</span>
            <span v-if="embeddingQueue?.running">Indexing: {{ embeddingQueue.currentNote || '…' }}</span>
            <span v-if="embeddingSettings.lastError" class="embedding-error">{{ embeddingSettings.lastError }}</span>
          </div>

          <div v-if="embeddingModels.length" class="embedding-models">
            <div v-for="model in embeddingModels" :key="model.model" class="embedding-model-row">
              <div>
                <strong>{{ model.model }}</strong>
                <small>{{ model.dimensions }} dims · {{ model.chunkCount }} chunks · {{ model.status }}</small>
              </div>
              <small v-if="model.lastIndexedAt">{{ formatDate(model.lastIndexedAt) }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal for Add/Edit Note -->
      <div v-if="isModalOpen" class="modal-overlay" @mousedown.self="closeModal">
        <div
          class="modal-content note-form-modal"
          :class="{ 'editing-form': editingId !== null }"
          :style="modalSize.width ? { width: modalSize.width + 'px', height: modalSize.height + 'px', maxWidth: 'none', maxHeight: 'none' } : {}"
        >
          <div class="modal-header">
            <h2>
              {{ editingId ? 'Editing Note' : 'New Note' }}
              <span v-if="editingId" class="revision-badge">v{{ editingRevisionNo }}</span>
              <span
                v-if="editingId && textCollabReady"
                class="text-collab-badge"
                :title="textCollabPeers ? `${textCollabPeers} other editor${textCollabPeers === 1 ? '' : 's'}` : 'Live shared draft'"
              >● Live<span v-if="textCollabPeers"> · {{ textCollabPeers + 1 }}</span></span>
            </h2>
            <div class="modal-header-actions">
              <button
                v-if="editingId"
                type="button"
                @click="openGraph(editingId)"
                class="history-btn"
                title="Open relationship graph for this note"
              >🕸 Graph</button>
              <button
                v-if="editingId"
                type="button"
                @click="openBacklinks"
                class="history-btn"
                title="Show notes linking here"
              >🔗 Backlinks</button>
              <button
                v-if="editingId"
                type="button"
                @click="openHistory"
                class="history-btn"
                title="View revision history"
              >🕘 History</button>
              <button @click="closeModal" class="close-modal-btn">×</button>
            </div>
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
              @blur="applyPendingRemoteTitle"
            >
            <div class="note-editor-toolbar">
              <div class="editor-mode-switch">
                <button
                  type="button"
                  class="mode-btn"
                  :class="{ active: editorMode === 'write' }"
                  @click="setEditorMode('write')"
                  title="Rendered markdown; images displayed"
                >Visual</button>
                <button
                  type="button"
                  class="mode-btn"
                  :class="{ active: editorMode === 'plain' }"
                  @click="setEditorMode('plain')"
                  title="Raw markdown source; images shown as URLs"
                >Source</button>
              </div>
              <span class="toolbar-divider"></span>
              <template v-if="editorMode === 'write'">
                <button type="button" @click="formatBold" class="toolbar-btn" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
                <button type="button" @click="formatItalic" class="toolbar-btn" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
                <button type="button" @click="insertLink" class="toolbar-btn" title="Insert link" aria-label="Insert link">🔗</button>
                <button type="button" @click="insertCheckbox" class="toolbar-btn" title="Checkbox (to-do item)" aria-label="Checkbox">☑</button>
              </template>
              <span class="toolbar-spacer"></span>
              <button type="button" @click="triggerImageUpload" class="image-btn" :disabled="imageUploading" title="Insert image">
                {{ imageUploading ? '⏳' : '🖼️' }}
              </button>
            </div>
            <div
              v-if="editorMode === 'write'"
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
              @compositionstart="onEditorCompositionStart"
              @compositionend="onEditorCompositionEnd"
            ></div>
            <textarea
              v-else
              ref="markdownTextarea"
              v-model="newNoteContent"
              class="note-editor markdown-source"
              spellcheck="false"
              placeholder="Markdown source (images shown as URLs)..."
              @keydown.ctrl.enter.stop.prevent="editingId ? saveEdit() : addNote()"
              @keydown.meta.enter.stop.prevent="editingId ? saveEdit() : addNote()"
              @paste="onMarkdownPaste"
            ></textarea>
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

          <!-- Revision history overlay -->
          <div v-if="historyOpen" class="history-overlay" @mousedown.self="closeHistory">
            <div class="history-panel">
              <div class="history-header">
                <h3>Revision history</h3>
                <button type="button" class="close-modal-btn" @click="closeHistory">×</button>
              </div>
              <p v-if="historyLoading" class="history-loading">Loading history…</p>
              <p v-if="historyError" class="error">{{ historyError }}</p>
              <div v-if="historyData" class="history-list">
                <div
                  v-for="rev in historyRevisionsNewest"
                  :key="rev.id"
                  class="history-item"
                  :class="{ 'history-item-head': rev.isHead }"
                >
                  <div class="history-meta">
                    <strong>v{{ rev.revisionNo }}</strong>
                    <span>{{ formatDate(rev.createdAt) }}</span>
                    <span class="history-actor">{{ rev.actor }}</span>
                    <span v-if="rev.isHead" class="revision-badge">HEAD</span>
                    <span v-else-if="!rev.onHeadChain" class="revision-badge revision-badge-branch">branch</span>
                  </div>
                  <div class="history-title">{{ rev.displayTitle || rev.title || 'Untitled' }}</div>
                  <div class="history-actions">
                    <button type="button" @click="viewRevision(rev)">View</button>
                    <button type="button" v-if="!rev.isHead" @click="restoreRevision(rev)">Restore</button>
                    <button
                      type="button"
                      v-if="!rev.onHeadChain && !rev.isHead"
                      @click="promoteRevision(rev)"
                    >Promote</button>
                  </div>
                </div>
              </div>
              <div v-if="historyPreview" class="history-preview">
                <h4>
                  {{ historyPreview.title || 'Untitled' }}
                  <small>v{{ historyPreview.revisionNo }}</small>
                </h4>
                <pre>{{ historyPreview.content }}</pre>
              </div>
            </div>
          </div>

          <BacklinksPanel
            v-if="backlinksOpen"
            :backlinks="backlinks"
            :loading="backlinksLoading"
            :error="backlinksError"
            @close="backlinksOpen = false"
            @open="openBacklinkSource"
          />

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
          <h2>{{ noteToDeleteId ? 'Archive Note?' : 'Archive Selected Notes?' }}</h2>
          <p>
            {{ noteToDeleteId ? 'This note will be hidden from the list.' : `These ${selectedNoteIds.size} notes will be hidden from the list.` }}
            Its revision history is kept and the note can be restored.
          </p>
          <div class="confirm-actions">
            <button @click="confirmDelete" class="delete-confirm-btn">Archive</button>
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import debug from 'debug'
import WhiteboardEditor from './components/WhiteboardEditor.vue'
import TagSidebar from './components/TagSidebar.vue'
import GraphView from './components/GraphView.vue'
import BacklinksPanel from './components/BacklinksPanel.vue'
import MarkdownView from './components/MarkdownView.vue'
import { getDisplayTitle } from './utils/notes.js'
import { renderMermaidBlocks } from './utils/mermaid.js'
import {
  renderMarkdown,
  htmlToMarkdown,
  normalizeMarkdown,
  normalizePlainText
} from './utils/markdown.js'
import { serializeEditorToMarkdown as serializeEditorRoot } from './utils/editorSerialize.js'
import { createTextCollabManager } from './collab/textCollabManager.js'

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
  components: { WhiteboardEditor, TagSidebar, GraphView, BacklinksPanel, MarkdownView },
  setup() {
    // Auth state
    const showSetup = ref(false)
    const isAuthenticated = ref(false)
    const currentUser = ref(null)
    const setupForm = ref({ username: 'admin', displayName: '', password: '', confirm: '' })
    const loginForm = ref({ username: '', password: '' })
    const setupError = ref('')
    const loginError = ref('')
    const showSetupPassword = ref(false)
    const showLoginPassword = ref(false)
    const showForgot = ref(false)
    const accountMenuOpen = ref(false)
    const accountSettingsOpen = ref(false)
    const accountSettingsForced = ref(false)
    const changePasswordForm = ref({ currentPassword: '', newPassword: '', confirm: '' })
    const changePasswordError = ref('')
    const changePasswordNotice = ref('')
    const usersOpen = ref(false)
    const usersList = ref([])
    const usersLoading = ref(false)
    const usersError = ref('')
    const newUserForm = ref({ username: '', displayName: '', password: '', role: 'member' })
    const resetPasswordResult = ref('')
    const embeddingSettingsOpen = ref(false)
    const embeddingSettings = ref(null)
    const embeddingModels = ref([])
    const embeddingQueue = ref(null)
    const embeddingLoading = ref(false)
    const embeddingSaving = ref(false)
    const embeddingTesting = ref(false)
    const rerankTesting = ref(false)
    const embeddingError = ref('')
    const embeddingNotice = ref('')
    const embeddingForm = ref({
      enabled: false,
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: '',
      model: 'Qwen/Qwen3-Embedding-8B',
      dimensions: 4096,
      chunkSize: 1200,
      chunkOverlap: 180,
      batchSize: 64,
      concurrency: 2,
      maxBatchChars: 80000,
      noteConcurrency: 1,
      rerankEnabled: false,
      rerankBaseUrl: '',
      rerankApiKey: '',
      rerankModel: 'BAAI/bge-reranker-v2-m3'
    })
    const semanticSearchEnabled = ref(false)

    const isAdmin = computed(() => currentUser.value?.role === 'admin')
    const userInitials = computed(() => {
      const name = currentUser.value?.displayName || currentUser.value?.username || '?'
      return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('')
    })

    // Notes state
    const notes = ref([])
    const notePresence = ref({})
    const newNoteTitle = ref('')
    const newNoteContent = ref('')
    const editingId = ref(null)
    // Stable document identity: editingId never changes during an edit session.
    // The base revision is only used for optimistic concurrency.
    const editingBaseRevisionId = ref(null)
    const editingRevisionNo = ref(1)
    let textCollabManager = null
    let textCollabNoteId = null
    const textCollabReady = ref(false)
    const textCollabPeers = ref(0)
    const textCollabStatus = ref('')
    let applyingRemoteText = false
    let pendingRemoteText = null
    let pendingRemoteTitle = null
    let compositionActive = false
    const editorMode = ref('write') // 'write' (Visual) | 'plain' (Source)
    let editorDirty = false
    const revisionNotice = ref('')
    let revisionNoticeTimer = null
    let recentLocalRevision = null
    const historyOpen = ref(false)
    const historyLoading = ref(false)
    const historyError = ref('')
    const historyData = ref(null)
    const historyPreview = ref(null)
    const isModalOpen = ref(false)
    const copiedId = ref(null)
    const isConfirmOpen = ref(false)
    const noteToDeleteId = ref(null)
    const isUnsavedChangesOpen = ref(false)
    const fabMenuOpen = ref(false)
    const sortBy = ref('updatedAt')
    const sortOrder = ref('desc')
    const selectedNoteIds = ref(new Set())
    const showArchived = ref(false)

    // Tag / relationship state
    const tagsTree = ref({ tags: [], totalNotes: 0, untaggedCount: 0 })
    const tagSidebarOpen = ref(true)
    const activeTag = ref(null)
    const untaggedOnly = ref(false)
    let tagsRefreshTimer = null
    const graphOpen = ref(false)
    const graphLoading = ref(false)
    const graphError = ref('')
    const graphData = ref({ nodes: [], edges: [], center: null })
    const graphCenter = ref(null)
    const graphDepth = ref(1)
    const graphIncludeUnresolved = ref(false)
    const backlinksOpen = ref(false)
    const backlinks = ref([])
    const backlinksLoading = ref(false)
    const backlinksError = ref('')
    const mcpSettingsOpen = ref(false)
    const mcpTokens = ref([])
    const mcpTokenName = ref('')
    const mcpTokenScopes = ref('read,write')
    const mcpTokenExpiresDays = ref(null)
    const mcpNewToken = ref('')
    const mcpTokenError = ref('')
    const mcpTokenLoading = ref(false)
    const mcpEndpoint = computed(() => `${window.location.origin}/mcp`)

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
    const markdownTextarea = ref(null)
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
      if (wsConnecting.value) return

      wsConnecting.value = true

      // Use the in-memory token right after login; after a reload only the
      // HttpOnly cookie exists, and the server accepts it during the WS
      // handshake.
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const tokenQuery = runtimeToken ? `?token=${encodeURIComponent(runtimeToken)}` : ''
      const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenQuery}`

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
            if (textCollabManager?.handleMessage(data)) return
            if (data.type === 'presence') {
              if (data.presence && typeof data.presence === 'object') {
                notePresence.value = data.presence
              } else if (data.noteId) {
                const next = { ...notePresence.value }
                if (data.count > 0) {
                  next[data.noteId] = { count: data.count, users: data.users || [] }
                } else {
                  delete next[data.noteId]
                }
                notePresence.value = next
              }
              if (editingId.value && notePresence.value[editingId.value]) {
                textCollabPeers.value = Math.max(0, (notePresence.value[editingId.value].count || 1) - 1)
              } else if (editingId.value) {
                textCollabPeers.value = 0
              }
              return
            }
            if (data.type === 'notes' && Array.isArray(data.notes)) {
              console.log(`[${now}] 📨 Updating notes, count: ${data.notes.length}`)
              // Only update notes if the editor modal is not open
              if (!isModalOpen.value) {
                // Force reactivity by creating a new array reference. The bulk
                // active list intentionally omits archived rows; keep them in
                // memory so filtering/link resolution stays correct.
                const incomingIds = new Set(data.notes.map(n => n.id))
                const archived = notes.value.filter(n => n.archivedAt && !incomingIds.has(n.id))
                notes.value = [...data.notes, ...archived]
                pendingNotes.value = null
                scheduleTagsRefresh()
                console.log(`[${now}] 📨 Notes set in Vue, length: ${notes.value.length}`)
                // Force DOM update using queuePostFlushCb
                requestAnimationFrame(() => {
                  console.log(`[${now}] 📨 After RAF, notes length: ${notes.value.length}`)
                })
              } else {
                console.log(`[${now}] 📨 Skipping - modal open. Buffering update.`)
                pendingNotes.value = [...data.notes]
              }
            } else if ((data.type === 'note-deleted' || data.type === 'note-gone') && data.noteId) {
              handleNoteDeletedElsewhere(data.noteId)
            } else if (data.type === 'note-revised' && data.noteId) {
              // Remind the user when another tab/client (or a future MCP
              // client) creates a revision. Suppress the echo of our own save.
              const isRecentLocal = recentLocalRevision &&
                recentLocalRevision.id === data.noteId &&
                Date.now() - recentLocalRevision.at < 5000
              const isCheckpoint = data.source === 'checkpoint'
              if (!isRecentLocal && !isCheckpoint) {
                const isOpen = isModalOpen.value && editingId.value === data.noteId
                const sharedSave = isOpen && textCollabManager &&
                  textCollabNoteId === data.noteId &&
                  (data.source === 'ui' || data.source === 'mcp-open') && !data.conflict
                if (sharedSave) {
                  const who = data.source === 'mcp-open' ? 'The MCP editor' : 'Another client'
                  showRevisionNotice(`${who} saved revision ${data.revisionNo}.`)
                } else if (isOpen) {
                  showRevisionNotice(
                    `This note was updated elsewhere (revision ${data.revisionNo}). Your open copy will be kept as a branch if you save.`
                  )
                } else {
                  const who = String(data.actor || '').startsWith('mcp:') ? 'MCP' : 'Another client'
                  showRevisionNotice(`${who} saved revision ${data.revisionNo}.`)
                }
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onclose = (event) => {
          console.log('❌ WebSocket disconnected')
          wsRef.value = null
          ws = null
          wsConnecting.value = false
          wsConnected.value = false

          // 1008 = auth/session revoked or account disabled. Do not loop.
          if (event?.code === 1008) {
            runtimeToken = null
            isAuthenticated.value = false
            currentUser.value = null
            loginError.value = 'Your session ended. Please sign in again.'
            accountMenuOpen.value = false
            accountSettingsOpen.value = false
            usersOpen.value = false
            closeModal(true)
            return
          }

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
        // Keep archived notes in the in-memory list so link resolution can
        // identify archived targets and the archived filter is instant.
        notes.value = await api('/api/notes?includeArchived=1')
        await loadTags()
      } catch (e) {
        console.error('Failed to load notes', e)
      }
    }

    const loadTags = async () => {
      try {
        tagsTree.value = await api('/api/tags')
      } catch (e) {
        console.error('Failed to load tags', e)
      }
    }

    const scheduleTagsRefresh = () => {
      if (tagsRefreshTimer) clearTimeout(tagsRefreshTimer)
      tagsRefreshTimer = setTimeout(() => {
        tagsRefreshTimer = null
        loadTags()
      }, 600)
    }

    const toggleShowArchived = () => {
      showArchived.value = !showArchived.value
    }

    const selectTag = (payload) => {
      const tag = payload?.tag || null
      if (tag === '__untagged__') {
        activeTag.value = null
        untaggedOnly.value = true
      } else {
        activeTag.value = tag
        untaggedOnly.value = false
      }
    }

    const clearTag = () => {
      activeTag.value = null
      untaggedOnly.value = false
    }

    const restoreArchivedNote = async (note) => {
      try {
        const restored = await api(`/api/notes/${note.id}/restore`, { method: 'POST' })
        const index = notes.value.findIndex(n => n.id === note.id)
        if (index !== -1) {
          notes.value[index] = { ...notes.value[index], ...restored }
        }
        showRevisionNotice(`Restored ${getDisplayTitle(restored)}.`)
        loadTags()
      } catch (e) {
        showRevisionNotice(e.message || 'Restore failed')
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

      // 3. Ctrl/Cmd+Shift+M cycles editor modes while the note modal is open
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm' && isModalOpen.value) {
        e.preventDefault()
        cycleEditorMode()
        return
      }

      // 4. Ctrl+I / Cmd+I to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        if (!isModalOpen.value && !isConfirmOpen.value) {
          e.preventDefault()
          openSearch()
          return
        }
      }

      // 5. Handlers when note editor modal is open
      if (isModalOpen.value) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeModal()
          return
        }
      }

      // 6. Search bar Escape handling
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

    // Bootstrap auth: first-run setup, persisted cookie, or the login screen.
    onMounted(async () => {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('paste', handleWindowPaste)
      try {
        const bootstrap = await api('/api/auth/bootstrap')
        if (bootstrap.needsSetup) {
          showSetup.value = true
          return
        }
        const status = await api('/api/auth/status')
        if (status.authenticated) {
          currentUser.value = status.user
          isAuthenticated.value = true
          if (status.user?.mustChangePassword) {
            openAccountSettings(true)
          } else {
            await loadNotes()
            connectWebSocket()
          }
        } else {
          loginForm.value.username = localStorage.getItem('local-keep-last-username') || 'admin'
        }
      } catch (e) {
        console.error('Failed to check auth status', e)
      }
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handleWindowPaste)
      if (revisionNoticeTimer) clearTimeout(revisionNoticeTimer)
      if (tagsRefreshTimer) clearTimeout(tagsRefreshTimer)
      disconnectWebSocket()
    })

    // Auth methods
    async function finishLogin(data) {
      runtimeToken = data.token || null
      currentUser.value = data.user || null
      isAuthenticated.value = true
      showSetup.value = false
      showForgot.value = false
      loginError.value = ''
      setupError.value = ''
      accountMenuOpen.value = false
      if (currentUser.value?.username) {
        localStorage.setItem('local-keep-last-username', currentUser.value.username)
      }
      if (currentUser.value?.mustChangePassword) {
        openAccountSettings(true)
        return
      }
      await loadNotes()
      connectWebSocket()
    }

    const setupPassword = async () => {
      try {
        setupError.value = ''
        const username = setupForm.value.username.trim()
        if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
          setupError.value = 'Username must be 3–32 characters using letters, numbers, dot, dash, or underscore'
          return
        }
        if (setupForm.value.password.length < 8) {
          setupError.value = 'Password must be at least 8 characters'
          return
        }
        if (setupForm.value.password !== setupForm.value.confirm) {
          setupError.value = 'Passwords do not match'
          return
        }
        const data = await api('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            displayName: setupForm.value.displayName.trim(),
            password: setupForm.value.password
          })
        })
        await finishLogin(data)
      } catch (e) {
        setupError.value = e.message
      }
    }

    const login = async () => {
      try {
        loginError.value = ''
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: loginForm.value.username.trim(),
            password: loginForm.value.password
          })
        })
        loginForm.value.password = ''
        await finishLogin(data)
      } catch (e) {
        loginError.value = e.message
      }
    }

    const logout = async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' })
      } catch (e) {
        console.error('Logout failed', e)
      }
      runtimeToken = null
      currentUser.value = null
      isAuthenticated.value = false
      loginForm.value.password = ''
      loginError.value = ''
      accountMenuOpen.value = false
      accountSettingsOpen.value = false
      usersOpen.value = false
      disconnectWebSocket()
      closeModal(true)
    }

    function openAccountSettings(forced = false) {
      accountMenuOpen.value = false
      accountSettingsForced.value = forced || !!currentUser.value?.mustChangePassword
      accountSettingsOpen.value = true
      changePasswordForm.value = { currentPassword: '', newPassword: '', confirm: '' }
      changePasswordError.value = ''
      changePasswordNotice.value = ''
    }

    function closeAccountSettings() {
      if (accountSettingsForced.value) return
      accountSettingsOpen.value = false
    }

    async function changePassword() {
      try {
        changePasswordError.value = ''
        changePasswordNotice.value = ''
        if (changePasswordForm.value.newPassword.length < 8) {
          changePasswordError.value = 'New password must be at least 8 characters'
          return
        }
        if (changePasswordForm.value.newPassword !== changePasswordForm.value.confirm) {
          changePasswordError.value = 'New passwords do not match'
          return
        }
        const data = await api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: changePasswordForm.value.currentPassword,
            newPassword: changePasswordForm.value.newPassword
          })
        })
        const wasForced = accountSettingsForced.value
        currentUser.value = data.user
        accountSettingsForced.value = false
        changePasswordForm.value = { currentPassword: '', newPassword: '', confirm: '' }
        changePasswordNotice.value = 'Password updated. Other sessions were signed out.'
        if (wasForced) {
          await loadNotes()
          connectWebSocket()
        }
      } catch (e) {
        changePasswordError.value = e.message
      }
    }

    async function logoutAll() {
      if (!window.confirm('Sign out of all browser sessions for this account?')) return
      try {
        await api('/api/auth/logout-all', { method: 'POST' })
      } catch (e) {
        console.error('Sign out all failed', e)
      }
      runtimeToken = null
      currentUser.value = null
      isAuthenticated.value = false
      accountSettingsOpen.value = false
      accountMenuOpen.value = false
      loginForm.value.password = ''
      disconnectWebSocket()
      closeModal(true)
    }

    async function loadUsers() {
      usersLoading.value = true
      usersError.value = ''
      try {
        const data = await api('/api/users')
        usersList.value = data.users || []
      } catch (e) {
        usersError.value = e.message
      } finally {
        usersLoading.value = false
      }
    }

    async function openUsers() {
      accountMenuOpen.value = false
      if (!isAdmin.value) return
      usersOpen.value = true
      resetPasswordResult.value = ''
      newUserForm.value = { username: '', displayName: '', password: '', role: 'member' }
      await loadUsers()
    }

    async function createUser() {
      try {
        usersError.value = ''
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: newUserForm.value.username.trim(),
            displayName: newUserForm.value.displayName.trim(),
            password: newUserForm.value.password,
            role: newUserForm.value.role,
            mustChangePassword: true
          })
        })
        newUserForm.value = { username: '', displayName: '', password: '', role: 'member' }
        await loadUsers()
      } catch (e) {
        usersError.value = e.message
      }
    }

    async function updateUser(user, patch) {
      try {
        usersError.value = ''
        const data = await api(`/api/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        })
        if (user.id === currentUser.value?.id) currentUser.value = data.user
        await loadUsers()
      } catch (e) {
        usersError.value = e.message
        await loadUsers()
      }
    }

    async function resetUserPassword(user) {
      if (!window.confirm(`Reset the password for @${user.username}?`)) return
      try {
        usersError.value = ''
        const data = await api(`/api/users/${user.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({})
        })
        resetPasswordResult.value = data.temporaryPassword || ''
        await loadUsers()
      } catch (e) {
        usersError.value = e.message
      }
    }

    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text)
      } catch (_) {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
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

    // ── Markdown editor helpers ──
    function attachImageErrorHandlers(container) {
      if (!container) return
      container.querySelectorAll('img').forEach((img) => {
        img.onerror = function () {
          if (!this.parentNode) return
          const md = this.getAttribute('data-md') || ''
          const textNode = document.createTextNode(md)
          this.parentNode.replaceChild(textNode, this)
          if (editorMode.value === 'write') {
            markEditorDirty()
            newNoteContent.value = serializeEditorToMarkdown()
          }
        }
      })
    }

    function renderEditorContent() {
      const el = imageEditor.value
      if (!el) return
      el.innerHTML = renderMarkdown(newNoteContent.value, { resolveLink: resolveWikiLink })
      attachImageErrorHandlers(el)
      renderMermaidBlocks(el).catch((error) => console.error('Mermaid render failed:', error))
    }

    function setEditorMode(mode) {
      if (!['write', 'plain'].includes(mode)) return
      if (editorMode.value === mode) return
      if (editorMode.value === 'write') {
        // Only serialise when the user actually edited. Merely opening a note
        // or switching modes must not rewrite the canonical markdown.
        serializeEditorIfDirty()
      }
      editorMode.value = mode
      if (mode === 'write') {
        nextTick(() => {
          renderEditorContent()
          editorDirty = false
          if (imageEditor.value) imageEditor.value.focus()
        })
      } else if (mode === 'plain') {
        nextTick(() => {
          if (markdownTextarea.value) markdownTextarea.value.focus()
        })
      }
    }

    function cycleEditorMode() {
      const modes = ['write', 'plain']
      const index = modes.indexOf(editorMode.value)
      setEditorMode(modes[(index + 1) % modes.length])
    }

    function insertMarkdownAtCursor(markdown) {
      const textarea = markdownTextarea.value
      if (!textarea) {
        newNoteContent.value = normalizeMarkdown(`${newNoteContent.value}\n${markdown}`)
        return
      }
      const start = textarea.selectionStart ?? newNoteContent.value.length
      const end = textarea.selectionEnd ?? start
      const before = newNoteContent.value.slice(0, start)
      const after = newNoteContent.value.slice(end)
      newNoteContent.value = before + markdown + after
      const cursor = start + markdown.length
      nextTick(() => {
        textarea.focus()
        textarea.setSelectionRange(cursor, cursor)
      })
    }

    function insertMarkdownAsRich(markdown) {
      const el = imageEditor.value
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) {
        newNoteContent.value = normalizeMarkdown(`${newNoteContent.value}\n\n${markdown}`)
        renderEditorContent()
        return
      }
      const range = sel.getRangeAt(0)
      if (!el.contains(range.startContainer)) {
        range.selectNodeContents(el)
        range.collapse(false)
      }
      const html = renderMarkdown(markdown, { resolveLink: resolveWikiLink })
      const temp = document.createElement('div')
      temp.innerHTML = html
      const fragment = document.createDocumentFragment()
      while (temp.firstChild) fragment.appendChild(temp.firstChild)
      range.deleteContents()
      range.insertNode(fragment)
      // Put the caret at the end of the inserted block.
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
      markEditorDirty()
      newNoteContent.value = serializeEditorToMarkdown()
      renderMermaidBlocks(el).catch((error) => console.error('Mermaid render failed:', error))
    }

    const openNewNoteModal = () => {
      teardownTextCollab()
      isModalOpen.value = true
      editingId.value = null
      editingBaseRevisionId.value = null
      editingRevisionNo.value = 1
      editorMode.value = 'write'
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      newNoteTitle.value = ''
      newNoteContent.value = ''
      modalSize.value = { width: null, height: null }
      setTimeout(() => {
        if (modalTitleInput.value) {
          modalTitleInput.value.focus()
        }
      }, 50)
    }

    const handleWindowPaste = async (e) => {
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
      const html = e.clipboardData?.getData('text/html') || ''
      const text = e.clipboardData?.getData('text/plain') || ''
      let markdown = html ? htmlToMarkdown(html) : normalizePlainText(text)
      if (!markdown.trim()) return
      markdown = (await normalizeDataUrlImages(markdown)).markdown
      log('paste intercepted: markdownLength=%d', markdown.length)
      teardownTextCollab()
      isModalOpen.value = true
      editingId.value = null
      editingBaseRevisionId.value = null
      editingRevisionNo.value = 1
      editorMode.value = 'write'
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      newNoteTitle.value = ''
      newNoteContent.value = markdown
      modalSize.value = { width: null, height: null }
      nextTick(() => {
        renderEditorContent()
        if (imageEditor.value) imageEditor.value.focus()
        else if (modalTitleInput.value) modalTitleInput.value.focus()
      })
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
      teardownTextCollab()
      isModalOpen.value = false
      editingId.value = null
      editingBaseRevisionId.value = null
      editingRevisionNo.value = 1
      editorMode.value = 'write'
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      historyData.value = null
      historyPreview.value = null
      historyError.value = ''
      newNoteTitle.value = ''
      newNoteContent.value = ''
      if (pendingNotes.value) {
        const incoming = pendingNotes.value
        const incomingIds = new Set(incoming.map(n => n.id))
        const archived = notes.value.filter(n => n.archivedAt && !incomingIds.has(n.id))
        notes.value = [...incoming, ...archived]
        pendingNotes.value = null
      }
      modalSize.value = { width: null, height: null }
    }

    const discardSharedDraftIfAlone = () => {
      if (!textCollabManager || textCollabPeers.value > 0) return
      textCollabManager.discardDraft()
    }

    const discardChanges = () => {
      isUnsavedChangesOpen.value = false
      discardSharedDraftIfAlone()
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
        serializeEditorIfDirty()
        const normalized = await normalizeDataUrlImages(newNoteContent.value)
        if (normalized.failed > 0) {
          showRevisionNotice('One or more pasted images could not be uploaded. The note was not saved.')
          return
        }
        const content = normalizeMarkdown(normalized.markdown)
        newNoteContent.value = content
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content
          })
        })
        notes.value.unshift(note)
        scheduleTagsRefresh()
        closeModal(true)
      } catch (e) {
        console.error('Failed to add note', e)
        showRevisionNotice(e.message || 'Failed to add note')
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
          await loadNotes()
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
          await loadNotes()
          deselectAll()
        }
        closeConfirm()
        scheduleTagsRefresh()
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
      } else if (note.archivedAt) {
        showRevisionNotice('This note is archived. Restore it to edit.')
      } else if (note.type === 'canvas') {
        openCanvasNote(note)
      } else {
        startEditing(note)
      }
    }

    const startEditing = (note) => {
      teardownTextCollab()
      pendingNotes.value = null
      editingId.value = note.id
      editingBaseRevisionId.value = note.revisionId || null
      editingRevisionNo.value = note.revisionNo || 1
      editorMode.value = 'write'
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      historyData.value = null
      historyPreview.value = null
      historyError.value = ''
      newNoteTitle.value = note.title
      newNoteContent.value = note.content
      isModalOpen.value = true
      modalSize.value = { width: null, height: null }
      nextTick(() => {
        renderEditorContent()
        if (modalTitleInput.value) modalTitleInput.value.focus()
      })
      startTextCollab(note)
    }

    // ── Live text collaboration ──────────────────────────────────────────
    function teardownTextCollab() {
      if (textCollabManager) {
        textCollabManager.destroy()
        textCollabManager = null
      }
      textCollabNoteId = null
      textCollabReady.value = false
      textCollabPeers.value = 0
      textCollabStatus.value = ''
      applyingRemoteText = false
      pendingRemoteText = null
      pendingRemoteTitle = null
      compositionActive = false
    }

    function startTextCollab(note) {
      teardownTextCollab()
      if (!note?.id || note.type === 'canvas') return
      textCollabNoteId = note.id
      textCollabManager = createTextCollabManager({
        noteId: note.id,
        onSnapshot(next, { reset = false } = {}) {
          const previousBase = editingBaseRevisionId.value
          textCollabReady.value = true
          if (next.baseRevisionId) editingBaseRevisionId.value = next.baseRevisionId
          if (next.revisionNo) editingRevisionNo.value = next.revisionNo
          applySharedText(next, { initial: true })
          if (reset) {
            showRevisionNotice('The shared draft was reset to the new head revision.')
          } else if (previousBase && next.baseRevisionId && previousBase !== next.baseRevisionId) {
            showRevisionNotice(
              'A shared draft based on an older revision was restored. Saving it will keep it as a branch.'
            )
          }
        },
        onRemoteChange(next) {
          if (compositionActive) {
            pendingRemoteText = next
            return
          }
          applySharedText(next)
        },
        onSaved(message) {
          if (message.baseRevisionId) {
            editingBaseRevisionId.value = message.baseRevisionId
            textCollabManager?.setBaseRevision(message.baseRevisionId)
          }
          if (message.revisionNo) editingRevisionNo.value = message.revisionNo
          const index = notes.value.findIndex(n => n.id === note.id)
          if (index !== -1) {
            notes.value[index] = {
              ...notes.value[index],
              title: message.title ?? notes.value[index].title,
              content: message.content ?? notes.value[index].content,
              revisionId: message.baseRevisionId || notes.value[index].revisionId,
              revisionNo: message.revisionNo || notes.value[index].revisionNo
            }
          }
        },
        onStatus(status) {
          textCollabStatus.value = status
        }
      })
      textCollabManager.attach(wsRef.value)
      textCollabPeers.value = Math.max(0, (notePresence.value[note.id]?.count || 1) - 1)
    }

    function captureEditorCaret() {
      const el = imageEditor.value
      const sel = window.getSelection()
      if (!el || !sel || !sel.rangeCount) return null
      const range = sel.getRangeAt(0)
      if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
      const startRange = document.createRange()
      startRange.selectNodeContents(el)
      startRange.setEnd(range.startContainer, range.startOffset)
      const endRange = document.createRange()
      endRange.selectNodeContents(el)
      endRange.setEnd(range.endContainer, range.endOffset)
      return {
        start: startRange.toString().length,
        end: endRange.toString().length
      }
    }

    function restoreEditorCaret(position) {
      const el = imageEditor.value
      if (!el || !position) return
      const start = Math.min(position.start, position.end)
      const end = Math.max(position.start, position.end)
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node = null
      let offset = 0
      let startNode = null
      let startOffset = 0
      let endNode = null
      let endOffset = 0
      while ((node = walker.nextNode())) {
        const length = node.nodeValue?.length || 0
        if (!startNode && start <= offset + length) {
          startNode = node
          startOffset = start - offset
        }
        if (!endNode && end <= offset + length) {
          endNode = node
          endOffset = end - offset
          break
        }
        offset += length
      }
      const range = document.createRange()
      if (startNode) {
        range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.nodeValue.length)))
        const finalNode = endNode || startNode
        range.setEnd(finalNode, Math.max(0, Math.min(endOffset || startOffset, finalNode.nodeValue.length)))
      } else {
        range.selectNodeContents(el)
        range.collapse(false)
      }
      const sel = window.getSelection()
      if (!sel) return
      sel.removeAllRanges()
      sel.addRange(range)
    }

    function applySharedText(next, { initial = false } = {}) {
      if (!textCollabManager || textCollabNoteId !== editingId.value) return
      const textChanged = next.text !== newNoteContent.value
      const titleChanged = next.title !== newNoteTitle.value
      const editorFocused = editorMode.value === 'write' && (
        document.activeElement === imageEditor.value ||
        imageEditor.value?.contains(document.activeElement)
      )
      const caret = editorFocused ? captureEditorCaret() : null
      const sourceSelection = editorMode.value === 'plain' && markdownTextarea.value
        ? [markdownTextarea.value.selectionStart, markdownTextarea.value.selectionEnd]
        : null

      applyingRemoteText = true
      try {
        if (textChanged) newNoteContent.value = next.text
        if (titleChanged) {
          if (document.activeElement === modalTitleInput.value) {
            pendingRemoteTitle = next.title
          } else {
            newNoteTitle.value = next.title
          }
        }
      } finally {
        applyingRemoteText = false
      }

      if (textChanged) {
        if (editorMode.value === 'write') {
          renderEditorContent()
          if (editorFocused && caret) {
            imageEditor.value?.focus({ preventScroll: true })
            restoreEditorCaret(caret)
          }
        } else if (sourceSelection && markdownTextarea.value) {
          nextTick(() => {
            if (!markdownTextarea.value) return
            markdownTextarea.value.focus()
            markdownTextarea.value.setSelectionRange(sourceSelection[0], sourceSelection[1])
          })
        }
      }

      const original = notes.value.find(n => n.id === editingId.value)
      editorDirty = !original ||
        newNoteContent.value !== original.content ||
        newNoteTitle.value !== original.title
      if (initial) textCollabStatus.value = 'connected'
    }

    function applyPendingRemoteTitle() {
      if (pendingRemoteTitle === null) return
      applyingRemoteText = true
      try {
        newNoteTitle.value = pendingRemoteTitle
      } finally {
        applyingRemoteText = false
      }
      pendingRemoteTitle = null
    }

    function onEditorCompositionStart() {
      compositionActive = true
    }

    function onEditorCompositionEnd() {
      compositionActive = false
      if (pendingRemoteText) {
        const next = pendingRemoteText
        pendingRemoteText = null
        applySharedText(next)
      }
    }

    watch(newNoteContent, (value) => {
      if (applyingRemoteText || !textCollabManager?.isReady) return
      textCollabManager.applyMarkdown(value)
    }, { flush: 'sync' })

    watch(newNoteTitle, (value) => {
      if (applyingRemoteText || !textCollabManager?.isReady) return
      textCollabManager.applyTitle(value)
    }, { flush: 'sync' })

    watch(wsRef, (socket) => {
      if (!textCollabManager) return
      if (socket) textCollabManager.attach(socket)
      else textCollabManager.detach()
    })

    const presenceCount = (noteId) => notePresence.value[noteId]?.count || 0
    const presenceTitle = (noteId) => {
      const entry = notePresence.value[noteId]
      if (!entry?.count) return ''
      const names = (entry.users || []).map(user => user.displayName || user.username).filter(Boolean)
      if (entry.count === 1) return `${names[0] || 'Someone'} is viewing this note`
      if (names.length === 1) return `${names[0]} has ${entry.count} tabs open on this note`
      return `${names.join(', ')} are viewing this note`
    }

    const showRevisionNotice = (message) => {
      if (!message) return
      revisionNotice.value = message
      if (revisionNoticeTimer) clearTimeout(revisionNoticeTimer)
      revisionNoticeTimer = setTimeout(() => { revisionNotice.value = '' }, 7000)
    }

    const dismissRevisionNotice = () => {
      revisionNotice.value = ''
      if (revisionNoticeTimer) {
        clearTimeout(revisionNoticeTimer)
        revisionNoticeTimer = null
      }
    }

    const saveEdit = async () => {
      try {
        serializeEditorIfDirty()
        const normalized = await normalizeDataUrlImages(newNoteContent.value)
        if (normalized.failed > 0) {
          showRevisionNotice('One or more pasted images could not be uploaded. The note was not saved.')
          return
        }
        const content = normalizeMarkdown(normalized.markdown)
        newNoteContent.value = content
        // Suppress the note-revised echo for this Save; the WS event can arrive
        // before the REST response resolves.
        recentLocalRevision = { id: editingId.value, at: Date.now() }
        const updated = await api(`/api/notes/${editingId.value}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content,
            baseRevisionId: editingBaseRevisionId.value,
            mode: 'append'
          })
        })
        // Keep the document identity stable; only the version pointer moves.
        const index = notes.value.findIndex(n => n.id === editingId.value)
        if (index !== -1) {
          notes.value[index] = { ...notes.value[index], ...updated }
        }
        editingBaseRevisionId.value = updated.headRevisionId || updated.revisionId || null
        editingRevisionNo.value = updated.revisionNo || editingRevisionNo.value
        textCollabManager?.setBaseRevision(editingBaseRevisionId.value)
        recentLocalRevision = { id: updated.id, at: Date.now() }
        scheduleTagsRefresh()
        showRevisionNotice(
          updated.conflict
            ? `${updated.notice} Open the note and click History to inspect both versions.`
            : updated.notice
        )
        closeModal(true)
      } catch (e) {
        console.error('Failed to save note', e)
        showRevisionNotice(e.message || 'Save failed')
      }
    }

    // ── Revision history ──
    const openHistory = async () => {
      if (!editingId.value) return
      historyOpen.value = true
      historyLoading.value = true
      historyError.value = ''
      historyPreview.value = null
      try {
        historyData.value = await api(`/api/notes/${editingId.value}/history`)
      } catch (e) {
        historyError.value = e.message || 'Failed to load history'
        historyData.value = null
      } finally {
        historyLoading.value = false
      }
    }

    const closeHistory = () => {
      historyOpen.value = false
      historyPreview.value = null
      historyError.value = ''
    }

    const viewRevision = async (rev) => {
      try {
        historyPreview.value = await api(
          `/api/notes/${editingId.value}/history/${rev.id}`
        )
      } catch (e) {
        historyError.value = e.message || 'Failed to load revision'
      }
    }

    const applyRevisionResult = (result) => {
      const index = notes.value.findIndex(n => n.id === result.id)
      if (index !== -1) {
        notes.value[index] = { ...notes.value[index], ...result }
      }
      editingBaseRevisionId.value = result.headRevisionId || result.revisionId || null
      editingRevisionNo.value = result.revisionNo || editingRevisionNo.value
      showRevisionNotice(result.notice)
      scheduleTagsRefresh()
    }

    const restoreRevision = async (rev) => {
      if (!window.confirm(`Restore v${rev.revisionNo} as a new version?`)) return
      try {
        const result = await api(
          `/api/notes/${editingId.value}/history/${rev.id}/restore`,
          { method: 'POST' }
        )
        applyRevisionResult(result)
        closeHistory()
        closeModal(true)
      } catch (e) {
        historyError.value = e.message || 'Restore failed'
      }
    }

    const promoteRevision = async (rev) => {
      if (!window.confirm(`Promote branch v${rev.revisionNo} to the head?`)) return
      try {
        const result = await api(
          `/api/notes/${editingId.value}/history/${rev.id}/promote`,
          { method: 'POST' }
        )
        applyRevisionResult(result)
        closeHistory()
        closeModal(true)
      } catch (e) {
        historyError.value = e.message || 'Promote failed'
      }
    }

    // ── Graph / backlinks ──
    const refreshGraph = async (payload = {}) => {
      if (payload.depth != null) graphDepth.value = Number(payload.depth)
      if (payload.includeUnresolved != null) graphIncludeUnresolved.value = !!payload.includeUnresolved
      graphLoading.value = true
      graphError.value = ''
      try {
        const params = new URLSearchParams({
          depth: String(graphDepth.value),
          includeUnresolved: graphIncludeUnresolved.value ? '1' : '0'
        })
        if (graphCenter.value) params.set('noteId', graphCenter.value)
        graphData.value = await api(`/api/graph?${params.toString()}`)
      } catch (e) {
        graphError.value = e.message || 'Failed to load graph'
        graphData.value = { nodes: [], edges: [], center: graphCenter.value }
      } finally {
        graphLoading.value = false
      }
    }

    const openGraph = async (noteId = null) => {
      graphCenter.value = noteId || null
      graphOpen.value = true
      await refreshGraph()
    }

    const openGraphNode = (id) => {
      if (!id || String(id).startsWith('unresolved:')) return
      const note = notes.value.find(n => n.id === id)
      if (!note) {
        showRevisionNotice('The selected graph node is no longer available.')
        return
      }
      if (note.archivedAt) {
        showRevisionNotice('This note is archived. Restore it to open it.')
        return
      }
      if (isModalOpen.value && hasUnsavedChanges() &&
          !window.confirm('Discard unsaved changes and open the graph node?')) return
      graphOpen.value = false
      if (isModalOpen.value) {
        discardSharedDraftIfAlone()
        closeModal(true)
      }
      nextTick(() => {
        if (note.type === 'canvas') openCanvasNote(note)
        else startEditing(note)
      })
    }

    const openBacklinks = async () => {
      if (!editingId.value) return
      backlinksOpen.value = true
      backlinksLoading.value = true
      backlinksError.value = ''
      try {
        backlinks.value = await api(`/api/notes/${editingId.value}/backlinks`)
      } catch (e) {
        backlinksError.value = e.message || 'Failed to load backlinks'
        backlinks.value = []
      } finally {
        backlinksLoading.value = false
      }
    }

    const openBacklinkSource = (noteId) => {
      const note = notes.value.find(n => n.id === noteId)
      if (!note) {
        showRevisionNotice('The linking note is no longer available.')
        return
      }
      if (note.archivedAt) {
        showRevisionNotice('The linking note is archived.')
        return
      }
      if (hasUnsavedChanges() && !window.confirm('Discard unsaved changes and open the linking note?')) return
      backlinksOpen.value = false
      discardSharedDraftIfAlone()
      closeModal(true)
      nextTick(() => {
        if (note.type === 'canvas') openCanvasNote(note)
        else startEditing(note)
      })
    }

    // ── MCP token settings ──
    const loadMcpTokens = async () => {
      mcpTokenLoading.value = true
      mcpTokenError.value = ''
      try {
        mcpTokens.value = await api('/api/mcp/tokens')
      } catch (e) {
        mcpTokenError.value = e.message || 'Failed to load tokens'
      } finally {
        mcpTokenLoading.value = false
      }
    }

    const openMcpSettings = async () => {
      mcpSettingsOpen.value = true
      mcpNewToken.value = ''
      mcpTokenName.value = ''
      mcpTokenScopes.value = 'read,write'
      mcpTokenExpiresDays.value = null
      await loadMcpTokens()
    }

    const createMcpToken = async () => {
      try {
        mcpTokenError.value = ''
        const scopes = mcpTokenScopes.value.split(',').map(scope => scope.trim()).filter(Boolean)
        const days = Number(mcpTokenExpiresDays.value)
        const expiresAt = Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          : null
        const created = await api('/api/mcp/tokens', {
          method: 'POST',
          body: JSON.stringify({
            name: mcpTokenName.value.trim(),
            scopes,
            expiresAt
          })
        })
        mcpNewToken.value = created.token
        mcpTokenName.value = ''
        await loadMcpTokens()
      } catch (e) {
        mcpTokenError.value = e.message || 'Failed to create token'
      }
    }

    const revokeMcpToken = async (token) => {
      if (!window.confirm(`Revoke MCP token "${token.name}"?`)) return
      try {
        await api(`/api/mcp/tokens/${token.id}`, { method: 'DELETE' })
        await loadMcpTokens()
      } catch (e) {
        mcpTokenError.value = e.message || 'Failed to revoke token'
      }
    }

    const copyMcpToken = async () => {
      if (!mcpNewToken.value) return
      try {
        await navigator.clipboard.writeText(mcpNewToken.value)
      } catch (_) {
        const textarea = document.createElement('textarea')
        textarea.value = mcpNewToken.value
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    }

    // ── Semantic search / embedding settings ──
    function applyEmbeddingStatus(data, { updateForm = false } = {}) {
      embeddingSettings.value = data.settings || null
      embeddingModels.value = data.models || []
      embeddingQueue.value = data.queue || null
      if (updateForm && data.settings) {
        const settings = data.settings
        embeddingForm.value = {
          enabled: !!settings.enabled,
          baseUrl: settings.baseUrl || 'https://api.siliconflow.cn/v1',
          apiKey: '',
          model: settings.model || 'Qwen/Qwen3-Embedding-8B',
          dimensions: settings.dimensions || 4096,
          chunkSize: settings.chunkSize || 1200,
          chunkOverlap: settings.chunkOverlap ?? 180,
          batchSize: settings.batchSize || 64,
          concurrency: settings.concurrency || 2,
          maxBatchChars: settings.maxBatchChars || 80000,
          noteConcurrency: settings.noteConcurrency || 1,
          rerankEnabled: !!settings.rerankEnabled,
          rerankBaseUrl: settings.rerankBaseUrl || '',
          rerankApiKey: '',
          rerankModel: settings.rerankModel || 'BAAI/bge-reranker-v2-m3'
        }
      }
    }

    async function openEmbeddingSettings() {
      accountMenuOpen.value = false
      if (!isAdmin.value) return
      embeddingSettingsOpen.value = true
      embeddingError.value = ''
      embeddingNotice.value = ''
      embeddingLoading.value = true
      try {
        const data = await api('/api/admin/embeddings')
        applyEmbeddingStatus(data, { updateForm: true })
      } catch (e) {
        embeddingError.value = e.message
      } finally {
        embeddingLoading.value = false
      }
    }

    async function refreshEmbeddingStatus() {
      try {
        embeddingLoading.value = true
        embeddingError.value = ''
        const data = await api('/api/admin/embeddings')
        applyEmbeddingStatus(data)
      } catch (e) {
        embeddingError.value = e.message
      } finally {
        embeddingLoading.value = false
      }
    }

    async function testEmbeddingSettings() {
      try {
        embeddingTesting.value = true
        embeddingError.value = ''
        embeddingNotice.value = ''
        const data = await api('/api/admin/embeddings/test', {
          method: 'POST',
          body: JSON.stringify({
            baseUrl: embeddingForm.value.baseUrl,
            apiKey: embeddingForm.value.apiKey || undefined,
            model: embeddingForm.value.model,
            dimensions: embeddingForm.value.dimensions || undefined
          })
        })
        embeddingNotice.value = `Connection OK · ${data.dimensions} dimensions · ${data.latencyMs} ms`
      } catch (e) {
        embeddingError.value = e.message
      } finally {
        embeddingTesting.value = false
      }
    }

    async function saveEmbeddingSettings() {
      try {
        embeddingSaving.value = true
        embeddingError.value = ''
        embeddingNotice.value = ''
        const data = await api('/api/admin/embeddings', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: embeddingForm.value.enabled,
            baseUrl: embeddingForm.value.baseUrl,
            apiKey: embeddingForm.value.apiKey || undefined,
            model: embeddingForm.value.model,
            dimensions: embeddingForm.value.dimensions || undefined,
            chunkSize: embeddingForm.value.chunkSize,
            chunkOverlap: embeddingForm.value.chunkOverlap,
            batchSize: embeddingForm.value.batchSize,
            concurrency: embeddingForm.value.concurrency,
            maxBatchChars: embeddingForm.value.maxBatchChars,
            noteConcurrency: embeddingForm.value.noteConcurrency,
            rerankEnabled: embeddingForm.value.rerankEnabled,
            rerankBaseUrl: embeddingForm.value.rerankBaseUrl || undefined,
            rerankApiKey: embeddingForm.value.rerankApiKey || undefined,
            rerankModel: embeddingForm.value.rerankModel || undefined
          })
        })
        applyEmbeddingStatus(data, { updateForm: true })
        embeddingNotice.value = data.settings?.enabled
          ? 'Saved. Indexing is running in the background.'
          : 'Saved. Semantic search is disabled.'
      } catch (e) {
        embeddingError.value = e.message
      } finally {
        embeddingSaving.value = false
      }
    }

    async function testRerankSettings() {
      try {
        rerankTesting.value = true
        embeddingError.value = ''
        embeddingNotice.value = ''
        const data = await api('/api/admin/embeddings/test-rerank', {
          method: 'POST',
          body: JSON.stringify({
            baseUrl: embeddingForm.value.rerankBaseUrl || embeddingForm.value.baseUrl,
            apiKey: embeddingForm.value.rerankApiKey || undefined,
            model: embeddingForm.value.rerankModel
          })
        })
        embeddingNotice.value = `Rerank OK · ${data.latencyMs} ms · ${data.results} results`
      } catch (e) {
        embeddingError.value = e.message
      } finally {
        rerankTesting.value = false
      }
    }

    async function reindexEmbeddings() {
      try {
        embeddingNotice.value = ''
        embeddingError.value = ''
        const data = await api('/api/admin/embeddings/reindex', { method: 'POST' })
        embeddingQueue.value = data.status?.queue || embeddingQueue.value
        embeddingNotice.value = `Queued ${data.queued} notes for re-indexing.`
      } catch (e) {
        embeddingError.value = e.message
      }
    }

    async function resetEmbeddingIndex() {
      if (!window.confirm('Reset all embedding tables and reindex every note? Current vectors will be deleted.')) return
      try {
        embeddingNotice.value = ''
        embeddingError.value = ''
        const data = await api('/api/admin/embeddings/reset', { method: 'POST' })
        embeddingQueue.value = data.status?.queue || embeddingQueue.value
        embeddingModels.value = data.status?.models || []
        embeddingNotice.value = `Reset ${data.droppedTables || 0} tables; queued ${data.queued || 0} notes.`
      } catch (e) {
        embeddingError.value = e.message
      }
    }

    function toggleSemanticSearch() {
      semanticSearchEnabled.value = !semanticSearchEnabled.value
      if (searchQuery.value.trim()) onSearchInput()
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
          if (semanticSearchEnabled.value) {
            const data = await api(`/api/search/semantic?q=${encodeURIComponent(q)}&limit=50`)
            searchResults.value = (data.results || []).map(result => result.note_id)
          } else {
            searchResults.value = await api(`/api/search?q=${encodeURIComponent(q)}`)
          }
        } catch (e) {
          if (semanticSearchEnabled.value) {
            semanticSearchEnabled.value = false
            showRevisionNotice(`Semantic search unavailable: ${e.message}`)
            try {
              searchResults.value = await api(`/api/search?q=${encodeURIComponent(q)}`)
            } catch (_) {
              searchResults.value = []
            }
          } else {
            searchResults.value = []
          }
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
      teardownTextCollab()
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
      teardownTextCollab()
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
          serializeEditorIfDirty()
          const normalized = await normalizeDataUrlImages(newNoteContent.value)
          if (normalized.failed > 0) {
            showRevisionNotice('One or more pasted images could not be uploaded. The note was not saved.')
            return
          }
          const note = await api('/api/notes', {
            method: 'POST',
            body: JSON.stringify({
              title: newNoteTitle.value.trim(),
              content: normalizeMarkdown(normalized.markdown)
            })
          })
          notes.value.unshift(note)
          scheduleTagsRefresh()
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
      if (!showArchived.value) {
        filtered = filtered.filter(n => !n.archivedAt)
      }
      if (searchQuery.value.trim() && searchResults.value !== null) {
        const matchIds = new Set(searchResults.value)
        filtered = filtered.filter(n => matchIds.has(n.id))
      }
      if (activeTag.value) {
        const prefix = activeTag.value
        filtered = filtered.filter(n => (n.tags || []).some(tag =>
          tag === prefix || tag.startsWith(prefix + '/')
        ))
      }
      if (untaggedOnly.value) {
        filtered = filtered.filter(n => !(n.tags || []).length)
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

    const historyRevisionsNewest = computed(() => {
      if (!historyData.value?.revisions) return []
      return [...historyData.value.revisions].sort((a, b) => b.revisionNo - a.revisionNo)
    })

    // ── Markdown / internal-link helpers ──
    function normalizeWikiTitle(value) {
      return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    }

    function resolveWikiLink(target, label) {
      if (!target) return { noteId: null, status: 'broken', label }
      let note = null
      if (target.startsWith('note:')) {
        const id = target.slice(5).trim()
        note = notes.value.find(n => n.id === id) || null
      } else {
        const wanted = normalizeWikiTitle(target)
        const matches = notes.value.filter((n) => {
          const title = normalizeWikiTitle(n.title)
          const display = normalizeWikiTitle(n.displayTitle || getDisplayTitle(n))
          return wanted && (wanted === title || wanted === display)
        })
        if (matches.length === 1) note = matches[0]
      }
      if (!note) return { noteId: null, status: 'broken', label: label || target }
      return {
        noteId: note.id,
        status: note.archivedAt ? 'archived' : 'ok',
        label: label || target
      }
    }

    function renderContent(content) {
      return renderMarkdown(content || '', { resolveLink: resolveWikiLink })
    }

    function openNoteLink(linkEl) {
      if (!linkEl) return
      const id = linkEl.getAttribute('data-note-id')
      const label = linkEl.getAttribute('data-note-label') || linkEl.textContent || 'note'
      if (!id) {
        showRevisionNotice(`Unresolved link: ${label}`)
        return
      }
      const note = notes.value.find(n => n.id === id)
      if (!note) {
        showRevisionNotice(`Linked note not found: ${label}`)
        return
      }
      if (note.archivedAt) {
        showRevisionNotice('The linked note is archived. Restore it to open it.')
        return
      }
      if (editingId.value === id && isModalOpen.value) return
      if (isModalOpen.value && hasUnsavedChanges()) {
        if (!window.confirm('Discard unsaved changes and open the linked note?')) return
      }
      if (isModalOpen.value) {
        discardSharedDraftIfAlone()
        closeModal(true)
      }
      nextTick(() => {
        if (note.type === 'canvas') openCanvasNote(note)
        else startEditing(note)
      })
    }

    function onContentClick(event) {
      const link = event.target.closest('.note-link')
      if (!link) return
      event.stopPropagation()
      event.preventDefault()
      openNoteLink(link)
    }

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
      currentUser,
      setupForm,
      loginForm,
      setupError,
      loginError,
      showSetupPassword,
      showLoginPassword,
      showForgot,
      setupPassword,
      login,
      logout,
      isAdmin,
      userInitials,
      // Account
      accountMenuOpen,
      accountSettingsOpen,
      accountSettingsForced,
      changePasswordForm,
      changePasswordError,
      changePasswordNotice,
      openAccountSettings,
      closeAccountSettings,
      changePassword,
      logoutAll,
      // User administration
      usersOpen,
      usersList,
      usersLoading,
      usersError,
      newUserForm,
      resetPasswordResult,
      openUsers,
      loadUsers,
      createUser,
      updateUser,
      resetUserPassword,
      copyToClipboard,
      // Notes
      notes,
      notePresence,
      presenceCount,
      presenceTitle,
      newNoteTitle,
      newNoteContent,
      editingId,
      editingBaseRevisionId,
      editingRevisionNo,
      textCollabReady,
      textCollabPeers,
      textCollabStatus,
      revisionNotice,
      dismissRevisionNotice,
      sortedNotes,
      addNote,
      startEditing,
      saveEdit,
      formatDate,
      getDisplayTitle,
      // Revision history
      historyOpen,
      historyLoading,
      historyError,
      historyData,
      historyPreview,
      historyRevisionsNewest,
      openHistory,
      closeHistory,
      viewRevision,
      restoreRevision,
      promoteRevision,
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
      showArchived,
      toggleShowArchived,
      restoreArchivedNote,
      toggleSelect,
      selectAll,
      deselectAll,
      handleCardClick,
      // Tags / relationships
      tagsTree,
      tagSidebarOpen,
      activeTag,
      untaggedOnly,
      selectTag,
      clearTag,
      graphOpen,
      graphData,
      graphLoading,
      graphError,
      graphCenter,
      graphDepth,
      graphIncludeUnresolved,
      openGraph,
      refreshGraph,
      openGraphNode,
      backlinksOpen,
      backlinks,
      backlinksLoading,
      backlinksError,
      openBacklinks,
      openBacklinkSource,
      // MCP settings
      mcpSettingsOpen,
      mcpTokens,
      mcpTokenName,
      mcpTokenScopes,
      mcpTokenExpiresDays,
      mcpNewToken,
      mcpTokenError,
      mcpTokenLoading,
      mcpEndpoint,
      openMcpSettings,
      createMcpToken,
      revokeMcpToken,
      copyMcpToken,
      // Semantic search / embedding settings
      embeddingSettingsOpen,
      embeddingSettings,
      embeddingModels,
      embeddingQueue,
      embeddingLoading,
      embeddingSaving,
      embeddingTesting,
      rerankTesting,
      embeddingError,
      embeddingNotice,
      embeddingForm,
      semanticSearchEnabled,
      openEmbeddingSettings,
      refreshEmbeddingStatus,
      testEmbeddingSettings,
      testRerankSettings,
      saveEmbeddingSettings,
      reindexEmbeddings,
      resetEmbeddingIndex,
      toggleSemanticSearch,
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
      editorMode,
      markdownTextarea,
      setEditorMode,
      formatBold,
      formatItalic,
      insertLink,
      insertCheckbox,
      onImageFileSelected,
      onEditorInput,
      onEditorKeydown,
      onEditorPaste,
      onMarkdownPaste,
      onEditorFocus,
      onEditorBlur,
      onEditorClick,
      onEditorCompositionStart,
      onEditorCompositionEnd,
      applyPendingRemoteTitle,
      onContentClick,
      renderContent
    }

    // ── ContentEditable editor functions (after return) ──
    function serializeEditorIfDirty() {
      if (editorMode.value === 'write' && editorDirty) {
        newNoteContent.value = serializeEditorToMarkdown()
        editorDirty = false
      }
      return newNoteContent.value
    }

    function markEditorDirty() {
      editorDirty = true
    }

    function serializeEditorToMarkdown() {
      const el = imageEditor.value
      if (!el) return newNoteContent.value
      return serializeEditorRoot(el)
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

      markEditorDirty()
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
        markEditorDirty()
        newNoteContent.value = serializeEditorToMarkdown()
      }
    }

    function onEditorFocus() {
      // Re-render any remaining markdown images when editor gains focus.
      const text = newNoteContent.value
      const hasImages = imageEditor.value?.querySelector('img')
      if (text && text.includes('![') && !hasImages) {
        requestAnimationFrame(() => renderEditorContent())
      }
    }

    // ── Image click-to-select and resize ──
    function onEditorClick(e) {
      const link = e.target.closest('.note-link')
      if (link && imageEditor.value?.contains(link)) {
        e.preventDefault()
        e.stopPropagation()
        openNoteLink(link)
        return
      }
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
        markEditorDirty()
        newNoteContent.value = serializeEditorToMarkdown()
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    function onEditorBlur() {
      serializeEditorIfDirty()
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
      markEditorDirty()
      newNoteContent.value = serializeEditorToMarkdown()
    }

    function formatItalic() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('italic', false, null)
      markEditorDirty()
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
      markEditorDirty()
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
      markEditorDirty()
      newNoteContent.value = serializeEditorToMarkdown()
    }

    async function uploadImageBlob(blob, filename = 'pasted-image.png') {
      imageUploading.value = true
      try {
        const formData = new FormData()
        formData.append('image', blob, filename)
        const headers = {}
        if (runtimeToken) headers['X-Auth-Token'] = runtimeToken
        const res = await fetch(`${API_BASE}/api/images`, {
          method: 'POST',
          headers,
          body: formData
        })
        if (!res.ok) throw new Error('Upload failed')
        return await res.json()
      } catch (e) {
        console.error('Image upload failed:', e)
        return null
      } finally {
        imageUploading.value = false
      }
    }

    async function uploadImageFile(file) {
      const data = await uploadImageBlob(file, file.name || 'image.png')
      return data ? `![image](${data.url})` : null
    }

    async function uploadDataUrlImage(dataURL) {
      try {
        const res = await fetch(dataURL)
        const blob = await res.blob()
        const data = await uploadImageBlob(blob, 'pasted-image.png')
        return data?.url || null
      } catch (e) {
        console.error('Data URL image upload failed:', e)
        return null
      }
    }

    /**
     * Rewrite any remaining data:image image refs to /api/images URLs.
     * Returns { markdown, changed }. Upload failures keep the original ref.
     */
    async function normalizeDataUrlImages(markdown) {
      const source = String(markdown || '')
      const regex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g
      let result = ''
      let lastIndex = 0
      let match
      let changed = false
      let failed = 0
      while ((match = regex.exec(source)) !== null) {
        result += source.slice(lastIndex, match.index)
        const url = await uploadDataUrlImage(match[2])
        if (url) {
          result += `![${match[1]}](${url})`
          changed = true
        } else {
          failed += 1
          result += match[0]
        }
        lastIndex = match.index + match[0].length
      }
      result += source.slice(lastIndex)
      return { markdown: changed ? result : source, changed, failed }
    }

    function insertImageInEditor(mdRef) {
      if (!mdRef) return
      if (editorMode.value === 'plain') {
        insertMarkdownAtCursor(mdRef)
        return
      }
      const el = imageEditor.value
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const html = renderMarkdown(mdRef, { resolveLink: resolveWikiLink })
      const temp = document.createElement('div')
      temp.innerHTML = html
      const imgNode = temp.querySelector('img')
      if (!imgNode) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(imgNode)
      attachImageErrorHandlers(el)
      const afterRange = document.createRange()
      afterRange.setStartAfter(imgNode)
      afterRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(afterRange)
      markEditorDirty()
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

      const html = e.clipboardData?.getData('text/html') || ''
      const text = e.clipboardData?.getData('text/plain') || ''
      if (!html && !text) return
      e.preventDefault()
      let markdown = html ? htmlToMarkdown(html) : normalizePlainText(text)
      if (!markdown.trim()) return
      markdown = (await normalizeDataUrlImages(markdown)).markdown
      insertMarkdownAsRich(markdown)
    }

    async function onMarkdownPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const mdRef = await uploadImageFile(file)
            if (mdRef) insertMarkdownAtCursor(mdRef)
          }
          return
        }
      }

      const html = e.clipboardData?.getData('text/html') || ''
      const text = e.clipboardData?.getData('text/plain') || ''
      if (!html && !text) return
      e.preventDefault()
      let markdown = html ? htmlToMarkdown(html) : normalizePlainText(text)
      markdown = (await normalizeDataUrlImages(markdown)).markdown
      insertMarkdownAtCursor(markdown)
    }

    // Gallery rendering is handled by the shared sanitised markdown renderer.

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
  padding: 1.5rem;
  background:
    radial-gradient(circle at 15% 15%, rgba(129, 140, 248, 0.35), transparent 32rem),
    radial-gradient(circle at 85% 80%, rgba(56, 189, 248, 0.25), transparent 30rem),
    linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #111827 100%);
}

.auth-card {
  width: 100%;
  max-width: 430px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 18px;
  padding: 2.25rem;
  box-shadow: 0 30px 80px rgba(2, 6, 23, 0.45);
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #4f46e5;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin-bottom: 1.4rem;
}

.auth-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #eef2ff;
  font-size: 1.1rem;
}

.auth-card h1 {
  font-size: 1.65rem;
  line-height: 1.2;
  margin: 0 0 0.45rem;
  color: #0f172a;
}

.subtitle {
  color: #64748b;
  margin: 0 0 1.4rem;
  line-height: 1.5;
  font-size: 0.92rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
}

.auth-form input,
.account-form input,
.new-user-form input,
.new-user-form select {
  width: 100%;
  padding: 0.7rem 0.8rem;
  border: 1px solid #dbe2ea;
  border-radius: 9px;
  font-size: 0.92rem;
  background: #fff;
  color: #0f172a;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.auth-form input:focus,
.account-form input:focus,
.new-user-form input:focus,
.new-user-form select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.14);
}

.password-field {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.password-field input {
  flex: 1;
}

.password-toggle {
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #475569;
  border-radius: 7px;
  padding: 0.55rem 0.6rem;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;
}

.auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.auth-hint {
  color: #94a3b8;
  font-size: 0.74rem;
}

.link-btn {
  border: none;
  background: transparent;
  color: #4f46e5;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}

.auth-primary,
.auth-box button {
  padding: 0.8rem 1rem;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #fff;
  border: none;
  border-radius: 9px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.15s, transform 0.15s;
}

.auth-primary:hover,
.auth-box button:hover {
  filter: brightness(1.06);
}

.auth-primary:active {
  transform: translateY(1px);
}

.auth-footnote {
  margin: 1.2rem 0 0;
  text-align: center;
  color: #94a3b8;
  font-size: 0.72rem;
}

.forgot-panel {
  margin-top: 1.1rem;
  padding: 0.85rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 9px;
  color: #475569;
  font-size: 0.8rem;
  line-height: 1.45;
}

.forgot-panel strong {
  color: #0f172a;
  display: block;
  margin-bottom: 0.25rem;
}

.forgot-panel p {
  margin: 0 0 0.45rem;
}

.forgot-panel code {
  display: block;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font-size: 0.75rem;
  overflow-x: auto;
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

.search-semantic-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.9rem;
  opacity: 0.55;
  flex-shrink: 0;
}

.search-semantic-btn.active {
  opacity: 1;
  background: #e8f0fe;
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

.account-menu-wrap {
  position: relative;
}

.account-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.55rem 0.3rem 0.3rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
}

.account-btn:hover {
  background: #f8fafc;
}

.account-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #38bdf8);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.account-avatar.large {
  width: 42px;
  height: 42px;
  font-size: 0.9rem;
}

.account-name {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-chevron {
  color: #94a3b8;
  font-size: 0.65rem;
}

.account-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.45rem);
  width: 230px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  padding: 0.4rem;
  z-index: 140;
}

.account-menu-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.55rem 0.6rem;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 0.3rem;
}

.account-menu-head strong {
  color: #0f172a;
  font-size: 0.84rem;
}

.account-menu-head small {
  color: #94a3b8;
  font-size: 0.7rem;
}

.account-menu button {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.5rem 0.55rem;
  border-radius: 6px;
  color: #334155;
  font-size: 0.8rem;
  cursor: pointer;
}

.account-menu button:hover {
  background: #f1f5f9;
}

.account-menu .account-menu-danger {
  color: #b91c1c;
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

.workspace {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.workspace-content {
  flex: 1;
  min-width: 0;
}

.search-toggle-btn.active {
  background: #e8f0fe;
  color: #1a73e8;
}

.tag-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  background: #e8f0fe;
  color: #1a73e8;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.75rem;
}

.tag-filter-chip button {
  border: none;
  background: transparent;
  color: #1a73e8;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
  flex-shrink: 0;
}

.tag-chip {
  border: 1px solid #d2e3fc;
  background: #f1f6ff;
  color: #1a64c7;
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  font-size: 0.65rem;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-chip:hover {
  background: #e2edff;
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

.note-card.archived {
  opacity: 0.72;
  background: #f8f9fa;
  border-style: dashed;
}

.restore-btn {
  border: 1px solid #dadce0;
  background: #fff;
  color: #1a73e8;
  border-radius: 4px;
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  cursor: pointer;
}

.restore-btn:hover {
  background: #e8f0fe;
}

.archived-toggle-btn {
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  margin-right: 0.5rem;
}

.archived-toggle-btn.active {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #1a73e8;
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

.mermaid-block {
  margin: 0.6rem 0;
  padding: 0.5rem;
  border: 1px solid #e8eaed;
  border-radius: 8px;
  background: #fafafa;
  overflow-x: auto;
}

.mermaid-block .mermaid-source {
  display: none;
}

.mermaid-block .mermaid-diagram {
  display: flex;
  justify-content: center;
}

.mermaid-block svg {
  max-width: 100%;
  height: auto;
  display: block;
}

.mermaid-block[data-mermaid-rendered="error"] .mermaid-source {
  display: block;
  margin: 0.4rem 0 0;
  padding: 0.45rem;
  background: #fff;
  border-radius: 5px;
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.mermaid-error {
  color: #b91c1c;
  font-size: 0.75rem;
  margin-bottom: 0.35rem;
  white-space: pre-wrap;
}

.note-preview {
  white-space: normal;
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

.note-preview::-webkit-scrollbar,
.markdown-preview::-webkit-scrollbar {
  width: 4px;
}

.note-preview::-webkit-scrollbar-track,
.markdown-preview::-webkit-scrollbar-track {
  background: transparent;
}

.note-preview::-webkit-scrollbar-thumb,
.markdown-preview::-webkit-scrollbar-thumb {
  background-color: #dadce0;
  border-radius: 2px;
}

/* Shared rendered-markdown typography */
.note-preview,
.markdown-preview {
  font-size: 0.9rem;
  line-height: 1.55;
}

.note-preview h1,
.markdown-preview h1 { font-size: 1.35rem; margin: 0.6rem 0 0.4rem; }
.note-preview h2,
.markdown-preview h2 { font-size: 1.2rem; margin: 0.55rem 0 0.35rem; }
.note-preview h3,
.markdown-preview h3 { font-size: 1.05rem; margin: 0.5rem 0 0.3rem; }
.note-preview h4,
.note-preview h5,
.note-preview h6,
.markdown-preview h4,
.markdown-preview h5,
.markdown-preview h6 { font-size: 0.95rem; margin: 0.45rem 0 0.25rem; }
.note-preview p,
.markdown-preview p { margin: 0.35rem 0; }
.note-preview ul,
.note-preview ol,
.markdown-preview ul,
.markdown-preview ol { padding-left: 1.25rem; margin: 0.35rem 0; }
.note-preview li,
.markdown-preview li { margin: 0.1rem 0; }
.note-preview blockquote,
.markdown-preview blockquote {
  margin: 0.4rem 0;
  padding-left: 0.75rem;
  border-left: 3px solid #dadce0;
  color: #5f6368;
}
.note-preview pre,
.markdown-preview pre {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 0.6rem;
  overflow-x: auto;
  font-size: 0.78rem;
  white-space: pre;
}
.note-preview code,
.markdown-preview code {
  background: #f1f3f4;
  border-radius: 3px;
  padding: 0.05rem 0.25rem;
  font-size: 0.82em;
}
.note-preview pre code,
.markdown-preview pre code {
  background: transparent;
  padding: 0;
}
.note-preview img,
.markdown-preview img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0.25rem 0;
}
.note-preview table,
.markdown-preview table {
  border-collapse: collapse;
  margin: 0.4rem 0;
  max-width: 100%;
}
.note-preview th,
.note-preview td,
.markdown-preview th,
.markdown-preview td {
  border: 1px solid #dadce0;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
}
.note-preview a,
.markdown-preview a { color: #1a73e8; }

.note-link {
  color: #1a73e8;
  text-decoration: underline;
  cursor: pointer;
}
.note-link--broken {
  color: #d93025;
  text-decoration: underline dashed;
  cursor: help;
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

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.revision-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 0.7rem;
  font-weight: 600;
  vertical-align: middle;
}

.revision-badge-branch {
  background: #fef7e0;
  color: #b06000;
}

.text-collab-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 0.4rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: #e6f4ea;
  color: #137333;
  font-size: 0.7rem;
  font-weight: 600;
  vertical-align: middle;
}

.presence-dot {
  position: absolute;
  top: 3.25rem;
  right: 1rem;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #34a853;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(52, 168, 83, 0.35);
  z-index: 3;
  pointer-events: auto;
}

.presence-dot::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1px solid rgba(52, 168, 83, 0.35);
  animation: presence-pulse 2s ease-out infinite;
}

@keyframes presence-pulse {
  0% { transform: scale(0.8); opacity: 0.8; }
  70% { transform: scale(1.3); opacity: 0; }
  100% { transform: scale(1.3); opacity: 0; }
}

.history-btn {
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.history-btn:hover {
  background: #f8f9fa;
}

.revision-toast {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: min(520px, 90vw);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #202124;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  font-size: 0.875rem;
}

.revision-toast button {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
}

.history-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 1rem;
  background: rgba(32, 33, 36, 0.35);
  border-radius: 12px;
}

.history-panel {
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  background: #fff;
  border-radius: 10px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.5rem;
  margin-bottom: 0.75rem;
}

.history-header h3 {
  margin: 0;
  font-size: 1rem;
}

.history-loading,
.history-actor {
  color: #80868b;
  font-size: 0.8rem;
}

.history-item {
  border-bottom: 1px solid #f1f3f4;
  padding: 0.6rem 0;
}

.history-item-head {
  background: #f8fafd;
  margin: 0 -0.5rem;
  padding: 0.6rem 0.5rem;
  border-radius: 6px;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #5f6368;
}

.history-title {
  margin: 0.25rem 0;
  font-weight: 600;
  color: #202124;
}

.history-actions {
  display: flex;
  gap: 0.5rem;
}

.history-actions button {
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  border-radius: 4px;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.history-actions button:hover {
  background: #f8f9fa;
}

.history-preview {
  margin-top: 1rem;
  border-top: 1px solid #f1f3f4;
  padding-top: 0.75rem;
}

.history-preview h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.history-preview pre {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 18rem;
  overflow-y: auto;
  background: #f8f9fa;
  border-radius: 6px;
  padding: 0.75rem;
  font-size: 0.8rem;
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

.note-form-modal textarea.markdown-source {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: none;
  white-space: pre;
}

.note-form-modal .markdown-preview {
  background: #fafafa;
  cursor: default;
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
  flex-wrap: wrap;
}

.editor-mode-switch {
  display: inline-flex;
  border: 1px solid #dadce0;
  border-radius: 6px;
  overflow: hidden;
}

.mode-btn {
  border: none;
  background: #fff;
  color: #5f6368;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  border-right: 1px solid #ededed;
}

.mode-btn:last-child {
  border-right: none;
}

.mode-btn.active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.toolbar-divider {
  width: 1px;
  align-self: stretch;
  background: #ededed;
  margin: 0 0.25rem;
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

.embedding-modal {
  background: #fff;
  border-radius: 14px;
  padding: 1.25rem;
  width: min(680px, 94vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
}

.embedding-hint {
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.5;
}

.embedding-form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 0.7rem;
}

.embedding-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
}

.embedding-form label small {
  color: #94a3b8;
  font-weight: 400;
  font-size: 0.68rem;
}

.embedding-form input[type="url"],
.embedding-form input[type="text"],
.embedding-form input[type="password"],
.embedding-form input[type="number"] {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid #dbe2ea;
  border-radius: 7px;
  font-size: 0.82rem;
  box-sizing: border-box;
}

.embedding-check {
  flex-direction: row !important;
  align-items: center;
  gap: 0.45rem !important;
  font-weight: 500 !important;
}

.embedding-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.embedding-advanced {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 0.6rem 0.7rem;
  background: #f8fafc;
}

.embedding-advanced summary {
  cursor: pointer;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
}

.embedding-advanced .embedding-grid {
  margin-top: 0.6rem;
}

.embedding-advanced small {
  display: block;
  margin-top: 0.5rem;
  color: #94a3b8;
  font-size: 0.68rem;
}

.embedding-rerank {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 0.65rem;
  background: #f8fafc;
}

.embedding-rerank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.embedding-rerank-head h3 {
  margin: 0;
  font-size: 0.82rem;
  color: #0f172a;
}

.embedding-rerank-head h3 span {
  color: #94a3b8;
  font-weight: 400;
  font-size: 0.68rem;
}

.embedding-rerank .embedding-hint {
  margin: 0.35rem 0 0.55rem;
}

.rerank-test-btn {
  margin-top: 0.5rem;
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.72rem;
  cursor: pointer;
}

.embedding-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.embedding-actions button {
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  padding: 0.4rem 0.65rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.embedding-actions .save-btn {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}

.embedding-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.embedding-status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  margin-top: 0.8rem;
  font-size: 0.72rem;
  color: #64748b;
}

.embedding-status strong {
  color: #0f172a;
}

.embedding-error {
  color: #b91c1c;
  width: 100%;
}

.embedding-models {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.7rem;
}

.embedding-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 0.45rem 0.55rem;
}

.embedding-model-row strong {
  display: block;
  font-size: 0.76rem;
  color: #0f172a;
}

.embedding-model-row small {
  color: #94a3b8;
  font-size: 0.68rem;
}

.account-modal,
.users-modal {
  background: #fff;
  border-radius: 14px;
  padding: 1.25rem;
  width: min(560px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
}

.users-modal {
  width: min(820px, 94vw);
}

.account-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  margin-bottom: 0.9rem;
}

.account-summary strong {
  display: block;
  color: #0f172a;
  font-size: 0.9rem;
}

.account-summary small {
  color: #94a3b8;
  font-size: 0.72rem;
}

.account-notice {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  font-size: 0.78rem;
}

.account-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.account-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
}

.account-actions {
  display: flex;
  gap: 0.5rem;
}

.account-success {
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 7px;
  padding: 0.5rem 0.6rem;
  font-size: 0.78rem;
}

.account-danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid #f1f5f9;
  margin-top: 1.1rem;
  padding-top: 0.9rem;
}

.account-danger strong {
  display: block;
  color: #0f172a;
  font-size: 0.82rem;
}

.account-danger small {
  color: #94a3b8;
  font-size: 0.7rem;
}

.users-hint {
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.45;
}

.new-user-form {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto auto;
  gap: 0.4rem;
  margin: 0.65rem 0;
}

.new-user-form .save-btn {
  white-space: nowrap;
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.6rem;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.user-row.disabled {
  opacity: 0.62;
  background: #f8fafc;
}

.user-identity {
  flex: 1;
  min-width: 0;
}

.user-identity strong {
  display: block;
  color: #0f172a;
  font-size: 0.82rem;
}

.user-identity small {
  color: #94a3b8;
  font-size: 0.68rem;
}

.user-row select {
  border: 1px solid #dbe2ea;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  font-size: 0.72rem;
  background: #fff;
}

.user-badge {
  font-size: 0.65rem;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  white-space: nowrap;
}

.small-btn {
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #475569;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.68rem;
  cursor: pointer;
  white-space: nowrap;
}

.small-btn:hover {
  background: #f8fafc;
}

.small-btn.danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.temp-password {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 0.6rem;
  margin: 0.6rem 0;
}

.temp-password code {
  display: block;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 5px;
  padding: 0.35rem 0.45rem;
  margin: 0.25rem 0;
  font-size: 0.75rem;
}

.temp-password small {
  color: #92400e;
  font-size: 0.68rem;
}

.temp-password button {
  border: 1px solid #dbe2ea;
  background: #fff;
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.72rem;
  cursor: pointer;
}

@media (max-width: 760px) {
  .new-user-form {
    grid-template-columns: 1fr;
  }

  .user-row {
    flex-wrap: wrap;
  }
}

.mcp-settings-modal {
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem;
  width: min(620px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}

.mcp-hint {
  color: #5f6368;
  font-size: 0.8rem;
  line-height: 1.5;
}

.mcp-token-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.mcp-token-form input,
.mcp-token-form select {
  padding: 0.45rem 0.6rem;
  border: 1px solid #dadce0;
  border-radius: 5px;
  font-size: 0.85rem;
  background: #fff;
}

.mcp-token-form input[type="text"] {
  flex: 2 1 180px;
}

.mcp-token-form select {
  flex: 1 1 160px;
}

.mcp-token-form input[type="number"] {
  flex: 0 1 140px;
}

.mcp-token-reveal {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  background: #fef7e0;
  border: 1px solid #f1e0a8;
  border-radius: 6px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.mcp-token-reveal code {
  flex: 1;
  word-break: break-all;
  font-size: 0.75rem;
}

.mcp-token-reveal button {
  border: 1px solid #dadce0;
  background: #fff;
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
}

.mcp-token-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.mcp-token-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid #ededed;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
}

.mcp-token-row small {
  display: block;
  color: #80868b;
  font-size: 0.7rem;
  margin-top: 0.1rem;
}

.mcp-config {
  margin-top: 0.85rem;
  font-size: 0.8rem;
  color: #5f6368;
}

.mcp-config pre {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 0.6rem;
  overflow-x: auto;
  font-size: 0.72rem;
}

@media (max-width: 600px) {
  main {
    padding: 1rem;
  }

  .workspace {
    flex-direction: column;
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
