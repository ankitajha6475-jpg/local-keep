<template>
  <div id="app" :style="uiStyleVars">
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
      :initialColor="editingCanvasColor"
      :initialTags="editingCanvasTags"
      :revisionNo="editingCanvasRevisionNo"
      :knownTags="knownTags"
      :ws="wsRef"
      @back="closeCanvasEditor"
      @note-gone="handleNoteDeletedElsewhere"
    />

    <!-- Chat Room Editor (full-screen) -->
    <ChatRoomEditor
      v-else-if="isAuthenticated && currentView === 'chat'"
      :noteId="editingChatId"
      :initialTitle="editingChatTitle"
      :initialColor="editingChatColor"
      :initialTags="editingChatTags"
      :initialContent="editingChatContent"
      :revisionNo="editingChatRevisionNo"
      :knownTags="knownTags"
      :ws="wsRef"
      :currentUser="currentUser"
      @back="closeChatEditor"
    />

    <!-- Kanban Board Editor (full-screen) -->
    <KanbanBoardEditor
      v-else-if="isAuthenticated && currentView === 'kanban'"
      :noteId="editingKanbanId"
      :initialTitle="editingKanbanTitle"
      :initialColor="editingKanbanColor"
      :initialTags="editingKanbanTags"
      :initialContent="editingKanbanContent"
      :revisionNo="editingKanbanRevisionNo"
      :knownTags="knownTags"
      :ws="wsRef"
      :currentUser="currentUser"
      @back="closeKanbanEditor"
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
    <div v-else-if="isAuthenticated" class="main-app" :class="{ 'shortcuts-visible': shortcutsVisible }">
      <header ref="appHeader" @click="fabMenuOpen = false">
        <div class="header-inner" :class="{ 'shortcuts-visible': shortcutsVisible }">
          <template v-if="!searchOpen">
            <div class="brand">
              <span class="brand-mark" aria-hidden="true">
                <AppIcon name="note" :size="20" :stroke-width="2" />
              </span>
              <h1>Local Keep</h1>
            </div>
            <div class="header-right">
              <span class="sync-status" :class="{ connected: wsConnected, connecting: wsConnecting }" title="Live connection status">
                <span class="sync-dot" aria-hidden="true"></span>
                <span class="sync-label">{{ wsConnected ? 'Synced' : wsConnecting ? 'Connecting…' : 'Offline' }}</span>
              </span>
              <button
                v-if="!wsConnected && !wsConnecting"
                @click="manualReconnect"
                class="reconnect-btn"
                :data-shortcut="shortcut('reconnect')"
                aria-label="Reconnect now"
              >
                <AppIcon name="zap" :size="15" />
                <span>Connect</span>
              </button>
              <button
                @click="loadNotes"
                class="icon-btn"
                data-label="Refresh notes"
                :data-shortcut="shortcut('refresh')"
                aria-label="Refresh notes"
              >
                <AppIcon name="refresh" />
              </button>
              <button
                @click="tagSidebarOpen = !tagSidebarOpen"
                class="icon-btn"
                :class="{ active: tagSidebarOpen }"
                data-label="Toggle tags"
                :data-shortcut="shortcut('toggleTags')"
                aria-label="Toggle tags"
              >
                <AppIcon name="tag" />
              </button>
              <button
                @click="openGraph()"
                class="icon-btn"
                data-label="Relationship graph"
                :data-shortcut="shortcut('graph')"
                aria-label="Relationship graph"
              >
                <AppIcon name="graph" />
              </button>
              <button
                @click="openSearch"
                class="icon-btn"
                data-label="Search"
                :data-shortcut="shortcut('search')"
                :aria-label="`Search (${shortcut('search')})`"
              >
                <AppIcon name="search" />
              </button>
              <button
                @click="cleanupImages"
                class="icon-btn"
                :disabled="cleanupRunning"
                data-label="Clean unused images"
                :data-shortcut="shortcut('cleanImages')"
                aria-label="Clean unused images"
              >
                <AppIcon name="sparkles" />
              </button>
              <div class="account-menu-wrap" @click.stop>
                <button
                  type="button"
                  class="account-btn"
                  :aria-expanded="accountMenuOpen"
                  aria-haspopup="true"
                  :data-shortcut="shortcut('accountMenu')"
                  @click="accountMenuOpen = !accountMenuOpen"
                >
                  <span class="account-avatar">{{ userInitials }}</span>
                  <span class="account-name">{{ currentUser?.displayName || currentUser?.username }}</span>
                  <span class="account-chevron"><AppIcon name="chevron-down" :size="14" /></span>
                </button>
                <div v-if="accountMenuOpen" class="account-menu">
                  <div class="account-menu-head">
                    <strong>{{ currentUser?.displayName || currentUser?.username }}</strong>
                    <small>@{{ currentUser?.username }} · {{ currentUser?.role }}</small>
                  </div>
                  <button type="button" :data-shortcut="shortcut('accountSettings')" @click="openAccountSettings()">
                    <AppIcon name="settings" :size="16" /> Account settings
                  </button>
                  <button v-if="isAdmin" type="button" :data-shortcut="shortcut('manageUsers')" @click="openUsers">
                    <AppIcon name="users" :size="16" /> Manage users
                  </button>
                  <button v-if="isAdmin" type="button" :data-shortcut="shortcut('interfaceSettings')" @click="openUiSettings">
                    <AppIcon name="sliders" :size="16" /> Interface
                  </button>
                  <button type="button" :data-shortcut="shortcut('mcpSettings')" @click="openMcpSettings">
                    <AppIcon name="plug" :size="16" /> MCP access
                  </button>
                  <button v-if="isAdmin" type="button" :data-shortcut="shortcut('hybridSettings')" @click="openEmbeddingSettings">
                    <AppIcon name="sparkles" :size="16" /> Hybrid search
                  </button>
                  <button type="button" class="account-menu-danger" :data-shortcut="shortcut('logout')" @click="logout">
                    <AppIcon name="lock" :size="16" /> Lock workspace
                  </button>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="header-search-field">
              <span class="search-icon" aria-hidden="true"><AppIcon name="search" :size="18" /></span>
              <input
                ref="searchInput"
                v-model="searchQuery"
                type="text"
                :placeholder="semanticSearchEnabled ? 'Hybrid search…' : 'Search notes…'"
                class="search-input"
                @input="onSearchInput"
              >
              <button
                type="button"
                class="icon-btn icon-btn--sm search-semantic-btn"
                :class="{ active: semanticSearchEnabled }"
                :disabled="!semanticSearchAvailable"
                :title="semanticSearchAvailable
                  ? (semanticSearchEnabled ? 'Turn hybrid search off' : 'Turn hybrid search on')
                  : 'Enable an embedding model to use hybrid search'"
                data-label="Hybrid search"
                :data-shortcut="shortcut('hybridToggle')"
                :aria-label="semanticSearchEnabled ? 'Turn hybrid search off' : 'Turn hybrid search on'"
                @click="toggleSemanticSearch"
              >
                <AppIcon name="sparkles" :size="16" />
              </button>
              <button
                v-if="searchQuery"
                @click="clearSearch"
                class="icon-btn icon-btn--sm search-clear-btn"
                data-label="Clear search"
                :data-shortcut="shortcut('clearSearch')"
                aria-label="Clear search"
              >
                <AppIcon name="broom" :size="16" />
              </button>
              <button
                @click="closeSearch"
                class="icon-btn icon-btn--sm search-close-btn"
                data-label="Close search"
                :data-shortcut="shortcut('closeSearch')"
                :aria-label="`Close search (${shortcut('closeSearch')})`"
              >
                <AppIcon name="x" :size="16" />
              </button>
            </div>
          </template>
        </div>
      </header>

      <!-- Revision / conflict notice. The announcement lives in the live
           regions below, so this toast stays purely visual and there is
           exactly one polite region in the document. -->
      <div v-if="revisionNotice" class="revision-toast">
        <span>{{ revisionNotice }}</span>
        <button type="button" :data-shortcut="shortcut('dismissNotice')" @click="dismissRevisionNotice" title="Dismiss" aria-label="Dismiss notice">×</button>
      </div>

      <!-- Centralised live regions: one polite, one assertive. -->
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ livePolite }}</div>
      <div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{{ liveAssertive }}</div>

      <main @click="fabMenuOpen = false">
        <div class="workspace">
          <TagSidebar
            v-if="tagSidebarOpen"
            :tree="tagsTree"
            :active-tag="activeTag"
            :untagged-only="untaggedOnly"
            :mod-key="modKey"
            @select="selectTag"
            @close="tagSidebarOpen = false"
            @tag-op="runTagOp"
          />
          <div class="workspace-content">
        <!-- Selection Action Bar -->
        <div v-if="selectedNoteIds.size > 0" class="selection-bar">
          <div class="selection-info">
            <span class="selection-count">{{ selectedNoteIds.size }} selected</span>
          </div>
          <div class="selection-actions">
            <button @click="selectAll" class="btn-select-all" :data-shortcut="shortcut('selectAll')">Select All</button>
            <button @click="deselectAll" class="btn-deselect-all" :data-shortcut="shortcut('deselectAll')">Deselect All</button>
            <button
              @click="openSelectionLinks"
              class="btn-selection-links"
              :disabled="selectionLinksLoading"
              :data-shortcut="shortcut('selectionLinks')"
              title="List what these notes link to and what links to them"
            >
              🔗 Links
            </button>
            <button @click="triggerDeleteConfirm(null)" class="btn-delete-selected" :data-shortcut="shortcut('deleteSelected')" title="Delete selected notes">
              🗑️ Delete
            </button>
          </div>
        </div>

        <!-- Sort / Control Bar -->
        <div v-else class="control-bar">
          <div class="control-left">
            <div class="dashboard-tabs" role="tablist" aria-label="Note views">
              <button
                type="button"
                role="tab"
                id="tab-notes"
                class="dashboard-tab"
                :class="{ active: dashboardTab === 'notes' }"
                :aria-selected="dashboardTab === 'notes'"
                aria-controls="notes-panel"
                :tabindex="dashboardTab === 'notes' ? 0 : -1"
                :data-shortcut="shortcut('tabNotes')"
                @click="setDashboardTab('notes')"
                @keydown="onTabKeydown($event, 'notes')"
              >
                Notes <span class="tab-count">{{ notesTabCount }}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-archived"
                class="dashboard-tab"
                :class="{ active: dashboardTab === 'archived' }"
                :aria-selected="dashboardTab === 'archived'"
                aria-controls="notes-panel"
                :tabindex="dashboardTab === 'archived' ? 0 : -1"
                :data-shortcut="shortcut('tabArchived')"
                @click="setDashboardTab('archived')"
                @keydown="onTabKeydown($event, 'archived')"
              >
                Archived <span class="tab-count">{{ archivedTabCount }}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-drafts"
                class="dashboard-tab"
                :class="{ active: dashboardTab === 'drafts' }"
                :aria-selected="dashboardTab === 'drafts'"
                aria-controls="notes-panel"
                :tabindex="dashboardTab === 'drafts' ? 0 : -1"
                :data-shortcut="shortcut('tabDrafts')"
                @click="setDashboardTab('drafts')"
                @keydown="onTabKeydown($event, 'drafts')"
              >
                Drafts <span class="tab-count">{{ drafts.length }}</span>
              </button>
            </div>
            <span class="notes-count">{{ visibleCountText }}</span>
            <span v-if="activeTag" class="tag-filter-chip">
              #{{ activeTag }}
              <button type="button" :data-shortcut="shortcut('clearTagFilter')" @click="clearTag" title="Clear tag filter" aria-label="Clear tag filter">×</button>
            </span>
            <span v-else-if="untaggedOnly" class="tag-filter-chip">
              Untagged
              <button type="button" :data-shortcut="shortcut('clearTagFilter')" @click="clearTag" title="Clear tag filter" aria-label="Clear tag filter">×</button>
            </span>
          </div>
          <div class="control-right">
            <button
              v-if="dashboardTab === 'drafts'"
              @click="loadDrafts"
              class="drafts-refresh-btn"
              :disabled="draftsLoading"
              :data-shortcut="shortcut('refreshDrafts')"
              title="Refresh drafts"
              aria-label="Refresh drafts"
            >
              <AppIcon name="refresh" :size="15" />
            </button>
            <span class="sort-label">Sort by:</span>
            <select v-model="sortBy" class="sort-select">
              <option v-if="searchQuery.trim()" value="relevance">Relevance</option>
              <option value="updatedAt">Last Modified</option>
              <option value="createdAt">Date Created</option>
              <option value="title">Title</option>
            </select>
            <button
              @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
              class="sort-dir-btn"
              :disabled="sortBy === 'relevance'"
              :data-shortcut="shortcut('sortDirection')"
              :title="sortBy === 'relevance' ? 'Search relevance order' : (sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending')"
            >
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </button>
          </div>
        </div>

        <div
          ref="notesGridRef"
          id="notes-panel"
          role="tabpanel"
          :aria-labelledby="`tab-${dashboardTab}`"
          class="notes-grid notes-grid-virtual"
          :class="{ 'notes-grid-selection-active': selectedNoteIds.size > 0 }"
        >
          <div v-if="notesLoading && dashboardNotes.length === 0" class="notes-empty">
            <p>Loading notes…</p>
          </div>
          <div v-else-if="notesError && dashboardNotes.length === 0" class="notes-empty">
            <p class="error">{{ notesError }}</p>
            <button type="button" class="image-btn" :data-shortcut="shortcut('retryNotes')" @click="loadNotes">Retry</button>
          </div>
          <div v-else-if="dashboardNotes.length === 0" class="notes-empty">
            <template v-if="dashboardTab === 'drafts'">
              <p v-if="draftsLoading">Loading drafts…</p>
              <p v-else-if="draftsError" class="error">{{ draftsError }}</p>
              <p v-else>No drafts yet. Use <strong>Draft</strong> in the editor to keep changes without committing a revision.</p>
            </template>
            <p v-else-if="dashboardTab === 'archived'">No archived notes.</p>
          </div>
          <RecycleScroller
            v-else
            ref="notesScrollerRef"
            page-mode
            class="notes-virtual-scroller"
            :items="virtualNoteRows"
            :item-size="noteRowHeight"
            :buffer="noteRenderBuffer"
            :emit-update="true"
            key-field="id"
            @update="onVirtualUpdate"
          >
            <template #default="{ item: row }">
              <div
                class="virtual-note-row"
                :style="{ gridTemplateColumns: `repeat(${noteColumnCount}, minmax(0, 1fr))` }"
              >
                <DashboardNoteCard
                  v-for="entry in row.items"
                  :key="entry.id"
                  :entry="entry"
                  :detail="noteDetailFor(entry)"
                  :dashboard-tab="dashboardTab"
                  :selected="selectedNoteIds.has(entry.id)"
                  :editing="entry.id === editingId"
                  :has-draft="draftNoteIds.has(entry.id)"
                  :copied="copiedId === entry.id"
                  :color-menu-open="openColorNoteId === entry.id"
                  :presence-count="presenceCount(entry.id)"
                  :presence-title="presenceTitle(entry.id)"
                  :render-content="renderContent"
                  :format-date="formatDate"
                  @open="handleCardClick"
                  @toggle-select="toggleSelect"
                  @toggle-color="toggleNoteColorPicker"
                  @select-color="setNoteColor"
                  @copy="copyNote"
                  @restore="restoreArchivedNote"
                  @archive="triggerDeleteConfirm"
                  @select-tag="selectTag"
                  @content-click="onContentClick"
                />
              </div>
            </template>
          </RecycleScroller>
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
        :mod-key="modKey"
        @close="graphOpen = false"
        @refresh="refreshGraph"
        @open="openGraphNode"
      />

      <SelectionLinksPanel
        v-if="selectionLinksOpen"
        :summary="selectionLinksData"
        :selected-count="selectedNoteIds.size"
        :selected-ids="selectedNoteIdList"
        :loading="selectionLinksLoading"
        :error="selectionLinksError"
        :mode="selectionLinksMode"
        :mod-key="modKey"
        @update:mode="selectionLinksMode = $event"
        @close="closeSelectionLinks"
        @open="openSelectionLinkNote"
      />

      <!-- MCP settings -->
      <dialog v-if="mcpSettingsOpen" class="modal-overlay" ref="mcpSettingsDialog" closedby="any" @close="mcpSettingsController.onClosed" aria-labelledby="mcpSettingsDialog-title">
        <div class="modal-content mcp-settings-modal">
          <div class="modal-header">
            <h2 id="mcpSettingsDialog-title">🔌 MCP access</h2>
            <button class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="mcpSettingsOpen = false" title="Close" aria-label="Close MCP access settings">×</button>
          </div>
          <p class="mcp-hint">
            MCP clients use one token per client. Read/write tokens can search, read, and edit;
            admin tokens can also manage tokens and configuration. Tokens are shown once and
            stored hashed. Only a human admin session can create another admin token.
          </p>
          <div v-if="isAdmin" class="mcp-limit-settings">
            <h3>Session limits</h3>
            <p class="mcp-hint">
              Limits apply per MCP token. Raise the write limit when several sub-agents share
              one token and need different notes open at the same time.
            </p>
            <form class="mcp-limit-form" @submit.prevent="saveMcpLimits">
              <label>
                Max open write notes per token
                <input v-model.number="mcpLimitsForm.maxWriteSessions" type="number" min="1" max="64" required>
              </label>
              <label>
                Max read sessions per token
                <input v-model.number="mcpLimitsForm.maxReadSessions" type="number" min="1" max="64" required>
              </label>
              <button type="submit" class="save-btn" :data-shortcut="shortcut('mcpSaveLimits')" :disabled="mcpLimitsSaving || mcpLimitsLoading">
                {{ mcpLimitsSaving ? 'Saving…' : 'Save limits' }}
              </button>
            </form>
            <p v-if="mcpLimitsError" class="error">{{ mcpLimitsError }}</p>
            <p v-if="mcpLimitsNotice" class="account-success">{{ mcpLimitsNotice }}</p>
          </div>
          <form class="mcp-token-form" @submit.prevent="createMcpToken">
            <input v-model="mcpTokenName" type="text" placeholder="Token name (e.g. Claude Desktop)">
            <select v-model="mcpTokenScopes" aria-label="Token scopes">
              <option value="read">read (read-only)</option>
              <option value="read,write">read, write (client)</option>
              <option v-if="isAdmin" value="read,write,admin">read, write, admin</option>
            </select>
            <input v-model.number="mcpTokenExpiresDays" type="number" min="0" placeholder="Expires in days">
            <button type="submit" class="save-btn" :data-shortcut="shortcut('mcpCreateToken')" :disabled="!mcpTokenName.trim()">Create token</button>
          </form>
          <div v-if="mcpNewToken" class="mcp-token-reveal">
            <code>{{ mcpNewToken }}</code>
            <button type="button" :data-shortcut="shortcut('mcpCopyToken')" @click="copyMcpToken">Copy</button>
          </div>
          <p v-if="mcpTokenError" class="error">{{ mcpTokenError }}</p>
          <p v-if="mcpTokenLoading" class="mcp-hint">Loading tokens…</p>
          <div v-else-if="mcpTokens.length === 0" class="mcp-hint">No tokens yet.</div>
          <div v-else class="mcp-token-list">
            <div v-for="token in mcpTokens" :key="token.id" class="mcp-token-row">
              <div>
                <strong>{{ token.name }}</strong>
                <span v-if="isAdmin && token.username" class="user-badge" style="margin-left: 0.4rem;">@{{ token.username }}</span>
                <small>
                  {{ token.scopes.join(', ') }}
                  <template v-if="token.createdBy"> · by {{ token.createdBy }}</template>
                  <template v-if="token.createdAt"> · created {{ formatDate(token.createdAt) }}</template>
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
      </dialog>

      <!-- Account settings -->
      <dialog v-if="accountSettingsOpen" class="modal-overlay" ref="accountSettingsDialog" closedby="any" @close="accountSettingsController.onClosed" aria-labelledby="accountSettingsDialog-title">
        <div class="modal-content account-modal">
          <div class="modal-header">
            <h2 id="accountSettingsDialog-title">{{ accountSettingsForced ? 'Set a new password' : 'Account settings' }}</h2>
            <button v-if="!accountSettingsForced" type="button" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="closeAccountSettings" title="Close" aria-label="Close account settings">×</button>
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
              <button type="submit" class="save-btn" :data-shortcut="shortcut('accountSavePassword')">Update password</button>
              <button v-if="!accountSettingsForced" type="button" class="cancel-btn" :data-shortcut="shortcut('accountCancel')" @click="closeAccountSettings">Cancel</button>
            </div>
          </form>
          <div class="account-danger">
            <div>
              <strong>Sign out everywhere</strong>
              <small>Revoke all browser sessions for this account.</small>
            </div>
            <button type="button" class="cancel-btn" :data-shortcut="shortcut('logoutAll')" @click="logoutAll">Sign out all</button>
          </div>
        </div>
      </dialog>

      <!-- Interface settings -->
      <dialog v-if="uiSettingsOpen" class="modal-overlay" ref="uiSettingsDialog" closedby="any" @close="uiSettingsController.onClosed" aria-labelledby="uiSettingsDialog-title">
        <div class="modal-content ui-settings-modal">
          <div class="modal-header">
            <h2 id="uiSettingsDialog-title">🎛 Interface settings</h2>
            <button type="button" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="closeUiSettings" title="Close" aria-label="Close interface settings">×</button>
          </div>
          <p class="ui-settings-hint">
            Defaults come from <code>{{ uiSettings.filePath || 'config.json' }}</code>.
            Runtime overrides are stored in the database and applied to every connected client.
          </p>
          <p v-if="uiSettings.fileError" class="error">
            Config file error: {{ uiSettings.fileError }}
          </p>
          <p v-if="uiSettingsLoading" class="ui-settings-loading">Loading…</p>
          <form v-else class="ui-settings-form" @submit.prevent="saveUiSettings">
            <div class="ui-settings-grid">
              <label v-for="field in uiConfigFields" :key="field.key">
                <span>{{ field.label }}</span>
                <input
                  v-model.number="uiSettingsForm[field.key]"
                  type="number"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                  required
                >
                <small>{{ field.min }}–{{ field.max }} px</small>
              </label>
            </div>
            <p v-if="uiSettingsError" class="error">{{ uiSettingsError }}</p>
            <p v-if="uiSettingsNotice" class="account-success">{{ uiSettingsNotice }}</p>
            <div class="ui-settings-actions">
              <button type="submit" class="save-btn" :data-shortcut="shortcut('uiSave')" :disabled="uiSettingsSaving">
                {{ uiSettingsSaving ? 'Saving…' : 'Save and apply' }}
              </button>
              <button
                type="button"
                class="cancel-btn"
                :data-shortcut="shortcut('uiReset')"
                :disabled="uiSettingsSaving"
                @click="resetUiSettings"
              >Reset to config file</button>
              <button type="button" class="cancel-btn" :data-shortcut="shortcut('uiClose')" @click="closeUiSettings">Close</button>
            </div>
          </form>
        </div>
      </dialog>

      <!-- User administration -->
      <dialog v-if="usersOpen" class="modal-overlay" ref="usersDialog" closedby="any" @close="usersController.onClosed" aria-labelledby="usersDialog-title">
        <div class="modal-content users-modal">
          <div class="modal-header">
            <h2 id="usersDialog-title">👥 People</h2>
            <button type="button" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="usersOpen = false" title="Close" aria-label="Close people settings">×</button>
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
            <button type="submit" class="save-btn" :data-shortcut="shortcut('usersAdd')">Add person</button>
            <input
              v-model="newUserForm.tagWhitelist"
              type="text"
              placeholder="Tag whitelist (.gitignore syntax, e.g. * or work/*,!:untagged)"
              class="new-user-whitelist"
            >
          </form>
          <p v-if="usersError" class="error">{{ usersError }}</p>
          <div v-if="resetPasswordResult" class="temp-password">
            <div>
              <strong>Temporary password</strong>
              <code>{{ resetPasswordResult }}</code>
              <small>Share it once; the user must change it after signing in.</small>
            </div>
            <button type="button" :data-shortcut="shortcut('usersCopyTempPassword')" @click="copyToClipboard(resetPasswordResult)">Copy</button>
          </div>

          <p v-if="usersLoading" class="users-hint">Loading…</p>
          <div v-else class="users-list">
            <div v-for="user in usersList" :key="user.id" class="user-card" :class="{ disabled: user.disabledAt }">
              <div class="user-row">
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
              <div class="user-whitelist-row">
                <input
                  :value="editingTagWhitelists[user.id] ?? user.tagWhitelist ?? ''"
                  @input="editingTagWhitelists[user.id] = $event.target.value"
                  placeholder="Tag whitelist (e.g. * or work/*,!:untagged)"
                  class="user-whitelist-input"
                >
                <button
                  v-if="editingTagWhitelists[user.id] !== undefined && editingTagWhitelists[user.id] !== (user.tagWhitelist || '')"
                  type="button"
                  class="small-btn save-btn"
                  @click="saveUserWhitelist(user)"
                >Save tags</button>
              </div>
            </div>
          </div>
        </div>
      </dialog>

      <!-- Admin: semantic search settings -->
      <dialog v-if="embeddingSettingsOpen" class="modal-overlay" ref="embeddingSettingsDialog" closedby="any" @close="embeddingSettingsController.onClosed" aria-labelledby="embeddingSettingsDialog-title">
        <div class="modal-content embedding-modal">
          <div class="modal-header">
            <h2 id="embeddingSettingsDialog-title">✨ Hybrid search</h2>
            <button type="button" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="embeddingSettingsOpen = false" title="Close" aria-label="Close hybrid search settings">×</button>
          </div>
          <p class="embedding-hint">
            OpenAI-compatible embeddings (SiliconFlow by default). The API key is encrypted at rest.
            Changing the model name or dimensions creates or reuses a separate variant table; old tables are preserved.
          </p>
          <p v-if="embeddingLoading" class="embedding-hint">Loading status…</p>
          <form class="embedding-form" @submit.prevent="saveEmbeddingSettings">
            <label class="embedding-check">
              <input v-model="embeddingForm.enabled" type="checkbox">
              Enable hybrid search (semantic + keyword)
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
              <button type="button" class="rerank-test-btn" :data-shortcut="shortcut('embeddingTestRerank')" :disabled="rerankTesting" @click="testRerankSettings">
                {{ rerankTesting ? 'Testing rerank…' : 'Test rerank' }}
              </button>
            </div>

            <p v-if="embeddingError" class="error">{{ embeddingError }}</p>
            <p v-if="embeddingNotice" class="account-success">{{ embeddingNotice }}</p>
            <div class="embedding-actions">
              <button type="submit" class="save-btn" :data-shortcut="shortcut('embeddingSave')" :disabled="embeddingSaving">
                {{ embeddingSaving ? 'Saving…' : 'Save & enable' }}
              </button>
              <button type="button" class="cancel-btn" :data-shortcut="shortcut('embeddingTest')" :disabled="embeddingTesting" @click="testEmbeddingSettings">
                {{ embeddingTesting ? 'Testing…' : 'Test connection' }}
              </button>
              <button type="button" class="cancel-btn" :data-shortcut="shortcut('embeddingRebuild')" @click="reindexEmbeddings">Rebuild index</button>
              <button type="button" class="cancel-btn" :data-shortcut="shortcut('embeddingReset')" :disabled="embeddingQueue?.running" @click="resetEmbeddingIndex">Reset index</button>
              <button type="button" class="cancel-btn" :data-shortcut="shortcut('embeddingRefresh')" @click="refreshEmbeddingStatus">Refresh status</button>
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
      </dialog>

      <!-- Modal for Add/Edit Note -->
      <dialog v-if="isModalOpen" class="modal-overlay" ref="noteEditorDialog" closedby="any" @close="noteEditorController.onClosed" aria-labelledby="noteEditorDialog-title">
        <div
          class="modal-content note-form-modal"
          :class="[
            { 'editing-form': editingId !== null, 'is-tinted': !!editingColor },
            editingColor ? `note-color-${editingColor}` : ''
          ]"
          :style="modalSize.width ? { width: modalSize.width + 'px', height: modalSize.height + 'px', maxWidth: 'none', maxHeight: 'none' } : {}"
        >
          <div class="modal-header">
            <h2 id="noteEditorDialog-title">
              Editor
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
                :data-shortcut="shortcut('noteGraph')"
                title="Open relationship graph for this note"
              >🕸 Graph</button>
              <button
                v-if="editingId"
                type="button"
                @click="openBacklinks"
                class="history-btn"
                :data-shortcut="shortcut('noteBacklinks')"
                title="Show notes linking here"
              >🔗 Backlinks</button>
              <button
                v-if="editingId"
                type="button"
                @click="openHistory"
                class="history-btn"
                :data-shortcut="shortcut('noteHistory')"
                title="View revision history"
              >🕘 History<span class="history-version-badge" title="Current version">v{{ editingRevisionNo }}</span></button>
              <button @click="closeModal" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" title="Close" aria-label="Close editor">×</button>
            </div>
          </div>
          <form @submit.prevent="editingId ? saveEdit() : addNote()">
            <!-- Head metadata: the folder name and its icon. Both live outside
                 the fence, so they sit together above the properties panel. -->
            <div class="note-title-row">
              <input
                ref="modalTitleInput"
                v-model="newNoteTitle"
                type="text"
                placeholder="Title"
                class="note-title-input"
                :autofocus="editingId ? undefined : ''"
                @keydown.ctrl.enter.stop.prevent="editingId ? saveEdit() : addNote()"
                @keydown.meta.enter.stop.prevent="editingId ? saveEdit() : addNote()"
                @blur="applyPendingRemoteTitle"
              >
              <div class="card-color-picker" @click.stop>
                <button
                  type="button"
                  class="card-color-btn"
                  :class="`card-color-btn--${editingColor || 'default'}`"
                  :aria-label="`Note color: ${noteColorLabel(editingColor)}`"
                  :title="`Note color: ${noteColorLabel(editingColor)}`"
                  @click="toggleEditingColorMenu"
                >
                  <AppIcon name="palette" :size="15" />
                </button>
                <div
                  v-if="editingColorMenuOpen"
                  class="note-color-menu"
                  role="group"
                  aria-label="Choose note color"
                >
                  <button
                    v-for="opt in NOTE_COLOR_OPTIONS"
                    :key="opt.id || 'default'"
                    type="button"
                    class="note-color-option"
                    :class="[
                      `note-color-option--${opt.id || 'default'}`,
                      { selected: (editingColor || null) === (opt.id || null) }
                    ]"
                    :title="opt.label"
                    :aria-label="opt.label"
                    :aria-pressed="(editingColor || null) === (opt.id || null)"
                    @click="setEditingColor(opt.id); editingColorMenuOpen = false"
                  >
                    <AppIcon
                      v-if="(editingColor || null) === (opt.id || null)"
                      name="check"
                      :size="13"
                      :stroke-width="2.4"
                    />
                  </button>
                </div>
              </div>
            </div>
            <!-- Properties section (the fence): tags, aliases, typed user fields.
                 The title row and the Presentation heading are head metadata. -->
            <div class="note-properties" :class="{ 'props-collapsed': !propsOpen }" data-label="Properties">
              <button
                type="button"
                class="props-toggle"
                :aria-expanded="propsOpen"
                @click="propsOpen = !propsOpen"
              >
                <span class="props-caret">{{ propsOpen ? '▾' : '▸' }}</span>
                <span class="props-toggle-label">Properties</span>
                <span v-if="!propsOpen" class="props-summary">{{ propsSummary }}</span>
              </button>
              <div class="prop-row">
                <label class="prop-key" for="prop-tag-input">tags</label>
                <div class="prop-chips">
                  <span
                    v-for="tag in noteTagList"
                    :key="tag"
                    class="prop-chip"
                  >#{{ tag }}<button
                      type="button"
                      class="prop-chip-remove"
                      :aria-label="`Remove tag ${tag}`"
                      @click="removeTagProp(tag)"
                    >×</button></span>
                  <div class="prop-tag-field">
                    <input
                      id="prop-tag-input"
                      ref="tagInput"
                      type="text"
                      class="prop-chip-input"
                      placeholder="Add tag…"
                      autocomplete="off"
                      role="combobox"
                      aria-controls="tag-suggestions"
                      :aria-expanded="tagSuggestOpen && tagSuggestions.length > 0"
                      :aria-activedescendant="tagActiveDescendant"
                      aria-autocomplete="list"
                      v-model="tagDraft"
                      @input="tagSuggestOpen = true"
                      @focus="tagSuggestOpen = true"
                      @blur="onTagInputBlur"
                      @keydown.enter="onTagEnter"
                      @keydown.,="onTagComma"
                      @keydown.down="onTagArrow($event, 1)"
                      @keydown.up="onTagArrow($event, -1)"
                      @keydown.esc="onTagEscape"
                    >
                    <ul
                      v-if="tagSuggestOpen && tagSuggestions.length"
                      id="tag-suggestions"
                      class="tag-suggestions"
                      role="listbox"
                      aria-label="Tag suggestions"
                    >
                      <li
                        v-for="(tag, index) in tagSuggestions"
                        :id="`tag-suggestion-${index}`"
                        :key="tag"
                        role="option"
                        class="tag-suggestion"
                        :class="{ active: index === tagSuggestIndex }"
                        :aria-selected="index === tagSuggestIndex"
                        @mousedown.prevent="pickTagSuggestion(tag)"
                        @mouseenter="tagSuggestIndex = index"
                      >
                        <span class="tag-suggestion-path">#{{ tag }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div class="prop-row">
                <label class="prop-key" for="prop-aliases">aliases</label>
                <input
                  id="prop-aliases"
                  type="text"
                  class="prop-value"
                  :value="aliasDraft"
                  placeholder="Comma-separated aliases"
                  @change="setAliasProp($event.target.value)"
                >
              </div>
              <div
                v-for="(entry, index) in userPropEntries"
                :key="entry.key"
                class="prop-row"
              >
                <label class="prop-key" :for="`prop-field-${index}`">{{ entry.key }}</label>
                <input
                  v-if="entry.type !== 'checkbox'"
                  :id="`prop-field-${index}`"
                  type="text"
                  class="prop-value"
                  :value="entry.value"
                  @change="setUserProp(entry.key, $event.target.value)"
                >
                <input
                  v-else
                  :id="`prop-field-${index}`"
                  type="checkbox"
                  class="prop-checkbox"
                  :checked="entry.value"
                  @change="setUserProp(entry.key, $event.target.checked)"
                >
                <button
                  type="button"
                  class="prop-remove"
                  :aria-label="`Remove property ${entry.key}`"
                  @click="removePropKey(entry.key)"
                >×</button>
              </div>
              <div class="prop-row">
                <label class="prop-key" for="prop-new-key">add</label>
                <input
                  id="prop-new-key"
                  type="text"
                  class="prop-value"
                  placeholder="New property name…"
                  v-model="propKeyDraft"
                  @keydown.enter="onPropKeyEnter"
                >
                <button type="button" class="prop-add" @click="addPropKey" title="Add property" aria-label="Add property">+</button>
              </div>
            </div>
            <div class="note-editor-toolbar">
              <MarkdownToolbar
                :mod-key="modKey"
                :shortcuts-visible="shortcutsVisible"
                @command="runEditorCommand"
              >
                <template #append>
                  <button type="button" @click="triggerImageUpload" class="image-btn" data-label="Insert image" :data-shortcut="shortcut('noteInsertImage')" :disabled="imageUploading" title="Insert image">
                    {{ imageUploading ? '⏳' : '🖼️' }}
                  </button>
                </template>
              </MarkdownToolbar>
            </div>
            <div
              v-if="editorMode === 'write'"
              ref="imageEditor"
              class="note-editor"
              contenteditable="true"
              data-placeholder="Take a note..."
              autofocus
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
              autofocus
              @keydown="onEditorKeydown"
              @paste="onMarkdownPaste"
            ></textarea>
            <div class="note-form-actions">
              <div class="editor-footer-controls">
                <div class="editor-mode-switch">
                  <button
                    type="button"
                    class="mode-btn"
                    :class="{ active: editorMode === 'write' }"
                    :data-shortcut="shortcut('noteVisual')"
                    @click="setEditorMode('write')"
                    title="Rendered markdown; images displayed"
                  >Visual</button>
                  <button
                    type="button"
                    class="mode-btn"
                    :class="{ active: editorMode === 'plain' }"
                    :data-shortcut="shortcut('noteSource')"
                    @click="setEditorMode('plain')"
                    title="Raw markdown source; images shown as URLs"
                  >Source</button>
                </div>
                <select
                  v-model="pasteMode"
                  class="paste-mode-select"
                  title="Paste behavior: plain keeps clipboard text exactly; rich converts HTML to markdown"
                >
                  <option value="plain">Paste: plain</option>
                  <option value="rich">Paste: rich</option>
                </select>
              </div>
              <div class="action-buttons">
                <button type="submit" class="save-btn" :data-shortcut="shortcut('noteSave')">{{ editingId ? 'Save' : 'Add Note' }}</button>
                <button v-if="editingId" type="button" @click="draftAndClose" class="draft-btn" :data-shortcut="shortcut('noteDraft')">Draft</button>
                <button type="button" @click="discardChanges" class="cancel-btn" :data-shortcut="shortcut('noteDiscard')">Discard</button>
              </div>
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
          <dialog v-if="historyOpen" class="history-overlay" ref="historyDialog" closedby="any" @close="historyController.onClosed" aria-labelledby="historyDialog-title">
            <div class="history-panel">
              <div class="history-header">
                <h3 id="historyDialog-title">Revision history</h3>
                <button type="button" class="close-modal-btn" :data-shortcut="shortcut('closeDialog')" @click="closeHistory" title="Close" aria-label="Close revision history">×</button>
              </div>
              <p v-if="historyLoading" class="history-loading">Loading history…</p>
              <p v-if="historyError" class="error">{{ historyError }}</p>
              <div v-if="versionChain.length" class="version-chain">
                <span class="version-chain-label">Version chain</span>
                <template v-for="(n, i) in versionChain" :key="n">
                  <span v-if="i > 0" class="version-chain-arrow">→</span>
                  <span class="version-chain-node">v{{ n }}</span>
                </template>
              </div>
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
          </dialog>

          <BacklinksPanel
            v-if="backlinksOpen"
            :backlinks="backlinks"
            :loading="backlinksLoading"
            :error="backlinksError"
            @close="backlinksOpen = false"
            @open="openBacklinkSource"
          />

          <LinkDialog
            v-if="linkDialogOpen"
            :mode="linkDialogMode"
            :initial-text="linkDialogInitialText"
            :search-notes="searchLinkNotes"
            :mod-key="modKey"
            @close="closeLinkDialog"
            @submit="submitLinkDialog"
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
                <button type="button" class="save-btn" :data-shortcut="shortcut('deletedSave')" @click="saveDeletedAsNew">Save as new note</button>
                <button type="button" class="cancel-btn" :data-shortcut="shortcut('deletedDiscard')" @click="discardDeleted">Discard</button>
              </div>
            </div>
          </div>
        </div>
      </dialog>

      <!-- Unsaved Changes Confirmation Modal -->
      <dialog v-if="isUnsavedChangesOpen" class="modal-overlay" ref="unsavedChangesDialog" closedby="none" @cancel="onUnsavedChangesCancel" @close="unsavedChangesController.onClosed" aria-labelledby="unsavedChangesDialog-title">
        <div class="modal-content confirm-modal">
          <h2 id="unsavedChangesDialog-title">Unsaved Changes</h2>
          <p>
            You have unsaved changes. What would you like to do?
          </p>
          <div class="confirm-actions">
            <button @click="saveAndClose" class="save-btn" :data-shortcut="shortcut('unsavedSave')">Save</button>
            <button v-if="editingId" @click="draftAndClose" class="draft-btn" :data-shortcut="shortcut('unsavedDraft')">Draft</button>
            <button @click="discardChanges" class="cancel-confirm-btn" :data-shortcut="shortcut('unsavedDiscard')">Discard</button>
            <button @click="cancelDiscardChanges" class="continue-btn" autofocus :data-shortcut="shortcut('unsavedContinue')">Continue</button>
          </div>
        </div>
      </dialog>

      <!-- Custom Confirmation Modal for Deletion -->
      <dialog v-if="isConfirmOpen" class="modal-overlay" ref="confirmDialog" closedby="any" @close="confirmController.onClosed" aria-labelledby="confirmDialog-title">
        <div class="modal-content confirm-modal">
          <h2 id="confirmDialog-title">{{ noteToDeleteId ? 'Archive Note?' : 'Archive Selected Notes?' }}</h2>
          <p>
            {{ noteToDeleteId ? 'This note will be hidden from the list.' : `These ${selectedNoteIds.size} notes will be hidden from the list.` }}
            Its revision history is kept and the note can be restored.
          </p>
          <div class="confirm-actions">
            <button @click="confirmDelete" class="delete-confirm-btn" :data-shortcut="shortcut('confirmArchive')">Archive</button>
            <button @click="closeConfirm" class="cancel-confirm-btn" autofocus :data-shortcut="shortcut('confirmCancel')">Cancel</button>
          </div>
        </div>
      </dialog>

      <!-- Floating Action Button (dashboard only — not over the whiteboard, chat or kanban view) -->
      <div v-if="isAuthenticated && currentView !== 'canvas' && currentView !== 'chat' && currentView !== 'kanban'" class="fab-container" :class="{ 'shortcuts-visible': shortcutsVisible }">
        <div v-if="fabMenuOpen" class="fab-menu">
          <button @click="fabNewTextNote" class="fab-menu-item" :data-shortcut="shortcut('fabTextNote')">
            <span class="fab-menu-icon"><AppIcon name="note" :size="18" /></span>
            <span>Text Note</span>
          </button>
          <button @click="fabNewWhiteboard" class="fab-menu-item" :data-shortcut="shortcut('fabWhiteboard')">
            <span class="fab-menu-icon"><AppIcon name="whiteboard" :size="18" /></span>
            <span>Whiteboard</span>
          </button>
          <button @click="fabNewChatRoom" class="fab-menu-item">
            <span class="fab-menu-icon"><AppIcon name="message" :size="18" /></span>
            <span>Chat Room</span>
          </button>
          <button @click="fabNewKanbanBoard" class="fab-menu-item">
            <span class="fab-menu-icon"><AppIcon name="kanban" :size="18" /></span>
            <span>Kanban Board</span>
          </button>
        </div>
        <button
          @click="toggleFabMenu"
          class="fab-btn"
          :class="{ 'fab-open': fabMenuOpen }"
          data-label="Create new"
          :data-shortcut="shortcut('fabMenu')"
          :aria-label="`Create new (${shortcut('fabMenu')})`"
        >
          <AppIcon name="plus" :size="22" :stroke-width="2.1" />
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import debug from 'debug'
import WhiteboardEditor from './components/WhiteboardEditor.vue'
import ChatRoomEditor from './components/ChatRoomEditor.vue'
import KanbanBoardEditor from './components/KanbanBoardEditor.vue'
import TagSidebar from './components/TagSidebar.vue'
import GraphView from './components/GraphView.vue'
import BacklinksPanel from './components/BacklinksPanel.vue'
import SelectionLinksPanel from './components/SelectionLinksPanel.vue'
import MarkdownToolbar from './components/MarkdownToolbar.vue'
import LinkDialog from './components/LinkDialog.vue'
import AppIcon from './components/AppIcon.vue'
import DashboardNoteCard from './components/DashboardNoteCard.vue'
import {
  chunkDashboardItems,
  dashboardColumnCount,
  detailWindowRange,
  orderBySearchResults,
  virtualItemRange
} from './utils/dashboardVirtual.js'
import { getDisplayTitle } from './utils/notes.js'
import { renderMermaidBlocks } from './utils/mermaid.js'
import { matchEditorShortcut } from './shared/editorTools.js'
import { SHORTCUTS, shortcutLabel, eventShortcut } from './shared/shortcuts.js'
import { isImeComposing, runUnlessIme } from './shared/ime.js'
import { createOverlayStack, createDialogController, installLightDismiss } from './shared/dialog.js'
import { buildLinkMarkdown } from './shared/linkMarkdown.js'
import {
  DEFAULT_UI_CONFIG,
  UI_CONFIG_FIELDS
} from './shared/uiConfig.js'
import {
  renderMarkdown,
  htmlToMarkdown,
  normalizeMarkdown
} from './utils/markdown.js'
import { serializeEditorToMarkdown as serializeEditorRoot } from './utils/editorSerialize.js'
import {
  parseNoteContent,
  buildNoteContent,
  setProp,
  removeProp
} from './shared/noteMeta.js'
import { normalizeTag, isValidTag, matchTags, MAX_TAGS_PER_NOTE } from './shared/tags.js'
import { NOTE_COLOR_OPTIONS, readNoteColorChange, noteColorLabel } from './shared/noteColors.js'
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
  components: { WhiteboardEditor, ChatRoomEditor, KanbanBoardEditor, TagSidebar, GraphView, BacklinksPanel, SelectionLinksPanel, MarkdownToolbar, LinkDialog, AppIcon, DashboardNoteCard, RecycleScroller },
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
    const newUserForm = ref({ username: '', displayName: '', password: '', role: 'member', tagWhitelist: '' })
    const editingTagWhitelists = ref({})
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
    const HYBRID_SEARCH_KEY = 'local-keep-hybrid-search'
    const semanticSearchAvailable = ref(false)
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

    // Notes state. The index is the complete lightweight list; card bodies
    // live in a bounded on-demand cache so the dashboard can virtualize.
    const noteIndex = ref([])
    const noteDetails = reactive(new Map())
    const noteDetailRequests = new Set()
    const noteDetailsLoading = ref(0)
    const notesLoading = ref(false)
    const notesError = ref('')
    const openingNoteId = ref(null)
    const notesGridRef = ref(null)
    const notesScrollerRef = ref(null)
    const dashboardWidth = ref(1200)
    const NOTE_DETAIL_BATCH = 30
    const NOTE_DETAIL_CACHE_TARGET = 120
    const NOTE_ROW_HEIGHT = 396
    const NOTE_RENDER_BUFFER = 800
    const noteRowHeight = NOTE_ROW_HEIGHT
    const noteRenderBuffer = NOTE_RENDER_BUFFER
    let dashboardResizeObserver = null
    let lastVirtualRange = { start: 0, end: 0 }
    let noteCacheGeneration = 0
    let editingOriginalTitle = ''
    let editingOriginalContent = ''
    const notePresence = ref({})
    const newNoteTitle = ref('')
    const newNoteContent = ref('')
    // The properties section (the fence) is edited through the properties panel
    // and never lives in the body editor's text.
    const noteProps = ref([])
    // Collapsed by default: the panel is metadata chrome, not the note itself.
    const propsOpen = ref(false)
    const tagDraft = ref('')
    const propKeyDraft = ref('')
    // Tag autocomplete: suggestions come from the known tag tree while typing.
    const tagSuggestOpen = ref(false)
    const tagSuggestIndex = ref(-1)
    /** Tags as a plain list from the `tags` property. */
    const noteTagList = computed(() => {
      const value = noteProps.value.find(e => e && !e.blank && e.key === 'tags')?.value
      return Array.isArray(value) ? value : []
    })

    /** Aliases joined for the single-line field. */
    const aliasDraft = computed(() => {
      const value = noteProps.value.find(e => e && !e.blank && e.key === 'aliases')?.value
      return Array.isArray(value) ? value.join(', ') : ''
    })

    /** Free-form keys the app does not own. */
    const userPropEntries = computed(() =>
      noteProps.value.filter(e => e && !e.blank && !['tags', 'aliases'].includes(e.key))
    )

    /** One-line preview shown on the collapsed Properties header. */
    const propsSummary = computed(() => {
      const parts = []
      if (noteTagList.value.length) {
        parts.push(`#${noteTagList.value[0]}${noteTagList.value.length > 1 ? ` +${noteTagList.value.length - 1}` : ''}`)
      }
      const aliases = aliasDraft.value
      if (aliases) parts.push(`alias ${aliases.split(',')[0].trim()}`)
      if (userPropEntries.value.length) parts.push(`${userPropEntries.value.length} prop`)
      return parts.join(' · ')
    })

    /** Clear every editor-local property draft so a new note starts empty. */
    function resetNoteProps() {
      noteProps.value = []
      tagDraft.value = ''
      propKeyDraft.value = ''
      tagSuggestOpen.value = false
      tagSuggestIndex.value = -1
    }

    function addTagProp(raw) {
      const tag = normalizeTag(raw)
      tagDraft.value = ''
      if (!tag || !isValidTag(tag)) return
      const current = noteTagList.value
      if (current.includes(tag) || current.length >= MAX_TAGS_PER_NOTE) return
      noteProps.value = setProp(noteProps.value, 'tags', [...current, tag])
    }

    function removeTagProp(tag) {
      noteProps.value = setProp(
        noteProps.value,
        'tags',
        noteTagList.value.filter(item => item !== tag)
      )
    }

    function setAliasProp(raw) {
      const aliases = String(raw || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
      noteProps.value = aliases.length
        ? setProp(noteProps.value, 'aliases', aliases)
        : removeProp(noteProps.value, 'aliases')
    }

    function setUserProp(key, value) {
      noteProps.value = setProp(noteProps.value, key, value)
    }

    function removePropKey(key) {
      noteProps.value = removeProp(noteProps.value, key)
      scheduleTagsRefresh()
    }

    function addPropKey() {
      const key = propKeyDraft.value.trim()
      propKeyDraft.value = ''
      if (!key || /[\n\r:]/.test(key)) return
      if (noteProps.value.some(e => e && !e.blank && e.key === key)) return
      noteProps.value = setProp(noteProps.value, key, '')
    }

    // Enter adds the property key, but only when no IME owns the keystroke.
    function onPropKeyEnter(event) {
      runUnlessIme(event, addPropKey)
    }

    /**
     * Operable tag tree: rename/move/delete a subtree. Each is an exact-path
     * rewrite across every affected note's tags property, so it creates one
     * `source: 'property'` revision per note (batched in history by message).
     */
    async function runTagOp({ from, to }) {
      try {
        const result = to === null
          ? await api(`/api/tags?path=${encodeURIComponent(from)}`, { method: 'DELETE' })
          : await api('/api/tags', {
              method: 'PATCH',
              body: JSON.stringify({ from, to })
            })
        await loadNotes()
        await loadTags()
        const changed = result?.changed?.length ?? 0
        const skipped = result?.skipped?.length ?? 0
        showRevisionNotice(
          `${to === null ? 'Deleted' : 'Rewrote'} #${from} on ${changed} note(s)` +
          (skipped ? `; ${skipped} archived note(s) skipped.` : '.')
        )
      } catch (e) {
        showRevisionNotice(e.message || 'Tag operation failed')
        throw e
      }
    }

    /** Tint is head metadata (the folder icon), never a fence property. */
    const editingColorMenuOpen = ref(false)
    // Local override so the tint applies the moment it is picked, before the
    // round-trip resolves (and for notes that do not exist yet).
    const pendingColor = ref(undefined)
    const editingColor = computed(() => {
      if (pendingColor.value !== undefined) return pendingColor.value
      const note = editingId.value
        ? noteIndex.value.find(item => item.id === editingId.value)
        : null
      return note?.color ?? null
    })

    function toggleEditingColorMenu() {
      editingColorMenuOpen.value = !editingColorMenuOpen.value
    }

    async function setEditingColor(value) {
      const next = value || null
      pendingColor.value = next
      if (!editingId.value) return
      try {
        const updated = await api(`/api/notes/${editingId.value}/color`, {
          method: 'PUT',
          body: JSON.stringify({ color: next })
        })
        patchNote(editingId.value, updated)
        pendingColor.value = undefined
      } catch (e) {
        pendingColor.value = undefined
        showRevisionNotice(e.message || 'Could not set the note colour')
      }
    }
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
    // Source (plain markdown) is the default editing surface. Visual remains
    // one toggle away in the bottom-left mode switch.
    const DEFAULT_EDITOR_MODE = 'plain'
    const editorMode = ref(DEFAULT_EDITOR_MODE) // 'write' (Visual) | 'plain' (Source)
    const PASTE_MODE_KEY = 'local-keep-paste-mode'
    const storedPasteMode = (() => {
      try {
        return localStorage.getItem(PASTE_MODE_KEY) === 'rich' ? 'rich' : 'plain'
      } catch (_) {
        return 'plain'
      }
    })()
    const pasteMode = ref(storedPasteMode) // 'plain' (text/plain only) | 'rich' (convert text/html)
    watch(pasteMode, value => {
      try { localStorage.setItem(PASTE_MODE_KEY, value) } catch (_) { /* private mode */ }
    })
    const shortcutsVisible = ref(false)
    const shortcut = (id) => shortcutLabel(SHORTCUTS[id], modKey)
    const linkDialogOpen = ref(false)
    const linkDialogMode = ref('link')
    const linkDialogInitialText = ref('')
    let linkDialogSelection = null
    let editorDirty = false
    const revisionNotice = ref('')
    let revisionNoticeTimer = null

    /**
     * Centralised live regions.
     *
     * The page keeps exactly one polite region and one assertive region so
     * announcements stay consistent. `notify()` clears the region before
     * writing to it: a live region only fires when its content changes, so
     * without the clear a repeated message would stay silent.
     */
    const livePolite = ref('')
    const liveAssertive = ref('')
    let liveTimer = null

    const notify = (message, level = 'polite') => {
      if (!message) return
      const target = level === 'assertive' ? liveAssertive : livePolite
      target.value = ''
      if (liveTimer) clearTimeout(liveTimer)
      liveTimer = setTimeout(() => { target.value = message }, 60)
    }
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
    let sortBeforeSearch = 'updatedAt'
    const selectedNoteIds = ref(new Set())
    const openColorNoteId = ref(null)
    const dashboardTab = ref('notes') // 'notes' | 'archived' | 'drafts'
    const drafts = ref([])
    const draftsLoading = ref(false)
    const draftsError = ref('')

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
    const selectionLinksOpen = ref(false)
    const selectionLinksLoading = ref(false)
    const selectionLinksError = ref('')
    const selectionLinksMode = ref('both')
    const selectionLinksData = ref({ noteIds: [], outgoing: [], incoming: [] })
    const selectedNoteIdList = computed(() => Array.from(selectedNoteIds.value))
    const mcpSettingsOpen = ref(false)
    const mcpTokens = ref([])
    const mcpTokenName = ref('')
    const mcpTokenScopes = ref('read,write')
    const mcpTokenExpiresDays = ref(null)
    const mcpNewToken = ref('')
    const mcpTokenError = ref('')
    const mcpTokenLoading = ref(false)
    const mcpLimits = ref({ maxWriteSessions: 5, maxReadSessions: 8, updatedAt: null })
    const mcpLimitsForm = ref({ maxWriteSessions: 5, maxReadSessions: 8 })
    const mcpLimitsLoading = ref(false)
    const mcpLimitsSaving = ref(false)
    const mcpLimitsError = ref('')
    const mcpLimitsNotice = ref('')
    const mcpEndpoint = computed(() => `${window.location.origin}/mcp`)

    // Interface configuration (config.json defaults + runtime DB overrides)
    const uiConfig = ref({ ...DEFAULT_UI_CONFIG })
    const uiSettingsOpen = ref(false)
    const uiSettings = ref({
      defaults: { ...DEFAULT_UI_CONFIG },
      overrides: {},
      ui: { ...DEFAULT_UI_CONFIG },
      filePath: null,
      fileError: null
    })
    const uiSettingsForm = ref({ ...DEFAULT_UI_CONFIG })
    const uiSettingsLoading = ref(false)
    const uiSettingsSaving = ref(false)
    const uiSettingsError = ref('')
    const uiSettingsNotice = ref('')

    // ── Native overlay plumbing ──────────────────────────────────────────
    // Every blocking overlay is a native <dialog> opened with showModal(),
    // so the platform provides focus containment, background inertness, the
    // top layer, Esc dismissal, and focus return. The stack records which
    // overlay is on top, because DOM order no longer describes stacking.
    const overlayStack = createOverlayStack()
    const mcpSettingsDialog = ref(null)
    const accountSettingsDialog = ref(null)
    const uiSettingsDialog = ref(null)
    const usersDialog = ref(null)
    const embeddingSettingsDialog = ref(null)
    const noteEditorDialog = ref(null)
    const historyDialog = ref(null)
    const unsavedChangesDialog = ref(null)
    const confirmDialog = ref(null)

    const mcpSettingsController = createDialogController({
      open: mcpSettingsOpen, element: mcpSettingsDialog, stack: overlayStack
    })
    const accountSettingsController = createDialogController({
      open: accountSettingsOpen, element: accountSettingsDialog, stack: overlayStack
    })
    const uiSettingsController = createDialogController({
      open: uiSettingsOpen, element: uiSettingsDialog, stack: overlayStack
    })
    const usersController = createDialogController({
      open: usersOpen, element: usersDialog, stack: overlayStack
    })
    const embeddingSettingsController = createDialogController({
      open: embeddingSettingsOpen, element: embeddingSettingsDialog, stack: overlayStack
    })
    const noteEditorController = createDialogController({
      open: isModalOpen, element: noteEditorDialog, stack: overlayStack
    })
    const historyController = createDialogController({
      open: historyOpen, element: historyDialog, stack: overlayStack
    })
    const unsavedChangesController = createDialogController({
      open: isUnsavedChangesOpen, element: unsavedChangesDialog, stack: overlayStack
    })
    const confirmController = createDialogController({
      open: isConfirmOpen, element: confirmDialog, stack: overlayStack
    })

    let removeLightDismiss = null

    const uiStyleVars = computed(() => ({
      '--note-modal-width': `${uiConfig.value.noteModalWidth}px`,
      '--note-modal-height': `${uiConfig.value.noteModalHeight}px`,
      '--link-dialog-width': `${uiConfig.value.linkDialogWidth}px`,
      '--graph-width': `${uiConfig.value.graphWidth}px`,
      '--graph-height': `${uiConfig.value.graphHeight}px`,
      '--links-panel-width': `${uiConfig.value.linksPanelWidth}px`,
      '--links-panel-height': `${uiConfig.value.linksPanelHeight}px`
    }))

    // Search state
    const searchOpen = ref(false)
    const searchQuery = ref('')
    const searchResults = ref(null)
    const searchMode = ref('keyword') // 'keyword' | 'hybrid'
    const searchLoading = ref(false)
    let searchTimer = null
    let searchSeq = 0

    // Canvas / Whiteboard state
    const currentView = ref('list') // 'list' | 'canvas' | 'chat' | 'kanban'
    const editingCanvasId = ref(null)
    const editingCanvasData = ref(null)
    const editingCanvasTitle = ref('')
    const editingCanvasColor = ref(null)
    const editingCanvasTags = ref([])
    const editingCanvasRevisionNo = ref(1)

    // Chat room state
    const editingChatId = ref(null)
    const editingChatTitle = ref('')
    const editingChatColor = ref(null)
    const editingChatTags = ref([])
    const editingChatRevisionNo = ref(1)
    const editingChatContent = ref('')

    // Kanban board state
    const editingKanbanId = ref(null)
    const editingKanbanTitle = ref('')
    const editingKanbanColor = ref(null)
    const editingKanbanTags = ref([])
    const editingKanbanRevisionNo = ref(1)
    const editingKanbanContent = ref('')

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
            if (data.type === 'config' && data.config?.ui) {
              uiConfig.value = { ...DEFAULT_UI_CONFIG, ...data.config.ui }
              return
            }
            if (data.type === 'note-color' && data.noteId) {
              patchNote(data.noteId, { color: data.color || null })
              return
            }
            if (data.type === 'text-discarded' && data.noteId) {
              scheduleDraftsRefresh()
              return
            }
            if (data.type === 'notes' && Array.isArray(data.notes)) {
              console.log(`[${now}] 📨 Updating note index, count: ${data.notes.length}`)
              const incoming = data.notes.map(toNoteIndexEntry)
              // Only update notes if the editor modal is not open
              if (!isModalOpen.value) {
                applyNoteIndex(incoming)
                pendingNotes.value = null
                scheduleTagsRefresh()
                scheduleVisibleHydration()
              } else {
                console.log(`[${now}] 📨 Skipping - modal open. Buffering update.`)
                pendingNotes.value = incoming
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
              const isTitle = data.source === 'title'
              if (!isRecentLocal && !isCheckpoint && !isTitle) {
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
    function toNoteIndexEntry(note) {
      return {
        id: note.id,
        title: note.title || '',
        displayTitle: note.displayTitle || getDisplayTitle(note),
        type: note.type || 'text',
        revisionId: note.revisionId || note.headRevisionId || note.head_revision_id || null,
        revisionNo: note.revisionNo || note.revision_no || 1,
        archivedAt: note.archivedAt || note.archived_at || null,
        createdAt: note.createdAt || note.created_at,
        updatedAt: note.updatedAt || note.updated_at,
        color: note.color || null,
        tags: Array.isArray(note.tags) ? note.tags : [],
        linkCount: note.linkCount || 0,
        backlinkCount: note.backlinkCount || 0
      }
    }

    function applyNoteIndex(incoming = []) {
      const previous = new Map(noteIndex.value.map(note => [note.id, note]))
      const nextIds = new Set(incoming.map(note => note.id))
      for (const entry of incoming) {
        const prior = previous.get(entry.id)
        if (!prior ||
            prior.revisionNo !== entry.revisionNo ||
            prior.updatedAt !== entry.updatedAt ||
            prior.title !== entry.title ||
            prior.archivedAt !== entry.archivedAt) {
          noteDetails.delete(entry.id)
        }
      }
      for (const id of [...noteDetails.keys()]) {
        if (!nextIds.has(id)) noteDetails.delete(id)
      }
      noteIndex.value = incoming
    }

    function patchNote(id, patch = {}) {
      if (!id) return
      const indexKeys = [
        'title', 'displayTitle', 'type', 'revisionId', 'revisionNo',
        'archivedAt', 'createdAt', 'updatedAt', 'color', 'tags',
        'linkCount', 'backlinkCount'
      ]
      noteIndex.value = noteIndex.value.map(note => {
        if (note.id !== id) return note
        const next = { ...note }
        for (const key of indexKeys) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key]
        }
        if (!Object.prototype.hasOwnProperty.call(patch, 'displayTitle')) {
          if (Object.prototype.hasOwnProperty.call(patch, 'content') && !next.title) {
            next.displayTitle = getDisplayTitle({ title: '', content: patch.content })
          } else if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
            next.displayTitle = patch.title || note.displayTitle
          }
        }
        return next
      })
      const detail = noteDetails.get(id)
      if (detail) {
        const nextDetail = { ...detail, ...patch }
        if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
          nextDetail.contentTruncated = false
        }
        noteDetails.set(id, nextDetail)
      }
    }

    function upsertNote(note) {
      if (!note?.id) return
      const entry = toNoteIndexEntry(note)
      const existing = noteIndex.value.some(item => item.id === entry.id)
      noteIndex.value = existing
        ? noteIndex.value.map(item => item.id === entry.id ? { ...item, ...entry } : item)
        : [entry, ...noteIndex.value]
      if (Object.prototype.hasOwnProperty.call(note, 'content') ||
          Object.prototype.hasOwnProperty.call(note, 'canvasData')) {
        noteDetails.set(note.id, { ...note, ...entry })
      }
    }

    function noteIdsInRange(start, end) {
      const items = dashboardNotes.value
      const ids = []
      if (!items.length) return ids
      const from = Math.max(0, Math.min(items.length - 1, start))
      const to = Math.max(from, Math.min(items.length - 1, end))
      for (let index = from; index <= to; index += 1) {
        const item = items[index]
        if (!item?.isQuickShortcuts && !item?.isDraft) ids.push(item.id)
      }
      return ids
    }

    function detailKeepIds(start, end) {
      const keep = new Set()
      const windowRange = detailWindowRange(start, end, dashboardNotes.value.length, {
        pageSize: NOTE_DETAIL_BATCH,
        pages: 1
      })
      if (windowRange) {
        for (const id of noteIdsInRange(windowRange.start, windowRange.end)) keep.add(id)
      }
      if (editingId.value) keep.add(editingId.value)
      if (editingCanvasId.value) keep.add(editingCanvasId.value)
      return keep
    }

    function evictNoteDetails(start, end) {
      const keep = detailKeepIds(start, end)
      for (const id of [...noteDetails.keys()]) {
        if (!keep.has(id)) noteDetails.delete(id)
      }
      if (noteDetails.size <= NOTE_DETAIL_CACHE_TARGET) return
      for (const id of [...noteDetails.keys()]) {
        if (noteDetails.size <= NOTE_DETAIL_CACHE_TARGET) break
        if (keep.has(id)) continue
        noteDetails.delete(id)
      }
    }

    async function fetchDetailBatch(ids) {
      if (!ids.length) return
      const generation = noteCacheGeneration
      ids.forEach(id => noteDetailRequests.add(id))
      noteDetailsLoading.value += ids.length
      try {
        const rows = await api('/api/notes/window', {
          method: 'POST',
          body: JSON.stringify({ ids })
        })
        if (generation !== noteCacheGeneration) return
        for (const row of rows) {
          if (!row?.id) continue
          const summary = noteIndex.value.find(note => note.id === row.id)
          if (!summary) continue
          if (summary.revisionNo && row.revisionNo &&
              summary.revisionNo !== row.revisionNo) continue
          noteDetails.set(row.id, row)
        }
      } catch (e) {
        console.error('Failed to load note cards', e)
      } finally {
        ids.forEach(id => noteDetailRequests.delete(id))
        noteDetailsLoading.value = Math.max(0, noteDetailsLoading.value - ids.length)
      }
    }

    function hydrateDetailRange(start, end) {
      if (!dashboardNotes.value.length) return
      evictNoteDetails(start, end)
      const padded = detailWindowRange(start, end, dashboardNotes.value.length, {
        pageSize: NOTE_DETAIL_BATCH,
        pages: 1
      }) || { start, end }
      const ids = noteIdsInRange(padded.start, padded.end)
      const missing = ids.filter(id => !noteDetails.has(id) && !noteDetailRequests.has(id))
      for (let index = 0; index < missing.length; index += NOTE_DETAIL_BATCH) {
        fetchDetailBatch(missing.slice(index, index + NOTE_DETAIL_BATCH))
      }
    }

    function hydrateVisibleDetails() {
      const range = virtualItemRange(
        lastVirtualRange.start,
        lastVirtualRange.end,
        noteColumnCount.value,
        dashboardNotes.value.length
      )
      if (range) hydrateDetailRange(range.start, range.end)
    }

    function scheduleVisibleHydration() {
      nextTick(() => {
        hydrateVisibleDetails()
      })
    }

    function onVirtualUpdate(startRow, endRow, visibleStartRow, visibleEndRow) {
      lastVirtualRange = {
        start: Number.isFinite(visibleStartRow) && visibleStartRow >= 0 ? visibleStartRow : startRow,
        end: Number.isFinite(visibleEndRow) && visibleEndRow >= 0 ? visibleEndRow : endRow
      }
      hydrateVisibleDetails()
    }

    function observeDashboardWidth() {
      if (typeof ResizeObserver === 'undefined' || !notesGridRef.value) return
      dashboardResizeObserver?.disconnect()
      dashboardWidth.value = notesGridRef.value.getBoundingClientRect().width || dashboardWidth.value
      dashboardResizeObserver = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect?.width
        if (width) dashboardWidth.value = width
      })
      dashboardResizeObserver.observe(notesGridRef.value)
    }

    function scrollDashboardToTop() {
      // Keep the RecycleScroller's own bookkeeping in sync, then scroll the
      // page directly. `page-mode` scrolls the window, and relying only on
      // scrollToPosition can leave the viewport in the middle of a shorter
      // search result list.
      notesScrollerRef.value?.scrollToPosition?.(0)
      const grid = notesGridRef.value
      if (!grid) {
        window.scrollTo({ top: 0, behavior: 'auto' })
        return
      }
      const header = document.querySelector('header')
      const stickyBar = grid.previousElementSibling
      const headerHeight = header?.getBoundingClientRect().height || 0
      const barHeight = stickyBar?.getBoundingClientRect().height || 0
      const gridTop = window.scrollY + grid.getBoundingClientRect().top
      window.scrollTo({
        top: Math.max(0, gridTop - headerHeight - barHeight),
        behavior: 'auto'
      })
    }

    async function ensureNoteDetail(id, { full = false } = {}) {
      const summary = noteIndex.value.find(note => note.id === id)
      if (!summary) return null
      const cached = noteDetails.get(id)
      const sameRevision = !cached ||
        !cached.revisionNo ||
        !summary.revisionNo ||
        cached.revisionNo === summary.revisionNo
      const complete = cached &&
        Object.prototype.hasOwnProperty.call(cached, 'content') &&
        !cached.contentTruncated &&
        (summary.type !== 'canvas' || Object.prototype.hasOwnProperty.call(cached, 'canvasData'))
      if (!full && complete && sameRevision) return { ...cached, ...summary }

      const note = await api(`/api/notes/${id}`)
      noteDetails.set(id, note)
      return { ...summary, ...note }
    }

    async function openNoteById(id, options = {}) {
      if (!id) return false
      const summary = noteIndex.value.find(note => note.id === id)
      if (!summary) {
        showRevisionNotice(options.notFound || 'Note not found')
        return false
      }
      if (summary.archivedAt) {
        showRevisionNotice(options.archived || 'This note is archived. Restore it to open.', { assertive: true })
        return false
      }
      if (editingId.value === id && isModalOpen.value) return true
      if (options.confirm && isModalOpen.value && hasUnsavedChanges() &&
          !window.confirm(options.confirm)) return false
      if (openingNoteId.value === id) return false
      openingNoteId.value = id
      try {
        const note = await ensureNoteDetail(id, { full: options.full })
        if (!note) {
          showRevisionNotice(options.notFound || 'Note not found', { assertive: true })
          return false
        }
        if (isModalOpen.value) {
          discardSharedDraftIfAlone()
          closeModal(true)
        }
        await nextTick()
        if (note.type === 'canvas') openCanvasNote(note)
        else if (note.type === 'chat') openChatNote(note)
        else if (note.type === 'kanban') openKanbanNote(note)
        else startEditing(note)
        return true
      } catch (e) {
        showRevisionNotice(e.message || 'Failed to open note', { assertive: true })
        return false
      } finally {
        openingNoteId.value = null
      }
    }

    const loadNotes = async () => {
      notesLoading.value = true
      notesError.value = ''
      try {
        // The index keeps every note's identity, tags, dates, and links so
        // filters/link resolution stay complete without loading every body.
        const incoming = await api('/api/notes/index?includeArchived=1')
        noteCacheGeneration += 1
        noteDetailRequests.clear()
        noteDetailsLoading.value = 0
        applyNoteIndex(incoming.map(toNoteIndexEntry))
        noteDetails.clear()
        await nextTick()
        observeDashboardWidth()
        hydrateVisibleDetails()
        if (!noteDetails.size && !noteDetailRequests.size) {
          hydrateDetailRange(0, Math.min(NOTE_DETAIL_BATCH - 1, dashboardNotes.value.length - 1))
        }
        await loadTags()
        await loadDrafts()
      } catch (e) {
        notesError.value = e.message || 'Failed to load notes'
        console.error('Failed to load notes', e)
      } finally {
        notesLoading.value = false
      }
    }

    const loadUiConfig = async () => {
      try {
        const data = await api('/api/config')
        if (data?.ui) uiConfig.value = { ...DEFAULT_UI_CONFIG, ...data.ui }
        const available = !!data?.search?.semanticEnabled
        semanticSearchAvailable.value = available
        if (!available) {
          semanticSearchEnabled.value = false
        } else {
          let stored = null
          try { stored = localStorage.getItem(HYBRID_SEARCH_KEY) } catch (_) { /* private mode */ }
          semanticSearchEnabled.value = stored === null ? true : stored === '1'
        }
      } catch (e) {
        console.error('Failed to load UI config', e)
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

    // ── Tag autocomplete ──
    /** Every tag path known to the active tree (parents included). */
    const knownTags = computed(() => {
      const out = []
      const seen = new Set()
      const walk = (nodes) => {
        for (const node of nodes || []) {
          if (node?.tag && !seen.has(node.tag)) {
            seen.add(node.tag)
            out.push(node.tag)
          }
          walk(node?.children)
        }
      }
      walk(tagsTree.value?.tags)
      // Include the note's own tags even if the tree has not refreshed yet.
      for (const tag of noteTagList.value) {
        if (!seen.has(tag)) {
          seen.add(tag)
          out.push(tag)
        }
      }
      return out
    })

    const tagSuggestions = computed(() => {
      const query = tagDraft.value.trim()
      if (!query) return []
      return matchTags(query, knownTags.value, {
        exclude: noteTagList.value,
        limit: 8
      })
    })

    /**
     * `aria-activedescendant` for the tag combobox. It points at the
     * highlighted suggestion's option id, but only while the list is open:
     * the list is removed from the DOM when it closes, and a reference to a
     * missing id is invalid.
     */
    const tagActiveDescendant = computed(() => {
      if (!tagSuggestOpen.value) return undefined
      const list = tagSuggestions.value
      const index = tagSuggestIndex.value
      if (!list.length || index < 0 || index >= list.length) return undefined
      return `tag-suggestion-${index}`
    })

    watch(tagDraft, () => {
      tagSuggestIndex.value = -1
    })

    function pickTagSuggestion(tag) {
      addTagProp(tag)
      tagSuggestOpen.value = true
    }

    function commitTagDraft() {
      const list = tagSuggestions.value
      const index = tagSuggestIndex.value
      if (list.length && index >= 0 && index < list.length) {
        pickTagSuggestion(list[index])
        return
      }
      addTagProp(tagDraft.value)
    }

    // The tag input commits on Enter and on comma, and moves a suggestion
    // highlight with the arrow keys. While an IME is composing, those keys
    // belong to the IME, so the handlers stand down and leave the default
    // action alone (hence no `.prevent` modifier on the bindings).
    function onTagEnter(event) {
      runUnlessIme(event, commitTagDraft)
    }

    function onTagComma(event) {
      runUnlessIme(event, commitTagDraft)
    }

    function onTagArrow(event, delta) {
      runUnlessIme(event, () => moveTagSuggestion(delta))
    }

    function moveTagSuggestion(delta) {
      const list = tagSuggestions.value
      if (!list.length) return
      tagSuggestOpen.value = true
      if (tagSuggestIndex.value < 0) {
        tagSuggestIndex.value = delta > 0 ? 0 : list.length - 1
        return
      }
      tagSuggestIndex.value = (tagSuggestIndex.value + delta + list.length) % list.length
    }

    function onTagEscape(event) {
      // Escape cancels an IME candidate before it can close anything.
      if (isImeComposing(event)) return
      if (!tagSuggestOpen.value || !tagSuggestions.value.length) return
      event.preventDefault()
      event.stopPropagation()
      tagSuggestOpen.value = false
    }

    function onTagInputBlur() {
      tagSuggestOpen.value = false
      tagSuggestIndex.value = -1
      if (tagDraft.value.trim()) addTagProp(tagDraft.value)
    }

    const loadDrafts = async () => {
      draftsLoading.value = true
      try {
        drafts.value = await api('/api/drafts')
        draftsError.value = ''
      } catch (error) {
        draftsError.value = error.message || 'Failed to load drafts'
      } finally {
        draftsLoading.value = false
      }
    }

    let draftsRefreshTimer = null
    const scheduleDraftsRefresh = () => {
      if (draftsRefreshTimer) clearTimeout(draftsRefreshTimer)
      draftsRefreshTimer = setTimeout(() => {
        draftsRefreshTimer = null
        loadDrafts()
      }, 350)
    }

    const setDashboardTab = (tab) => {
      if (dashboardTab.value === tab) {
        if (tab === 'drafts') loadDrafts()
        return
      }
      dashboardTab.value = tab
      deselectAll()
      closeNoteColorPicker()
      if (tab === 'drafts') loadDrafts()
    }

    /**
     * ARIA tab pattern: arrow keys move between tabs and select them, and
     * Home/End jump to the ends. The tabs use a roving `tabindex`, so the
     * group is a single tab stop and focus follows the selection.
     */
    const DASHBOARD_TABS = ['notes', 'archived', 'drafts']

    function onTabKeydown(event, tab) {
      const index = DASHBOARD_TABS.indexOf(tab)
      if (index === -1) return
      let next = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = DASHBOARD_TABS[(index + 1) % DASHBOARD_TABS.length]
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = DASHBOARD_TABS[(index - 1 + DASHBOARD_TABS.length) % DASHBOARD_TABS.length]
      } else if (event.key === 'Home') {
        next = DASHBOARD_TABS[0]
      } else if (event.key === 'End') {
        next = DASHBOARD_TABS[DASHBOARD_TABS.length - 1]
      }
      if (!next) return
      event.preventDefault()
      setDashboardTab(next)
      nextTick(() => {
        const el = document.getElementById(`tab-${next}`)
        if (el) el.focus()
      })
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
        patchNote(note.id, restored)
        showRevisionNotice(`Restored ${getDisplayTitle(restored)}.`)
        loadTags()
      } catch (e) {
        showRevisionNotice(e.message || 'Restore failed')
      }
    }

    function shortcutElementVisible(el) {      if (!el || el.disabled) return false
      const style = window.getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none' && el.getClientRects().length > 0
    }

    function shortcutRoot() {
      // The top layer does not follow DOM order, so the overlay stack is the
      // source of truth for which overlay is on top. Popovers (menus and
      // palettes) do not block the page and are not part of the stack.
      return overlayStack.top() || document
    }

    function activateShortcutFromDom(e) {
      if (e.defaultPrevented || isImeComposing(e) || e.repeat) return false
      const combo = eventShortcut(e, modKey)
      if (!combo) return false
      const active = document.activeElement
      const typing = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
      )
      if (typing && !(e.ctrlKey || e.metaKey || e.altKey)) return false
      const root = shortcutRoot()
      const candidates = [...root.querySelectorAll('button[data-shortcut]')]
        .filter(el => el.dataset.shortcut === combo &&
          !el.classList.contains('md-tool-btn') &&
          shortcutElementVisible(el))
      // Prefer the submit button of the form the user is typing in, so
      // Ctrl/Cmd+Enter saves the form that has focus when a modal has several.
      const focusedForm = active?.closest?.('form')
      const button = (focusedForm && candidates.find(el => focusedForm.contains(el))) || candidates[0]
      if (!button) return false
      e.preventDefault()
      e.stopPropagation()
      button.click()
      return true
    }

    // Global KeyDown handler for shortcuts
    const handleKeyDown = async (e) => {
      if (!isAuthenticated.value) return

      log('keydown: key=%s ctrl=%s meta=%s shift=%s alt=%s target=%s',
        e.key, e.ctrlKey, e.metaKey, e.shiftKey, e.altKey,
        document.activeElement?.tagName || 'none')

      // 0. Skip keyboard shortcuts when in canvas editor view
      if (currentView.value === 'canvas') return

      // Enter and Escape belong to the IME while a composition is active:
      // Enter confirms the current candidate, Escape cancels it. Acting on
      // them here would commit a half-composed value (the unsaved-changes
      // dialog saves the editor behind it) or close the surface the user is
      // still typing into. Modifier combinations are exempt — they do not
      // conflict with candidate confirmation.
      if (isImeComposing(e) &&
          (e.key === 'Enter' || e.key === 'Escape') &&
          !e.ctrlKey && !e.metaKey) {
        return
      }

      if (openColorNoteId.value && e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        // The colour palette is a popover, so the platform dismisses it.
        e.preventDefault()
        closeNoteColorPicker()
        return
      }

      // 1. The archive confirmation is a native dialog: the platform closes
      // it on Escape and returns focus to the invoker. A global Enter must
      // not confirm a destructive action — only the confirmation's own
      // control (or the shortcut bound to it) may archive the note.

      // 2. The unsaved-changes dialog is a native dialog too. Its Escape is
      // handled by its `cancel` event, which means "keep editing".
      if (isUnsavedChangesOpen.value) {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveAndClose()
          return
        }
      }

      // 3. Ctrl/Cmd+Shift+M cycles editor modes while the note modal is open
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm' &&
          isModalOpen.value && !linkDialogOpen.value) {
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

      // 5. Escape is handled by the platform for every native dialog: the
      // topmost one closes and returns focus to its invoker. The link dialog,
      // the note editor, the admin dialogs, the history, graph, backlinks and
      // selection-links panels are all native dialogs now.

      // 6. Search bar Escape handling. The search field is inline in the
      // header, not an overlay, so it still needs its own handler.
      if (searchOpen.value && e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        closeSearch()
        return
      }

      const activeEl = document.activeElement
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      )

      // Declarative button shortcuts. This runs before the global
      // Ctrl/Cmd+Enter create-note shortcut so a modal's Save button wins.
      if (activateShortcutFromDom(e)) return

      // Select All is only rendered after a selection exists, so its button
      // shortcut cannot start a selection. Handle the initial press here.
      if (shortcutRoot() === document &&
          dashboardTab.value === 'notes' &&
          !searchOpen.value &&
          !e.ctrlKey && !e.metaKey && !e.altKey &&
          !(activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) &&
          e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll()
        return
      }

      // Cmd/Ctrl + Enter: Open new note modal if closed
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        log('Cmd/Ctrl+Enter: modalOpen=%s confirmOpen=%s', isModalOpen.value, isConfirmOpen.value)
        if (!isModalOpen.value && !isConfirmOpen.value &&
            !searchOpen.value && shortcutRoot() === document) {
          e.preventDefault()
          openNewNoteModal()
        }
      }
    }

    function onShortcutRevealDown(e) {
      // Bare Alt only: reveal hints and preventDefault so the browser (e.g.
      // Chrome's menu-bar focus) does not act on the Alt press. Ctrl/Cmd+Alt
      // combos carry a real key and are never intercepted here.
      if (e.key === 'Alt' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        shortcutsVisible.value = true
      }
    }

    function onShortcutRevealUp(e) {
      if (e.key === 'Alt' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        shortcutsVisible.value = false
        return
      }
      if (!e.altKey) shortcutsVisible.value = false
    }

    function onShortcutRevealPointer(e) {
      // Some environments do not deliver a reliable Alt keydown; a pointer
      // event with Alt held should still reveal hints. Ctrl/Cmd alone must not.
      if (e.altKey) shortcutsVisible.value = true
    }

    function resetShortcutReveal() {
      shortcutsVisible.value = false
    }

    // Sticky dashboard chrome: measure the header so the control/selection bar
    // can pin directly beneath it at any viewport width or header state.
    const appHeader = ref(null)
    let appHeaderObserver = null

    function syncHeaderHeight() {
      const height = appHeader.value?.offsetHeight
      if (!height) return
      document.documentElement.style.setProperty('--app-header-height', `${height}px`)
    }

    watch(isAuthenticated, async (authenticated) => {
      appHeaderObserver?.disconnect()
      appHeaderObserver = null
      if (!authenticated) {
        document.documentElement.style.removeProperty('--app-header-height')
        dashboardResizeObserver?.disconnect()
        dashboardResizeObserver = null
        return
      }
      await nextTick()
      syncHeaderHeight()
      if (typeof ResizeObserver !== 'undefined' && appHeader.value) {
        appHeaderObserver = new ResizeObserver(syncHeaderHeight)
        appHeaderObserver.observe(appHeader.value)
      }
      observeDashboardWidth()
    })

    // Bootstrap auth: first-run setup, persisted cookie, or the login screen.
    onMounted(async () => {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('paste', handleWindowPaste)
      window.addEventListener('keydown', onShortcutRevealDown)
      window.addEventListener('keyup', onShortcutRevealUp)
      window.addEventListener('pointermove', onShortcutRevealPointer)
      window.addEventListener('pointerdown', onShortcutRevealPointer)
      window.addEventListener('blur', resetShortcutReveal)
      document.addEventListener('click', closeNoteColorPicker)
      // `closedby` is not supported everywhere, so the light-dismiss fallback
      // is installed for the dialogs that ask for it.
      removeLightDismiss = installLightDismiss(document)
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
            await loadUiConfig()
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
      window.removeEventListener('keydown', onShortcutRevealDown)
      window.removeEventListener('keyup', onShortcutRevealUp)
      window.removeEventListener('pointermove', onShortcutRevealPointer)
      window.removeEventListener('pointerdown', onShortcutRevealPointer)
      window.removeEventListener('blur', resetShortcutReveal)
      document.removeEventListener('click', closeNoteColorPicker)
      if (removeLightDismiss) removeLightDismiss()
      removeLightDismiss = null
      if (revisionNoticeTimer) clearTimeout(revisionNoticeTimer)
      if (tagsRefreshTimer) clearTimeout(tagsRefreshTimer)
      if (draftsRefreshTimer) clearTimeout(draftsRefreshTimer)
      appHeaderObserver?.disconnect()
      appHeaderObserver = null
      dashboardResizeObserver?.disconnect()
      dashboardResizeObserver = null
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
      await loadUiConfig()
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
      uiSettingsOpen.value = false
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
          await loadUiConfig()
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
      uiSettingsOpen.value = false
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
      editingTagWhitelists.value = {}
      newUserForm.value = { username: '', displayName: '', password: '', role: 'member', tagWhitelist: '' }
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
            tagWhitelist: newUserForm.value.tagWhitelist ? newUserForm.value.tagWhitelist.trim() : null,
            mustChangePassword: true
          })
        })
        newUserForm.value = { username: '', displayName: '', password: '', role: 'member', tagWhitelist: '' }
        await loadUsers()
      } catch (e) {
        usersError.value = e.message
      }
    }

    async function saveUserWhitelist(user) {
      try {
        const next = editingTagWhitelists.value[user.id]
        if (next === undefined) return
        usersError.value = ''
        await updateUser(user, { tagWhitelist: next.trim() })
        delete editingTagWhitelists.value[user.id]
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

    const fabNewChatRoom = () => {
      fabMenuOpen.value = false
      openNewChat()
    }

    const fabNewKanbanBoard = () => {
      fabMenuOpen.value = false
      openNewKanban()
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
            syncVisualEditor()
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

    function insertPlainTextAtCursor(text) {
      const value = String(text ?? '').replace(/\r\n?/g, '\n')
      if (!value) return

      if (editorMode.value === 'plain') {
        const textarea = markdownTextarea.value
        if (!textarea) {
          newNoteContent.value = `${newNoteContent.value}${value}`
          return
        }
        const start = textarea.selectionStart ?? newNoteContent.value.length
        const end = textarea.selectionEnd ?? start
        newNoteContent.value =
          newNoteContent.value.slice(0, start) +
          value +
          newNoteContent.value.slice(end)
        nextTick(() => {
          if (!markdownTextarea.value) return
          markdownTextarea.value.focus()
          const pos = start + value.length
          markdownTextarea.value.setSelectionRange(pos, pos)
        })
        return
      }

      const el = imageEditor.value
      if (!el) {
        newNoteContent.value = `${newNoteContent.value}${value}`
        return
      }

      const sel = window.getSelection()
      let range
      if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
        el.focus()
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      } else {
        range = sel.getRangeAt(0)
      }

      range.deleteContents()
      const node = document.createTextNode(value)
      range.insertNode(node)
      const after = document.createRange()
      after.setStart(node, node.nodeValue.length)
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)
      syncVisualEditor()
    }

    function insertMarkdownAsRich(markdown) {
      const el = imageEditor.value
      if (!el) {
        newNoteContent.value = normalizeMarkdown(`${newNoteContent.value}\n\n${markdown}`)
        return
      }
      el.focus()
      const sel = window.getSelection()
      let range
      if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      } else {
        range = sel.getRangeAt(0)
      }
      const html = renderMarkdown(markdown, { resolveLink: resolveWikiLink })
      const temp = document.createElement('div')
      temp.innerHTML = html
      const fragment = document.createDocumentFragment()
      while (temp.firstChild) fragment.appendChild(temp.firstChild)
      range.deleteContents()
      range.insertNode(fragment)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
      syncVisualEditor()
      renderMermaidBlocks(el).catch((error) => console.error('Mermaid render failed:', error))
    }

    const openNewNoteModal = () => {
      teardownTextCollab()
      isModalOpen.value = true
      propsOpen.value = false
      pendingColor.value = undefined
      editingId.value = null
      editingBaseRevisionId.value = null
      editingRevisionNo.value = 1
      editorMode.value = DEFAULT_EDITOR_MODE
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      newNoteTitle.value = ''
      newNoteContent.value = ''
      // A new note always starts with an empty properties section. Without
      // this reset the previous editor session's tags leaked into the new one.
      resetNoteProps()
      editingOriginalTitle = ''
      editingOriginalContent = ''
      modalSize.value = { width: null, height: null }
      // The dialog focuses its `autofocus` element (the title field), and the
      // browser returns focus to the invoker when it closes.
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
      let content = text.replace(/\r\n?/g, '\n')
      if (pasteMode.value === 'rich' && html.trim()) {
        const converted = htmlToMarkdown(html)
        if (converted.trim()) content = converted
      }
      if (!content.trim()) return
      if (pasteMode.value === 'rich') {
        content = (await normalizeDataUrlImages(content)).markdown
      }
      log('paste intercepted: mode=%s textLength=%d', pasteMode.value, content.length)
      teardownTextCollab()
      isModalOpen.value = true
      propsOpen.value = false
      pendingColor.value = undefined
      editingId.value = null
      editingBaseRevisionId.value = null
      editingRevisionNo.value = 1
      editorMode.value = DEFAULT_EDITOR_MODE
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      newNoteTitle.value = ''
      newNoteContent.value = content
      resetNoteProps()
      modalSize.value = { width: null, height: null }
      nextTick(() => {
        renderEditorContent()
      })
    }

    const hasUnsavedChanges = () => {
      if (editingId.value) {
        return newNoteTitle.value !== editingOriginalTitle ||
          newNoteContent.value !== editingOriginalContent
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
      editorMode.value = DEFAULT_EDITOR_MODE
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      linkDialogOpen.value = false
      linkDialogSelection = null
      linkDialogInitialText.value = ''
      historyData.value = null
      historyPreview.value = null
      historyError.value = ''
      newNoteTitle.value = ''
      newNoteContent.value = ''
      resetNoteProps()
      editingOriginalTitle = ''
      editingOriginalContent = ''
      if (pendingNotes.value) {
        applyNoteIndex(pendingNotes.value)
        pendingNotes.value = null
        scheduleVisibleHydration()
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
      scheduleDraftsRefresh()
    }

    const draftAndClose = () => {
      isUnsavedChangesOpen.value = false
      if (!editingId.value) {
        closeModal(true)
        return
      }
      const hadChanges = hasUnsavedChanges()
      // Title/content watchers already sync into the shared Yjs draft; closing
      // sends text-leave, which persists it. Do not discard it.
      closeModal(true)
      if (hadChanges) {
        scheduleDraftsRefresh()
        showRevisionNotice('Draft kept. Open it from the Drafts tab.')
      }
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

    /**
     * Escape in the unsaved-changes dialog means "keep editing", not "close".
     *
     * The dialog asks for `closedby="none"`, but Safari ignores that
     * attribute, so the guard lives in the `cancel` event as well: Esc fires
     * `cancel` there and then closes the dialog, and here it means "keep
     * editing". The handler does not prevent the default, because dismissing
     * the dialog is exactly what should happen.
     */
    const onUnsavedChangesCancel = () => {
      cancelDiscardChanges()
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
      // The inline size the resize writes also overrides `max-width`/`max-height`,
      // so the clamp has to be applied here or a dragged modal can grow past
      // the viewport and hang off the edge of the screen.
      const maxWidth = Math.max(340, Math.round(window.innerWidth * 0.94))
      const maxHeight = Math.max(280, Math.round(window.innerHeight * 0.92))
      modalSize.value = {
        width: Math.min(maxWidth, Math.max(340, resizeStartWidth + dx)),
        height: Math.min(maxHeight, Math.max(280, resizeStartHeight + dy))
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
        const full = await ensureNoteDetail(note.id)
        const source = full || note
        const textToCopy = source.title ? `${source.title}\n\n${source.content}` : source.content
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
        // Body only in the editor; the fence is re-attached from noteProps.
        const body = normalizeMarkdown(normalized.markdown)
        newNoteContent.value = body
        const content = buildNoteContent(noteProps.value, body)
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: newNoteTitle.value.trim(),
            content
          })
        })
        upsertNote(note)
        // A tint chosen before saving is applied now that the note exists.
        if (pendingColor.value !== undefined && pendingColor.value !== null) {
          try {
            const updated = await api(`/api/notes/${note.id}/color`, {
              method: 'PUT',
              body: JSON.stringify({ color: pendingColor.value })
            })
            patchNote(note.id, updated)
          } catch (_) { /* tint is cosmetic; never block the save */ }
        }
        pendingColor.value = undefined
        scheduleTagsRefresh()
        closeModal(true)
        if (dashboardTab.value === 'drafts') dashboardTab.value = 'notes'
        scheduleDraftsRefresh()
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
      if (selectionLinksOpen.value) closeSelectionLinks()
    }

    const handleCardClick = async (note) => {
      if (note.isQuickShortcuts) return
      if (selectedNoteIds.value.size > 0 && !note.isDraft) {
        toggleSelect(note.id)
        return
      }
      const summary = noteIndex.value.find(item => item.id === note.id)
      if (!summary) {
        await loadNotes()
        return
      }
      if (summary.archivedAt) {
        showRevisionNotice(note.isDraft
          ? 'This note is archived. Restore it to edit its draft.'
          : 'This note is archived. Restore it to edit.')
        if (note.isDraft) loadDrafts()
        return
      }
      await openNoteById(note.id)
    }

    const toggleNoteColorPicker = (noteId) => {
      openColorNoteId.value = openColorNoteId.value === noteId ? null : noteId
    }

    const closeNoteColorPicker = () => {
      openColorNoteId.value = null
    }

    // DashboardNoteCard emits a single { note, color } payload for this action.
    const setNoteColor = async (payload = {}) => {
      const change = readNoteColorChange(payload)
      if (!change) return
      const { noteId, color: next, previous } = change
      openColorNoteId.value = null
      if (next === previous) return
      patchNote(noteId, { color: next })
      try {
        const updated = await api(`/api/notes/${noteId}/color`, {
          method: 'PUT',
          body: JSON.stringify({ color: next })
        })
        patchNote(noteId, { color: updated.color || null })
      } catch (error) {
        patchNote(noteId, { color: previous })
        showRevisionNotice(error.message || 'Failed to change the note color')
      }
    }

    const startEditing = (note) => {
      teardownTextCollab()
      pendingNotes.value = null
      editingId.value = note.id
      editingBaseRevisionId.value = note.revisionId || null
      editingRevisionNo.value = note.revisionNo || 1
      editorMode.value = DEFAULT_EDITOR_MODE
      editorDirty = false
      historyOpen.value = false
      backlinksOpen.value = false
      backlinks.value = []
      historyData.value = null
      historyPreview.value = null
      historyError.value = ''
      newNoteTitle.value = note.title || ''
      // Body only: the fence is edited through the properties panel.
      const parsed = parseNoteContent(note.content || '')
      noteProps.value = parsed.entries
      tagDraft.value = ''
      propKeyDraft.value = ''
      tagSuggestOpen.value = false
      tagSuggestIndex.value = -1
      newNoteContent.value = parsed.body
      editingOriginalTitle = newNoteTitle.value
      editingOriginalContent = newNoteContent.value
      isModalOpen.value = true
      propsOpen.value = false
      pendingColor.value = undefined
      modalSize.value = { width: null, height: null }
      nextTick(() => {
        renderEditorContent()
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
          patchNote(note.id, {
            title: message.title ?? note.title,
            content: message.content ?? note.content,
            revisionId: message.baseRevisionId || note.revisionId,
            revisionNo: message.revisionNo || note.revisionNo,
            updatedAt: new Date().toISOString()
          })
          scheduleDraftsRefresh()
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
          if (!initial && document.activeElement === modalTitleInput.value) {
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

      // The editor surface was just rendered from canonical markdown (or the
      // textarea was updated), so it has no un-serialised DOM edits. Whether
      // the document differs from the head is separate unsaved-change state.
      editorDirty = false
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

    const showRevisionNotice = (message, options = {}) => {
      if (!message) return
      revisionNotice.value = message
      if (revisionNoticeTimer) clearTimeout(revisionNoticeTimer)
      revisionNoticeTimer = setTimeout(() => { revisionNotice.value = '' }, 7000)
      notify(message, options.assertive ? 'assertive' : 'polite')
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
        // Body only in the editor; the fence is re-attached from noteProps.
        const body = normalizeMarkdown(normalized.markdown)
        newNoteContent.value = body
        const content = buildNoteContent(noteProps.value, body)
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
        patchNote(editingId.value, updated)
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
        if (dashboardTab.value === 'drafts') dashboardTab.value = 'notes'
        scheduleDraftsRefresh()
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
      patchNote(result.id, result)
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

    const openGraphNode = async (id) => {
      if (!id || String(id).startsWith('unresolved:')) return
      graphOpen.value = false
      await openNoteById(id, {
        notFound: 'The selected graph node is no longer available.',
        archived: 'This note is archived. Restore it to open it.',
        confirm: 'Discard unsaved changes and open the graph node?'
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

    const openBacklinkSource = async (noteId) => {
      backlinksOpen.value = false
      await openNoteById(noteId, {
        notFound: 'The linking note is no longer available.',
        archived: 'The linking note is archived.',
        confirm: 'Discard unsaved changes and open the linking note?'
      })
    }

    const closeSelectionLinks = () => {
      selectionLinksOpen.value = false
      selectionLinksError.value = ''
    }

    const openSelectionLinks = async () => {
      const ids = Array.from(selectedNoteIds.value)
      if (ids.length === 0) return
      selectionLinksOpen.value = true
      selectionLinksLoading.value = true
      selectionLinksError.value = ''
      try {
        selectionLinksData.value = await api('/api/notes/links/summary', {
          method: 'POST',
          body: JSON.stringify({ ids, includeArchived: true })
        })
      } catch (e) {
        selectionLinksError.value = e.message || 'Failed to load selection links'
        selectionLinksData.value = { noteIds: ids, outgoing: [], incoming: [] }
      } finally {
        selectionLinksLoading.value = false
      }
    }

    const openSelectionLinkNote = async (noteId) => {
      selectionLinksOpen.value = false
      await openNoteById(noteId, {
        notFound: 'The related note is no longer available.',
        archived: 'This related note is archived. Restore it to open it.',
        confirm: 'Discard unsaved changes and open the related note?'
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

    const loadMcpLimits = async () => {
      mcpLimitsLoading.value = true
      mcpLimitsError.value = ''
      try {
        const data = await api('/api/mcp/settings')
        mcpLimits.value = data
        mcpLimitsForm.value = {
          maxWriteSessions: data.maxWriteSessions,
          maxReadSessions: data.maxReadSessions
        }
      } catch (e) {
        mcpLimitsError.value = e.message || 'Failed to load session limits'
      } finally {
        mcpLimitsLoading.value = false
      }
    }

    const saveMcpLimits = async () => {
      mcpLimitsSaving.value = true
      mcpLimitsError.value = ''
      mcpLimitsNotice.value = ''
      try {
        const data = await api('/api/mcp/settings', {
          method: 'PUT',
          body: JSON.stringify({
            maxWriteSessions: Number(mcpLimitsForm.value.maxWriteSessions),
            maxReadSessions: Number(mcpLimitsForm.value.maxReadSessions)
          })
        })
        mcpLimits.value = data
        mcpLimitsForm.value = {
          maxWriteSessions: data.maxWriteSessions,
          maxReadSessions: data.maxReadSessions
        }
        mcpLimitsNotice.value = 'Session limits saved.'
        setTimeout(() => { mcpLimitsNotice.value = '' }, 3000)
      } catch (e) {
        mcpLimitsError.value = e.message || 'Failed to save session limits'
      } finally {
        mcpLimitsSaving.value = false
      }
    }

    const openMcpSettings = async () => {
      accountMenuOpen.value = false
      mcpSettingsOpen.value = true
      mcpNewToken.value = ''
      mcpTokenName.value = ''
      mcpTokenScopes.value = 'read,write'
      mcpTokenExpiresDays.value = null
      mcpLimitsNotice.value = ''
      const loads = [loadMcpTokens()]
      if (isAdmin.value) loads.push(loadMcpLimits())
      await Promise.all(loads)
    }

    function applyUiSettings(data) {
      uiSettings.value = data
      const effective = { ...DEFAULT_UI_CONFIG, ...(data?.ui || {}) }
      uiConfig.value = effective
      uiSettingsForm.value = { ...effective }
    }

    const openUiSettings = async () => {
      accountMenuOpen.value = false
      uiSettingsOpen.value = true
      uiSettingsLoading.value = true
      uiSettingsError.value = ''
      uiSettingsNotice.value = ''
      try {
        applyUiSettings(await api('/api/admin/config'))
      } catch (e) {
        uiSettingsError.value = e.message || 'Failed to load interface settings'
      } finally {
        uiSettingsLoading.value = false
      }
    }

    const closeUiSettings = () => {
      if (uiSettingsSaving.value) return
      uiSettingsOpen.value = false
    }

    const saveUiSettings = async () => {
      uiSettingsSaving.value = true
      uiSettingsError.value = ''
      uiSettingsNotice.value = ''
      try {
        const ui = {}
        for (const field of UI_CONFIG_FIELDS) {
          ui[field.key] = Number(uiSettingsForm.value[field.key])
        }
        applyUiSettings(await api('/api/admin/config', {
          method: 'PUT',
          body: JSON.stringify({ ui })
        }))
        uiSettingsNotice.value = 'Interface settings saved and applied to all clients.'
        setTimeout(() => { uiSettingsNotice.value = '' }, 3500)
      } catch (e) {
        uiSettingsError.value = e.message || 'Failed to save interface settings'
      } finally {
        uiSettingsSaving.value = false
      }
    }

    const resetUiSettings = async () => {
      if (!window.confirm('Reset runtime interface settings to the config.json defaults?')) return
      uiSettingsSaving.value = true
      uiSettingsError.value = ''
      uiSettingsNotice.value = ''
      try {
        applyUiSettings(await api('/api/admin/config', { method: 'DELETE' }))
        uiSettingsNotice.value = 'Runtime overrides cleared; config.json defaults are active.'
        setTimeout(() => { uiSettingsNotice.value = '' }, 3500)
      } catch (e) {
        uiSettingsError.value = e.message || 'Failed to reset interface settings'
      } finally {
        uiSettingsSaving.value = false
      }
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
        await loadUiConfig()
        embeddingNotice.value = data.settings?.enabled
          ? 'Saved. Indexing is running in the background.'
          : 'Saved. Hybrid search is disabled.'
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
      if (!semanticSearchAvailable.value) {
        showRevisionNotice('Hybrid search is not configured. Ask an admin to enable an embedding model.')
        return
      }
      semanticSearchEnabled.value = !semanticSearchEnabled.value
      try { localStorage.setItem(HYBRID_SEARCH_KEY, semanticSearchEnabled.value ? '1' : '0') } catch (_) { /* private mode */ }
      if (searchQuery.value.trim()) onSearchInput()
    }

    function restoreSearchSort() {
      if (sortBy.value === 'relevance') {
        sortBy.value = sortBeforeSearch || 'updatedAt'
      }
    }

    function clearSearchState() {
      searchSeq += 1
      if (searchTimer) clearTimeout(searchTimer)
      searchResults.value = null
      searchMode.value = 'keyword'
      searchLoading.value = false
      restoreSearchSort()
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
      clearSearchState()
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
        clearSearchState()
        return
      }
      // The first query switches the list to relevance order; the user can
      // still pick another sort while the search is active.
      if (searchResults.value === null && sortBy.value !== 'relevance') {
        sortBeforeSearch = sortBy.value
        sortBy.value = 'relevance'
      }
      const seq = ++searchSeq
      searchTimer = setTimeout(async () => {
        searchLoading.value = true
        try {
          if (semanticSearchEnabled.value && semanticSearchAvailable.value) {
            const data = await api(`/api/search/hybrid?q=${encodeURIComponent(q)}&limit=50`)
            if (seq !== searchSeq) return
            searchResults.value = (data.results || []).map(result => result.note_id)
            searchMode.value = data.notice || !data.semantic_count ? 'keyword' : 'hybrid'
            if (data.notice) showRevisionNotice(data.notice)
          } else {
            const ids = await api(`/api/search?q=${encodeURIComponent(q)}`)
            if (seq !== searchSeq) return
            searchResults.value = ids
            searchMode.value = 'keyword'
          }
        } catch (e) {
          if (seq !== searchSeq) return
          if (semanticSearchEnabled.value) {
            semanticSearchEnabled.value = false
            showRevisionNotice(`Hybrid search unavailable: ${e.message}`)
            try {
              const ids = await api(`/api/search?q=${encodeURIComponent(q)}`)
              if (seq === searchSeq) {
                searchResults.value = ids
                searchMode.value = 'keyword'
              }
            } catch (_) {
              if (seq === searchSeq) searchResults.value = []
            }
          } else {
            searchResults.value = []
          }
        } finally {
          if (seq === searchSeq) searchLoading.value = false
        }
      }, 250)
    }

    const clearSearch = () => {
      searchQuery.value = ''
      clearSearchState()
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
        editingCanvasColor.value = null
        editingCanvasTags.value = []
        editingCanvasRevisionNo.value = 1
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
      editingCanvasColor.value = note.color || null
      editingCanvasTags.value = Array.isArray(note.tags) ? [...note.tags] : []
      editingCanvasRevisionNo.value = note.revisionNo || 1
      currentView.value = 'canvas'
    }

    const closeCanvasEditor = () => {
      currentView.value = 'list'
      editingCanvasId.value = null
      editingCanvasData.value = null
      editingCanvasTitle.value = ''
      editingCanvasColor.value = null
      editingCanvasTags.value = []
      editingCanvasRevisionNo.value = 1
      // If the canvas was masked because of an external deletion, drop it now.
      if (deletedMask.value) deletedMask.value = null
    }

    // Chat note methods
    const openNewChat = async () => {
      teardownTextCollab()
      try {
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: '',
            content: JSON.stringify({ messages: [] }),
            type: 'chat'
          })
        })
        editingChatId.value = note.id
        editingChatTitle.value = ''
        editingChatColor.value = null
        editingChatTags.value = []
        editingChatRevisionNo.value = 1
        editingChatContent.value = note.content || ''
        currentView.value = 'chat'
      } catch (e) {
        console.error('Failed to create chat room', e)
      }
    }

    const openChatNote = (note) => {
      teardownTextCollab()
      editingChatId.value = note.id
      editingChatTitle.value = note.title || ''
      editingChatColor.value = note.color || null
      editingChatTags.value = Array.isArray(note.tags) ? [...note.tags] : []
      editingChatRevisionNo.value = note.revisionNo || 1
      editingChatContent.value = note.content || ''
      currentView.value = 'chat'
    }

    const closeChatEditor = () => {
      currentView.value = 'list'
      editingChatId.value = null
      editingChatTitle.value = ''
      editingChatColor.value = null
      editingChatTags.value = []
      editingChatRevisionNo.value = 1
      editingChatContent.value = ''
      if (deletedMask.value) deletedMask.value = null
    }

    // Kanban note methods
    const openNewKanban = async () => {
      teardownTextCollab()
      try {
        const note = await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify({
            title: '',
            content: '',
            type: 'kanban'
          })
        })
        editingKanbanId.value = note.id
        editingKanbanTitle.value = ''
        editingKanbanColor.value = null
        editingKanbanTags.value = []
        editingKanbanRevisionNo.value = 1
        editingKanbanContent.value = note.content || ''
        currentView.value = 'kanban'
      } catch (e) {
        console.error('Failed to create kanban board', e)
      }
    }

    const openKanbanNote = (note) => {
      teardownTextCollab()
      editingKanbanId.value = note.id
      editingKanbanTitle.value = note.title || ''
      editingKanbanColor.value = note.color || null
      editingKanbanTags.value = Array.isArray(note.tags) ? [...note.tags] : []
      editingKanbanRevisionNo.value = note.revisionNo || 1
      editingKanbanContent.value = note.content || ''
      currentView.value = 'kanban'
    }

    const closeKanbanEditor = () => {
      currentView.value = 'list'
      editingKanbanId.value = null
      editingKanbanTitle.value = ''
      editingKanbanColor.value = null
      editingKanbanTags.value = []
      editingKanbanRevisionNo.value = 1
      editingKanbanContent.value = ''
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
      const isOpenChat = currentView.value === 'chat' && editingChatId.value === noteId
      const isOpenKanban = currentView.value === 'kanban' && editingKanbanId.value === noteId
      if (!isOpenTextNote && !isOpenCanvas && !isOpenChat && !isOpenKanban) return
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
          upsertNote(note)
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
          upsertNote(note)
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
    const filterDashboardNotes = (list) => {
      let filtered = list
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
      return filtered
    }

    const searchResultRank = computed(() => new Map(
      (searchResults.value || []).map((id, index) => [id, index])
    ))

    const sortDashboardNotes = (list) => {
      if (sortBy.value === 'relevance' && searchResultRank.value.size) {
        return orderBySearchResults(list, searchResults.value)
      }
      const field = sortBy.value === 'relevance' ? 'updatedAt' : sortBy.value
      return [...list].sort((a, b) => {
        let valA, valB
        if (field === 'title') {
          valA = (a.title || '').toLowerCase()
          valB = (b.title || '').toLowerCase()
        } else {
          valA = new Date(a[field])
          valB = new Date(b[field])
        }

        if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1
        if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1
        return 0
      })
    }

    const sortedNotes = computed(() => {
      const filtered = noteIndex.value.filter(note =>
        dashboardTab.value === 'archived' ? !!note.archivedAt : !note.archivedAt
      )
      return sortDashboardNotes(filterDashboardNotes(filtered))
    })

    const draftNotes = computed(() => drafts.value.map(draft => {
      const note = noteIndex.value.find(item => item.id === draft.noteId)
      const title = (draft.title || '').trim() || draft.headTitle || 'Untitled'
      return {
        id: draft.noteId,
        isDraft: true,
        type: draft.noteType || note?.type || 'text',
        title,
        displayTitle: title,
        content: draft.content || '',
        tags: note?.tags || [],
        color: note?.color || draft.color || null,
        createdAt: note?.createdAt || draft.updatedAt,
        updatedAt: draft.updatedAt,
        headTitle: draft.headTitle || '',
        baseRevisionId: draft.baseRevisionId || null
      }
    }))

    const sortedDrafts = computed(() => sortDashboardNotes(filterDashboardNotes(draftNotes.value)))
    const draftNoteIds = computed(() => new Set(drafts.value.map(draft => draft.noteId)))

    const notesTabCount = computed(() => noteIndex.value.filter(note => !note.archivedAt).length)
    const archivedTabCount = computed(() => noteIndex.value.filter(note => note.archivedAt).length)
    const visibleNoteCount = computed(() =>
      dashboardTab.value === 'drafts' ? sortedDrafts.value.length : sortedNotes.value.length
    )

    const visibleCountText = computed(() => {
      if (notesLoading.value && noteIndex.value.length === 0) return 'Loading notes…'
      if (dashboardTab.value === 'drafts') {
        if (draftsLoading.value) return 'Loading drafts…'
        return `${visibleNoteCount.value} ${visibleNoteCount.value === 1 ? 'draft' : 'drafts'}`
      }
      if (searchQuery.value.trim()) {
        if (searchLoading.value) return 'Searching…'
        const mode = searchMode.value === 'hybrid' && semanticSearchEnabled.value ? 'hybrid ' : ''
        return `${visibleNoteCount.value} ${mode}${visibleNoteCount.value === 1 ? 'result' : 'results'}`
      }
      if (dashboardTab.value === 'archived') return `${visibleNoteCount.value} archived`
      return `${visibleNoteCount.value} ${visibleNoteCount.value === 1 ? 'note' : 'notes'}`
    })

    // The shortcut card is a read-only virtual note so the grid uses one card
    // path for every tile. It is never part of the real note list, selection,
    // sorting, or editing sessions.
    const quickShortcutsNote = {
      id: '__quick_shortcuts__',
      isQuickShortcuts: true,
      type: 'text',
      title: 'Quick Shortcuts',
      tags: [],
      content: [
        'Hold `Alt` / `Option` to reveal shortcut hints.',
        '',
        `- \`${modKey} + Enter\` — Create note (closed)`,
        `- \`${modKey} + Enter\` — Save note (editing)`,
        `- \`${modKey} + V\` — Paste clipboard note`,
        '- `Esc` — Cancel edit / delete',
        `- \`${modKey} + I\` — Open search`,
        `- \`${modKey} + Shift + M\` — Cycle Visual / Source`,
        '- `R` — Refresh notes',
        '- `T` — Toggle tags',
        '- `1` / `2` / `3` — Notes / Archived / Drafts',
        '- `A` / `Shift + A` — Select all / clear selection',
        '- `Delete` — Archive selected notes',
        '- `N` — Open the create menu'
      ].join('\n')
    }

    const dashboardNotes = computed(() => {
      if (dashboardTab.value === 'drafts') return sortedDrafts.value
      if (dashboardTab.value === 'archived') return sortedNotes.value
      const filtered = notesLoading.value || !!notesError.value ||
        !!searchQuery.value.trim() || !!activeTag.value || untaggedOnly.value
      return filtered ? sortedNotes.value : [quickShortcutsNote, ...sortedNotes.value]
    })

    const noteColumnCount = computed(() => dashboardColumnCount(dashboardWidth.value))
    const virtualNoteRows = computed(() => chunkDashboardItems(dashboardNotes.value, noteColumnCount.value))
    const noteDetailFor = (entry) => {
      if (!entry || entry.isQuickShortcuts || entry.isDraft) return null
      return noteDetails.get(entry.id) || null
    }

    watch(currentView, async (view) => {
      if (view !== 'list') return
      await nextTick()
      observeDashboardWidth()
      scheduleVisibleHydration()
    })
    watch(noteColumnCount, async () => {
      await nextTick()
      scheduleVisibleHydration()
    })
    watch(() => dashboardNotes.value.length, () => scheduleVisibleHydration())
    watch(
      [dashboardTab, sortBy, sortOrder, activeTag, untaggedOnly, () => searchResults.value],
      async () => {
        await nextTick()
        scrollDashboardToTop()
        // The virtual scroller updates its spacers after the DOM patch; a
        // second frame keeps the reset reliable when the list shrinks.
        requestAnimationFrame(() => {
          scrollDashboardToTop()
          scheduleVisibleHydration()
        })
      }
    )

    const historyRevisionsNewest = computed(() => {
      if (!historyData.value?.revisions) return []
      return [...historyData.value.revisions].sort((a, b) => b.revisionNo - a.revisionNo)
    })

    // Old→new version chain (e.g. [1, 2, 3]) derived from the automatic
    // version links, for surfacing the note↔history link progression.
    const versionChain = computed(() => {
      const links = historyData.value?.versionLinks || []
      if (!links.length) return []
      const sorted = [...links].sort((a, b) => a.toRevisionNo - b.toRevisionNo)
      const chain = [sorted[0].fromRevisionNo]
      for (const l of sorted) chain.push(l.toRevisionNo)
      return chain
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
      let revisionNo = null
      if (target.startsWith('note:')) {
        let id = target.slice(5).trim()
        // Explicit version pin [[note:<id>@<rev>]] — resolve the pinned revision.
        const at = id.lastIndexOf('@')
        if (at > 0 && /^\d+$/.test(id.slice(at + 1).trim())) {
          revisionNo = Number(id.slice(at + 1).trim())
          id = id.slice(0, at).trim()
        }
        note = noteIndex.value.find(n => n.id === id) || null
      } else {
        const wanted = normalizeWikiTitle(target)
        const matches = noteIndex.value.filter((n) => {
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
        label: label || target,
        revisionNo
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
      if (editingId.value === id && isModalOpen.value) return
      openNoteById(id, {
        notFound: `Linked note not found: ${label}`,
        archived: 'The linked note is archived. Restore it to open it.',
        confirm: 'Discard unsaved changes and open the linked note?'
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

      // Native overlay plumbing
      overlayStack,
      mcpSettingsDialog,
      accountSettingsDialog,
      uiSettingsDialog,
      usersDialog,
      embeddingSettingsDialog,
      noteEditorDialog,
      historyDialog,
      unsavedChangesDialog,
      confirmDialog,
      mcpSettingsController,
      accountSettingsController,
      uiSettingsController,
      usersController,
      embeddingSettingsController,
      noteEditorController,
      historyController,
      unsavedChangesController,
      confirmController,
      onUnsavedChangesCancel,
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
      editingTagWhitelists,
      resetPasswordResult,
      openUsers,
      loadUsers,
      createUser,
      updateUser,
      saveUserWhitelist,
      resetUserPassword,
      copyToClipboard,
      // Notes
      noteIndex,
      noteDetails,
      notesLoading,
      notesError,
      loadNotes,
      notePresence,
      presenceCount,
      presenceTitle,
      newNoteTitle,
      newNoteContent,
      noteProps,
      propsOpen,
      propsSummary,
      noteTagList,
      aliasDraft,
      userPropEntries,
      tagDraft,
      propKeyDraft,
      tagSuggestOpen,
      tagSuggestIndex,
      tagSuggestions,
      tagActiveDescendant,
      addTagProp,
      removeTagProp,
      commitTagDraft,
      pickTagSuggestion,
      moveTagSuggestion,
      onTagEnter,
      onTagComma,
      onTagArrow,
      onTagEscape,
      onTagInputBlur,
      setAliasProp,
      setUserProp,
      removePropKey,
      addPropKey,
      onPropKeyEnter,
      runTagOp,
      editingColor,
      setEditingColor,
      editingColorMenuOpen,
      toggleEditingColorMenu,
      noteColorLabel,
      NOTE_COLOR_OPTIONS,
      editingId,
      editingBaseRevisionId,
      editingRevisionNo,
      textCollabReady,
      textCollabPeers,
      textCollabStatus,
      revisionNotice,
      livePolite,
      liveAssertive,
      notify,
      dismissRevisionNotice,
      sortedNotes,
      dashboardNotes,
      notesGridRef,
      notesScrollerRef,
      virtualNoteRows,
      noteRowHeight,
      noteRenderBuffer,
      noteColumnCount,
      noteDetailFor,
      onVirtualUpdate,
      dashboardTab,
      setDashboardTab,
      onTabKeydown,
      notesTabCount,
      archivedTabCount,
      visibleNoteCount,
      visibleCountText,
      drafts,
      draftsLoading,
      draftsError,
      loadDrafts,
      draftNoteIds,
      openColorNoteId,
      toggleNoteColorPicker,
      setNoteColor,
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
      versionChain,
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
      draftAndClose,
      saveAndClose,
      cancelDiscardChanges,
      // Sorting and Selection
      sortBy,
      sortOrder,
      selectedNoteIds,
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
      selectionLinksOpen,
      selectionLinksData,
      selectionLinksLoading,
      selectionLinksError,
      selectionLinksMode,
      selectedNoteIdList,
      openSelectionLinks,
      closeSelectionLinks,
      openSelectionLinkNote,
      // Interface configuration
      uiConfig,
      uiConfigFields: UI_CONFIG_FIELDS,
      uiStyleVars,
      uiSettingsOpen,
      uiSettings,
      uiSettingsForm,
      uiSettingsLoading,
      uiSettingsSaving,
      uiSettingsError,
      uiSettingsNotice,
      openUiSettings,
      closeUiSettings,
      saveUiSettings,
      resetUiSettings,
      // MCP settings
      mcpSettingsOpen,
      mcpTokens,
      mcpTokenName,
      mcpTokenScopes,
      mcpTokenExpiresDays,
      mcpNewToken,
      mcpTokenError,
      mcpTokenLoading,
      mcpLimits,
      mcpLimitsForm,
      mcpLimitsLoading,
      mcpLimitsSaving,
      mcpLimitsError,
      mcpLimitsNotice,
      mcpEndpoint,
      openMcpSettings,
      createMcpToken,
      revokeMcpToken,
      copyMcpToken,
      saveMcpLimits,
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
      semanticSearchAvailable,
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
      searchMode,
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
      editingCanvasColor,
      editingCanvasTags,
      editingCanvasRevisionNo,
      knownTags,
      wsRef,
      openNewCanvas,
      openCanvasNote,
      closeCanvasEditor,
      // Chat
      editingChatId,
      editingChatTitle,
      editingChatColor,
      editingChatTags,
      editingChatRevisionNo,
      editingChatContent,
      openNewChat,
      openChatNote,
      closeChatEditor,
      fabNewChatRoom,
      // Kanban
      editingKanbanId,
      editingKanbanTitle,
      editingKanbanColor,
      editingKanbanTags,
      editingKanbanRevisionNo,
      editingKanbanContent,
      openNewKanban,
      openKanbanNote,
      closeKanbanEditor,
      fabNewKanbanBoard,
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
      pasteMode,
      shortcutsVisible,
      shortcut,
      markdownTextarea,
      setEditorMode,
      runEditorCommand,
      linkDialogOpen,
      linkDialogMode,
      linkDialogInitialText,
      searchLinkNotes,
      closeLinkDialog,
      submitLinkDialog,
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

      syncVisualEditor()
    }

    function onEditorKeydown(e) {
      // Ctrl/Cmd+Enter to save (allowed even during IME composition).
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        editingId.value ? saveEdit() : addNote()
        return
      }
      if (e.isComposing || compositionActive) return

      // Live markdown block shortcuts in Visual mode: typing the space after a
      // block trigger ("- ", "1. ", "# ", "> ") converts the line.
      if (
        e.key === ' ' &&
        editorMode.value === 'write' &&
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        if (applyMarkdownBlockShortcut()) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }

      // Markdown toolbar shortcuts in both Visual and Source modes.
      const command = matchEditorShortcut(e)
      if (command) {
        e.preventDefault()
        e.stopPropagation()
        runEditorCommand(command)
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
        syncVisualEditor()
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
        syncVisualEditor()
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
    // Visual mode manipulates the contentEditable DOM and lets the serializer
    // produce canonical markdown. Source mode edits the textarea selection
    // directly. Both modes share the same toolbar command ids.

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

    function syncVisualEditor() {
      newNoteContent.value = serializeEditorToMarkdown()
      // The DOM and canonical markdown are now in sync. `editorDirty` means
      // "the DOM needs serialising", not "the document differs from the head";
      // unsaved-change detection is handled by hasUnsavedChanges().
      editorDirty = false
    }

    function currentEditorBlock() {
      const el = imageEditor.value
      const sel = window.getSelection()
      if (!el || !sel || !sel.rangeCount) return null
      let node = sel.anchorNode
      if (!node || !el.contains(node)) return null
      if (node.nodeType === 3) node = node.parentNode
      while (node && node !== el) {
        if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TD|TH)$/.test(node.tagName)) return node
        node = node.parentNode
      }
      return null
    }

    /**
     * Live markdown block shortcuts for the Visual editor. When the caret sits at
     * the end of a markdown block trigger typed at the very start of a line
     * ("- ", "1. ", "# ", "> ", …), convert that line into the matching rich
     * element. The trigger text before the caret is removed first so only the
     * content remains. Returns true when a conversion was applied.
     */
    function applyMarkdownBlockShortcut() {
      const el = imageEditor.value
      if (!el) return false
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return false
      const range = sel.getRangeAt(0)
      if (!range.collapsed) return false
      const node = range.startContainer
      if (!node || !el.contains(node)) return false

      // The current line: a plain text block, or the editor root when the first
      // line is still unwrapped inline content. Leave already-formatted blocks
      // (LI, headings, quotes) alone so we never nest unintentionally.
      let line = currentEditorBlock()
      if (!line) {
        if (node.nodeType === 3 && node.parentNode === el) line = el
        else return false
      }
      if (line !== el && !/^(P|DIV)$/.test(line.tagName)) return false

      // Text from the start of the line up to the caret is exactly the trigger
      // when the marker was just typed at the line start (also covers inserting
      // the marker in front of existing content).
      const before = document.createRange()
      before.selectNodeContents(line)
      before.setEnd(range.startContainer, range.startOffset)
      const trigger = before.toString()

      let exec = null
      let formatTag = null
      if (/^[-*+]$/.test(trigger)) exec = 'insertUnorderedList'
      else if (/^\d+[.)]$/.test(trigger)) exec = 'insertOrderedList'
      else if (/^#{1,6}$/.test(trigger)) formatTag = 'H' + trigger.length
      else if (/^>$/.test(trigger)) formatTag = 'BLOCKQUOTE'
      else return false

      // Strip the typed marker (line start → caret), then let the browser build
      // the rich structure (it merges with an adjacent list when appropriate).
      before.deleteContents()
      const caret = document.createRange()
      caret.selectNodeContents(line)
      caret.collapse(true)
      sel.removeAllRanges()
      sel.addRange(caret)

      if (exec) document.execCommand(exec, false, null)
      else document.execCommand('formatBlock', false, formatTag)
      syncVisualEditor()
      return true
    }

    function formatBold() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('bold', false, null)
      syncVisualEditor()
    }

    function formatItalic() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('italic', false, null)
      syncVisualEditor()
    }

    function formatStrike() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('strikeThrough', false, null)
      syncVisualEditor()
    }

    function formatInlineCode() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const range = sel.getRangeAt(0)
      const selected = range.toString()
      const code = document.createElement('code')
      code.textContent = selected || 'code'
      range.deleteContents()
      range.insertNode(code)
      const nextRange = document.createRange()
      nextRange.selectNodeContents(code)
      if (selected) nextRange.collapse(false)
      sel.removeAllRanges()
      sel.addRange(nextRange)
      syncVisualEditor()
    }

    function insertLink() {
      openLinkDialog('link')
    }

    function insertWikiLink() {
      openLinkDialog('wiki')
    }

    function captureLinkSelection() {
      if (editorMode.value === 'plain') {
        const value = newNoteContent.value
        const textarea = markdownTextarea.value
        const start = textarea ? textarea.selectionStart : value.length
        const end = textarea ? textarea.selectionEnd : start
        return { mode: 'plain', start, end, text: value.slice(start, end) }
      }
      const el = imageEditor.value
      const sel = window.getSelection()
      if (el && sel && sel.rangeCount && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0).cloneRange()
        return { mode: 'write', range, text: range.toString() }
      }
      return { mode: 'write', range: null, text: '' }
    }

    function openLinkDialog(mode) {
      if (!isModalOpen.value || linkDialogOpen.value) return
      const selection = captureLinkSelection()
      linkDialogSelection = selection
      linkDialogInitialText.value = selection.text
      linkDialogMode.value = mode === 'wiki' ? 'wiki' : 'link'
      linkDialogOpen.value = true
    }

    function closeLinkDialog() {
      linkDialogOpen.value = false
      linkDialogInitialText.value = ''
      linkDialogSelection = null
    }

    async function searchLinkNotes(query) {
      const q = String(query || '').trim()
      const active = noteIndex.value.filter(note =>
        !note.archivedAt && note.id !== editingId.value
      )
      if (!q) {
        return active
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
          .slice(0, 8)
      }
      const ids = await api(`/api/search?q=${encodeURIComponent(q)}`)
      const byId = new Map(active.map(note => [note.id, note]))
      return (Array.isArray(ids) ? ids : [])
        .map(id => byId.get(id))
        .filter(Boolean)
        .slice(0, 20)
    }

    function insertVisualLinkNode(range, payload) {
      const el = imageEditor.value
      if (!el) return
      el.focus()
      let target = range
      if (!target || !el.contains(target.startContainer)) {
        target = document.createRange()
        target.selectNodeContents(el)
        target.collapse(false)
      }

      let node
      if (payload.mode === 'link') {
        node = document.createElement('a')
        node.setAttribute('href', payload.url)
        node.textContent = payload.text
      } else {
        node = document.createElement('span')
        node.className = 'note-link'
        const title = payload.target?.title || ''
        if (payload.target?.noteId) node.setAttribute('data-note-id', payload.target.noteId)
        else node.setAttribute('data-note-target', title)
        node.setAttribute('data-note-label', payload.label || title || 'Untitled')
        node.textContent = payload.label || title || 'Untitled'
      }

      target.deleteContents()
      target.insertNode(node)
      const nextRange = document.createRange()
      nextRange.setStartAfter(node)
      nextRange.collapse(true)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(nextRange)
      syncVisualEditor()
    }

    function submitLinkDialog(payload) {
      const selection = linkDialogSelection || captureLinkSelection()
      const markdown = buildLinkMarkdown(payload)
      linkDialogOpen.value = false
      linkDialogInitialText.value = ''
      linkDialogSelection = null
      nextTick(() => {
        if (selection.mode === 'plain') {
          replaceSourceRange(
            selection.start,
            selection.end,
            markdown,
            selection.start + markdown.length
          )
        } else {
          insertVisualLinkNode(selection.range, payload)
        }
      })
    }

    function toggleHeading(level) {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const tag = `H${level}`
      const block = currentEditorBlock()
      document.execCommand('formatBlock', false, block?.tagName === tag ? 'P' : tag)
      syncVisualEditor()
    }

    function toggleBlockquote() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const block = currentEditorBlock()
      document.execCommand('formatBlock', false, block?.tagName === 'BLOCKQUOTE' ? 'P' : 'BLOCKQUOTE')
      syncVisualEditor()
    }

    function toggleVisualList(kind) {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand(kind === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList')
      syncVisualEditor()
    }

    function insertCheckbox() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const block = currentEditorBlock()
      if (!block) return
      const marker = document.createTextNode(block.tagName === 'LI' ? '[ ] ' : '- [ ] ')
      const range = document.createRange()
      range.selectNodeContents(block)
      range.collapse(true)
      range.insertNode(marker)
      const nextRange = document.createRange()
      nextRange.setStartAfter(marker)
      nextRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(nextRange)
      syncVisualEditor()
    }

    function insertCodeBlock() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const range = sel.getRangeAt(0)
      const selected = range.toString()
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = selected || 'code'
      pre.appendChild(code)
      range.deleteContents()
      range.insertNode(pre)
      const nextRange = document.createRange()
      nextRange.selectNodeContents(code)
      if (selected) nextRange.collapse(false)
      sel.removeAllRanges()
      sel.addRange(nextRange)
      syncVisualEditor()
    }

    function insertTable() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      const range = sel.getRangeAt(0)
      const table = document.createElement('table')
      table.innerHTML = '<thead><tr><th>Column 1</th><th>Column 2</th></tr></thead>' +
        '<tbody><tr><td>Cell</td><td>Cell</td></tr></tbody>'
      range.deleteContents()
      range.insertNode(table)
      const cell = table.querySelector('th')
      const nextRange = document.createRange()
      nextRange.selectNodeContents(cell)
      sel.removeAllRanges()
      sel.addRange(nextRange)
      syncVisualEditor()
    }

    function insertHorizontalRule() {
      const sel = focusEditorAtSelection()
      if (!sel) return
      document.execCommand('insertHorizontalRule', false, null)
      syncVisualEditor()
    }

    // ── Source-mode commands ──

    function getSourceSelection() {
      const value = newNoteContent.value
      const textarea = markdownTextarea.value
      const start = textarea ? textarea.selectionStart : value.length
      const end = textarea ? textarea.selectionEnd : start
      return { value, start, end }
    }

    function replaceSourceRange(start, end, text, selectionStart = null, selectionEnd = null) {
      const value = newNoteContent.value
      newNoteContent.value = value.slice(0, start) + text + value.slice(end)
      const nextStart = selectionStart == null ? start + text.length : selectionStart
      const nextEnd = selectionEnd == null ? nextStart : selectionEnd
      nextTick(() => {
        const textarea = markdownTextarea.value
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(nextStart, nextEnd)
      })
    }

    function wrapSourceSelection(prefix, suffix = prefix, placeholder = 'text') {
      const { value, start, end } = getSourceSelection()
      const selected = value.slice(start, end) || placeholder
      const text = prefix + selected + suffix
      const selectedStart = start + prefix.length
      replaceSourceRange(start, end, text, selectedStart, selectedStart + selected.length)
    }

    function getSourceLineRange() {
      const { value, start, end } = getSourceSelection()
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const newline = value.indexOf('\n', end)
      return { value, start: lineStart, end: newline === -1 ? value.length : newline }
    }

    function transformSourceLines(transform) {
      const range = getSourceLineRange()
      const lines = range.value.slice(range.start, range.end).split('\n')
      const next = transform(lines).join('\n')
      replaceSourceRange(range.start, range.end, next, range.start + next.length)
    }

    function stripListPrefix(line) {
      return line.replace(/^\s*(?:[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '')
    }

    function toggleSourceHeading(level) {
      const pattern = new RegExp(`^#{${level}}\\s+`)
      transformSourceLines(lines => {
        const active = lines.every(line => pattern.test(line))
        return lines.map(line => {
          const stripped = line.replace(/^#{1,6}\s+/, '')
          return active ? stripped : `${'#'.repeat(level)} ${stripped}`
        })
      })
    }

    function toggleSourceQuote() {
      transformSourceLines(lines => {
        const active = lines.every(line => /^\s*>\s?/.test(line))
        return lines.map(line => active ? line.replace(/^\s*>\s?/, '') : `> ${line}`)
      })
    }

    function toggleSourceList(kind) {
      const patterns = {
        bullet: /^\s*[-*+]\s+/,
        ordered: /^\s*\d+\.\s+/,
        task: /^\s*[-*+]\s+\[[ xX]\]\s+/
      }
      transformSourceLines(lines => {
        const active = lines.every(line => patterns[kind].test(line))
        return lines.map((line, index) => {
          const stripped = stripListPrefix(line)
          if (active) return stripped
          if (kind === 'ordered') return `${index + 1}. ${stripped}`
          if (kind === 'task') return `- [ ] ${stripped}`
          return `- ${stripped}`
        })
      })
    }

    function insertSourceCodeBlock() {
      const { value, start, end } = getSourceSelection()
      const selected = value.slice(start, end)
      const body = selected || ''
      const trailing = !body || !body.endsWith('\n') ? '\n' : ''
      const insert = '```\n' + body + trailing + '```'
      const bodyStart = start + 4
      replaceSourceRange(start, end, insert, bodyStart, bodyStart + body.length)
    }

    function insertSourceTable() {
      const { start, end } = getSourceSelection()
      const template = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |'
      replaceSourceRange(start, end, template, start + 2, start + 2 + 'Column 1'.length)
    }

    function insertSourceHorizontalRule() {
      const { start, end } = getSourceSelection()
      replaceSourceRange(start, end, '\n---\n', start + 5)
    }

    function runSourceCommand(command) {
      switch (command) {
        case 'bold': return wrapSourceSelection('**', '**', 'bold text')
        case 'italic': return wrapSourceSelection('*', '*', 'italic text')
        case 'strike': return wrapSourceSelection('~~', '~~', 'strikethrough')
        case 'inline-code': return wrapSourceSelection('`', '`', 'code')
        case 'link': return openLinkDialog('link')
        case 'wiki-link': return openLinkDialog('wiki')
        case 'heading-1': return toggleSourceHeading(1)
        case 'heading-2': return toggleSourceHeading(2)
        case 'heading-3': return toggleSourceHeading(3)
        case 'quote': return toggleSourceQuote()
        case 'bullet-list': return toggleSourceList('bullet')
        case 'ordered-list': return toggleSourceList('ordered')
        case 'task-list': return toggleSourceList('task')
        case 'code-block': return insertSourceCodeBlock()
        case 'table': return insertSourceTable()
        case 'horizontal-rule': return insertSourceHorizontalRule()
        default: return undefined
      }
    }

    function runEditorCommand(command) {
      if (!isModalOpen.value) return
      if (editorMode.value === 'plain') {
        runSourceCommand(command)
        return
      }
      switch (command) {
        case 'bold': return formatBold()
        case 'italic': return formatItalic()
        case 'strike': return formatStrike()
        case 'inline-code': return formatInlineCode()
        case 'link': return insertLink()
        case 'wiki-link': return insertWikiLink()
        case 'heading-1': return toggleHeading(1)
        case 'heading-2': return toggleHeading(2)
        case 'heading-3': return toggleHeading(3)
        case 'quote': return toggleBlockquote()
        case 'bullet-list': return toggleVisualList('bullet')
        case 'ordered-list': return toggleVisualList('ordered')
        case 'task-list': return insertCheckbox()
        case 'code-block': return insertCodeBlock()
        case 'table': return insertTable()
        case 'horizontal-rule': return insertHorizontalRule()
        default: return undefined
      }
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
      syncVisualEditor()
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
      for (const item of items || []) {
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
      if (pasteMode.value === 'rich' && html.trim()) {
        e.preventDefault()
        let markdown = htmlToMarkdown(html)
        if (!markdown.trim()) markdown = text.replace(/\r\n?/g, '\n')
        if (!markdown.trim()) return
        markdown = (await normalizeDataUrlImages(markdown)).markdown
        insertMarkdownAsRich(markdown)
        return
      }
      if (!text) return
      e.preventDefault()
      insertPlainTextAtCursor(text)
    }

    async function onMarkdownPaste(e) {
      const items = e.clipboardData?.items
      for (const item of items || []) {
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
      if (pasteMode.value === 'rich' && html.trim()) {
        e.preventDefault()
        let markdown = htmlToMarkdown(html)
        if (!markdown.trim()) markdown = text.replace(/\r\n?/g, '\n')
        if (!markdown.trim()) return
        markdown = (await normalizeDataUrlImages(markdown)).markdown
        insertMarkdownAtCursor(markdown)
        return
      }
      if (!text) return
      e.preventDefault()
      insertPlainTextAtCursor(text)
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
  color: var(--text-muted);
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
  transition: filter 0.15s;
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
  color: var(--text-muted);
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

:root {
  /* Fallback until the real header is measured; keeps sticky bars aligned. */
  --app-header-height: 66px;
}

header {
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.85rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.25rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.28);
  flex-shrink: 0;
}

.brand h1 {
  margin: 0;
  font-size: 1.22rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #0f172a;
  white-space: nowrap;
}

/* Header icon buttons */
.icon-btn {
  position: relative;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
}

.icon-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.icon-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.icon-btn.active {
  background: #e8f0fe;
  border-color: #d2e3fc;
  color: #1a73e8;
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-btn--sm {
  width: 30px;
  height: 30px;
  border-radius: 9px;
}

.header-search-field {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0.15rem;
  padding: 0.2rem;
  background: #f1f5f9;
  border: 1px solid transparent;
  border-radius: 12px;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  max-width: 600px;
}

.header-search-field:focus-within {
  background: #fff;
  border-color: #bfdbfe;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.header-search-field .search-icon {
  padding-left: 0.5rem;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 0.55rem 0.35rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: #0f172a;
  border-radius: 8px;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-semantic-btn {
  opacity: 0.55;
}

.search-semantic-btn.active {
  opacity: 1;
}

.search-semantic-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* Shortcut tooltips: action name on hover, keybinding while Alt/Option is held. */
.icon-btn[data-label]::after,
.fab-btn[data-label]::after {
  content: attr(data-label);
  position: absolute;
  top: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
  padding: 0.28rem 0.5rem;
  background: #0f172a;
  color: #fff;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.22);
  z-index: 320;
}

.icon-btn[data-label]:hover::after,
.icon-btn[data-label]:focus-visible::after,
.fab-btn[data-label]:hover::after,
.fab-btn[data-label]:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.shortcuts-visible .icon-btn[data-shortcut]::after {
  content: attr(data-shortcut);
  background: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* Shortcut badges for regular buttons (tabs, modals, tag rows, etc.).
   Editor-toolbar buttons use the md-tool tooltip instead. */
button[data-shortcut]:not(.icon-btn):not(.fab-btn):not(.md-tool-btn):not(.note-editor-toolbar button) {
  position: relative;
}

button[data-shortcut]:not(.icon-btn):not(.fab-btn):not(.md-tool-btn):not(.note-editor-toolbar button)::after {
  content: attr(data-shortcut);
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%) translateY(2px);
  padding: 0.26rem 0.46rem;
  background: #0f172a;
  color: #fff;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.22);
  z-index: 330;
}

.shortcuts-visible button[data-shortcut]:not(.icon-btn):not(.fab-btn):not(.md-tool-btn):not(.note-editor-toolbar button)::after {
  content: attr(data-shortcut);
  background: #1d4ed8;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.sync-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.34rem 0.6rem;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.18);
  flex-shrink: 0;
}

.sync-status.connected {
  color: #0f766e;
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.sync-status.connected .sync-dot {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
}

.sync-status.connecting {
  color: #b45309;
  background: #fffbeb;
  border-color: #fde68a;
}

.sync-status.connecting .sync-dot {
  background: #f59e0b;
}

@keyframes sync-pulse {
  50% { opacity: 0.35; }
}

.account-menu-wrap {
  position: relative;
}

.account-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.22rem 0.55rem 0.22rem 0.22rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.account-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.account-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.account-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.22);
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
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
}

.account-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.45rem);
  width: 230px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
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
  color: var(--text-muted);
  font-size: 0.7rem;
}

.account-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.5rem 0.55rem;
  border-radius: 7px;
  color: #334155;
  font-size: 0.8rem;
  cursor: pointer;
}

.account-menu button:hover {
  background: #f1f5f9;
}

.account-menu button .app-icon {
  color: #64748b;
}

.account-menu .account-menu-danger {
  color: #b91c1c;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  /* Size query container for the workspace layout.
     A container query measures the CONTENT BOX, and `main` has 2rem of
     horizontal padding, so the viewport width and the workspace width differ
     by 64px. The stacking breakpoint is about the space the workspace
     actually has, so it is measured here and not against the viewport. */
  container-type: inline-size;
  container-name: workspace;
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
  border-color: #1a73e8;
}

/* Head metadata row: the folder name and its icon share a line. */
.note-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.note-title-row .note-title-input {
  flex: 1 1 auto;
  min-width: 0;
  margin-bottom: 0.5rem;
}

.note-title-row .card-color-picker {
  margin-bottom: 0.5rem;
}

/* Properties section (the fence): one row per key, key on the left. */
.note-properties {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.375rem 0 0.5rem;
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
  margin-bottom: 0.5rem;
}

/* Folded by default: only the toggle header and a one-line summary show. */
.note-properties.props-collapsed {
  padding-bottom: 0.25rem;
}

.note-properties.props-collapsed .prop-row {
  display: none;
}

.props-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.125rem 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-muted, rgba(0, 0, 0, 0.55));
  text-align: left;
}

.props-toggle:hover {
  color: var(--text-color, inherit);
}

.props-caret {
  width: 0.75rem;
  flex-shrink: 0;
  font-size: 0.625rem;
}

.props-toggle-label {
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 0.6875rem;
}

.props-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: 0.75rem;
  opacity: 0.85;
}

.prop-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
}

.prop-key {
  flex: 0 0 5.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted, rgba(0, 0, 0, 0.55));
}

.prop-value {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.8125rem;
  background: transparent;
}

.prop-value:hover,
.prop-value:focus {
  border-color: var(--border-color, rgba(0, 0, 0, 0.18));
}

.prop-checkbox {
  flex: 0 0 auto;
}

.prop-chips {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.prop-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: var(--chip-bg, rgba(0, 0, 0, 0.06));
  font-size: 0.75rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prop-chip-remove {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0 0.125rem;
  font-size: 0.75rem;
  line-height: 1;
  color: inherit;
}

.prop-chip-input {
  flex: 1 1 6rem;
  min-width: 5rem;
  padding: 0.125rem 0.25rem;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.75rem;
  background: transparent;
}

.prop-chip-input:focus {
  border-color: var(--border-color, rgba(0, 0, 0, 0.18));
}

/* Tag autocomplete: suggestions float under the tag input without moving
   the properties rows. */
.prop-tag-field {
  position: relative;
  flex: 1 1 6rem;
  min-width: 5rem;
}

.prop-tag-field .prop-chip-input {
  width: 100%;
}

.tag-suggestions {
  position: absolute;
  z-index: 40;
  top: calc(100% + 2px);
  left: 0;
  min-width: 12rem;
  max-width: 24rem;
  max-height: 12rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: var(--card-surface, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.18));
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
}

.tag-suggestion {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.375rem;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-suggestion.active,
.tag-suggestion:hover {
  background: var(--chip-bg, rgba(0, 0, 0, 0.07));
}

.tag-suggestion-path {
  overflow: hidden;
  text-overflow: ellipsis;
}

.prop-remove,
.prop-add {
  flex: 0 0 auto;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0 0.25rem;
  font-size: 0.875rem;
  line-height: 1;
  color: var(--text-muted, rgba(0, 0, 0, 0.55));
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
  border-color: #1a73e8;
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

.reconnect-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 34px;
  padding: 0 0.7rem;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.reconnect-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.16);
}

.reconnect-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
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
  color: var(--text-muted);
  font-size: 0.8125rem;
  padding: 1rem;
}

.canvas-thumbnail-placeholder span:first-child {
  font-size: 2rem;
}

.canvas-untitled {
  color: var(--text-muted);
  font-style: italic;
}

.chat-card-preview {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.8125rem;
  color: #334155;
  margin-top: 0.25rem;
}

.chat-card-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.chat-card-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
}

.chat-card-messages {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chat-card-msg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.chat-card-sender {
  font-weight: 600;
  color: #1e293b;
  margin-right: 0.25rem;
}

.chat-card-text {
  color: #475569;
}

.chat-card-empty {
  color: var(--text-muted);
  font-style: italic;
  font-size: 0.8125rem;
}

.kanban-card-preview {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.8125rem;
  color: #334155;
  margin-top: 0.25rem;
}

.kanban-card-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.kanban-card-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
}

.kanban-card-col-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.kanban-card-col-pill {
  font-size: 0.7rem;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

/* Quick Shortcuts is a read-only virtual note, so it uses the normal card
   preview and scrollbar. Only its inline shortcut keys get a kbd look. */
.shortcut-tips-card .note-preview code {
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 4px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
  padding: 0.1rem 0.35rem;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  color: #3c4043;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.notes-grid-virtual {
  display: block;
}

.notes-virtual-scroller {
  width: 100%;
}

.virtual-note-row {
  display: grid;
  gap: 1rem;
  align-items: start;
  box-sizing: border-box;
  height: 100%;
  padding-bottom: 1rem;
}

.note-preview-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-top: 0.35rem;
}

.note-preview-skeleton span {
  display: block;
  height: 0.65rem;
  border-radius: 4px;
  background: linear-gradient(90deg, #eef1f6 0%, #f7f9fc 50%, #eef1f6 100%);
  background-size: 200% 100%;
}

.note-preview-skeleton span:nth-child(2) {
  width: 88%;
}

.note-preview-skeleton span:nth-child(3) {
  width: 62%;
}

.note-card-loading {
  cursor: progress;
}

@keyframes note-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Tint defaults live on any note surface (card, editor modal). `:where()`
   keeps specificity low so per-tint overrides win regardless of source order. */
:where(.note-card) {
  --card-surface-start: #ffffff;
  --card-surface-end: #f4f8ff;
  --card-border-color: #dbe7fb;
  --card-accent-start: #8ab4f8;
  --card-accent-end: #1a73e8;
  background: linear-gradient(180deg, var(--card-surface-start) 0%, var(--card-surface-end) 100%);
  border: 1px solid var(--card-border-color);
  border-radius: 8px;
  padding: 1rem;
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s, background-color 0.2s;
  height: 380px;
  width: 100%;
  max-width: none;
  margin: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(26, 115, 232, 0.07);
}

.note-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--card-accent-start) 0%, var(--card-accent-end) 100%);
  opacity: 0.9;
  pointer-events: none;
}

:where(.note-card).canvas-note {
  --card-surface-start: #fefcff;
  --card-surface-end: #f6f0ff;
  --card-border-color: #e4d7f7;
  --card-accent-start: #c58af9;
  --card-accent-end: #7b4dd8;
}

/* Per-note tint overrides (notes.color). Default stays type-based.
   Unprefixed so the editor modal tints from the same palette as its card. */
.note-color-blue {
  --card-surface-start: #f8fbff;
  --card-surface-end: #e8f1ff;
  --card-border-color: #bfdbfe;
  --card-accent-start: #60a5fa;
  --card-accent-end: #2563eb;
}

.note-color-green {
  --card-surface-start: #f7fdf9;
  --card-surface-end: #e6f8ee;
  --card-border-color: #bbe9cf;
  --card-accent-start: #4ade80;
  --card-accent-end: #16a34a;
}

.note-color-amber {
  --card-surface-start: #fffdf5;
  --card-surface-end: #fdf3d7;
  --card-border-color: #f6dfa6;
  --card-accent-start: #fbbf24;
  --card-accent-end: #d97706;
}

.note-color-rose {
  --card-surface-start: #fff8f9;
  --card-surface-end: #ffe9ec;
  --card-border-color: #fecdd3;
  --card-accent-start: #fb7185;
  --card-accent-end: #e11d48;
}

.note-color-violet {
  --card-surface-start: #fbf9ff;
  --card-surface-end: #f1ebff;
  --card-border-color: #ddd6fe;
  --card-accent-start: #a78bfa;
  --card-accent-end: #7c3aed;
}

.note-color-slate {
  --card-surface-start: #fbfcfd;
  --card-surface-end: #eef2f6;
  --card-border-color: #dbe3ec;
  --card-accent-start: #94a3b8;
  --card-accent-end: #475569;
}

.note-card:hover {
  border-color: var(--card-accent-end);
  box-shadow: 0 10px 26px rgba(26, 115, 232, 0.16);
  transform: translateY(-2px);
}

.note-card.editing {
  border-color: #1a73e8;
  background: #f2f7ff;
  outline: 2px solid #1a73e8;
  box-shadow: 0 10px 26px rgba(26, 115, 232, 0.2);
}

.note-card.archived {
  opacity: 0.72;
  background: #f8f9fa;
  border-style: dashed;
  box-shadow: none;
}

.note-card.archived::before {
  display: none;
}

.note-card.archived:hover {
  transform: none;
  box-shadow: none;
  border-color: #dadce0;
}

.shortcut-tips-card {
  cursor: default;
}

.shortcut-tips-card .card-toolbar {
  min-height: 24px;
}

.shortcut-tips-card:hover {
  transform: none;
  border-color: var(--card-border-color);
  box-shadow: 0 2px 10px rgba(26, 115, 232, 0.07);
}

.draft-card .card-toolbar {
  min-height: 24px;
}

.draft-badge,
.revision-badge.draft-badge {
  background: #fef7e0;
  color: #b06000;
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

.card-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.toolbar-spacer {
  flex: 1;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  min-width: 0;
}

.dashboard-tabs {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  /* min-content safety: wrap rather than force horizontal overflow on
     very narrow viewports (stays one line whenever there is room). */
  flex-wrap: wrap;
  padding: 0.18rem;
  background: #eef2f7;
  border-radius: 10px;
}

.dashboard-tab {
  border: none;
  background: transparent;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.38rem 0.7rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.dashboard-tab:hover {
  background: rgba(255, 255, 255, 0.7);
  color: #0f172a;
}

.dashboard-tab.active {
  background: #fff;
  color: #1a73e8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.dashboard-tab:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.tab-count {
  min-width: 1.4rem;
  padding: 0.18rem 0.38rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.dashboard-tab.active .tab-count {
  background: #e8f0fe;
  color: #1a73e8;
}

.drafts-refresh-btn {
  width: 30px;
  height: 30px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
  color: #5f6368;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.drafts-refresh-btn:hover:not(:disabled) {
  background: #f1f5f9;
}

.drafts-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notes-empty {
  grid-column: 1 / -1;
  border: 1px dashed #dbe3ec;
  border-radius: 12px;
  padding: 2rem 1.25rem;
  text-align: center;
  color: #64748b;
  background: #fbfcfe;
}

.notes-empty p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Note color picker (right of the card checkbox) */
.card-color-picker {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.card-color-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--card-border-color);
  border-radius: 50%;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.card-color-btn:hover {
  border-color: var(--text-muted);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.card-color-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.card-color-btn--blue { color: #2563eb; }
.card-color-btn--green { color: #16a34a; }
.card-color-btn--amber { color: #d97706; }
.card-color-btn--rose { color: #e11d48; }
.card-color-btn--violet { color: #7c3aed; }
.card-color-btn--slate { color: #475569; }

.note-color-option--default {
  background: linear-gradient(135deg, #ffffff 50%, #bfdbfe 50%);
}

.note-color-option--blue {
  background: linear-gradient(135deg, #93c5fd, #2563eb);
}

.note-color-option--green {
  background: linear-gradient(135deg, #86efac, #16a34a);
}

.note-color-option--amber {
  background: linear-gradient(135deg, #fde68a, #d97706);
}

.note-color-option--rose {
  background: linear-gradient(135deg, #fda4af, #e11d48);
}

.note-color-option--violet {
  background: linear-gradient(135deg, #c4b5fd, #7c3aed);
}

.note-color-option--slate {
  background: linear-gradient(135deg, #cbd5e1, #475569);
}

.note-color-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  z-index: 8;
}

.note-color-option {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.12s ease;
}

.note-color-option:hover {
  transform: scale(1.1);
}

.note-color-option.selected {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1d4ed8;
}

.note-color-option:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 3px;
}

.note-color-option--default { color: #1d4ed8; }
.note-color-option--blue,
.note-color-option--green,
.note-color-option--rose,
.note-color-option--violet,
.note-color-option--slate { color: #fff; }
.note-color-option--amber { color: #78350f; }

.note-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Skip layout and painting for a card body that is off-screen.
     The card has an explicit height (380px) and the body is sized by the
     flex algorithm (flex-basis 0%, flex-grow 1), so skipping the body
     cannot change the card's height or the scroller's 396px row height.
     `auto` remembers the last rendered size, so the reserved space stays
     stable while the body is skipped. */
  content-visibility: auto;
  contain-intrinsic-size: auto 12rem;
}

.note-content h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #202124;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  min-width: 0;
  line-height: 1.3;
}

.card-title-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
  max-height: 2.6em;
}

.note-content h3 .revision-badge {
  margin-left: 0;
  margin-top: 0.15rem;
  flex: 0 0 auto;
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
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.markdown-preview {
  font-size: 0.9rem;
  line-height: 1.55;
}

/* Legacy fallback for WebKit/Blink. Isolated so it does not fight the
   standard properties in browsers that support both natively. The colours
   cascade from the custom properties, so they are not repeated here. */
@supports not (scrollbar-color: auto) {
  .note-preview::-webkit-scrollbar,
  .markdown-preview::-webkit-scrollbar {
    width: 4px;
  }

  .note-preview::-webkit-scrollbar-thumb,
  .markdown-preview::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 2px;
  }
}

/* Shared rendered-markdown typography */
.note-preview,
.markdown-preview {
  font-size: 0.9rem;
  line-height: 1.55;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
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
.markdown-preview p,
.note-editor p { margin: 0.35rem 0; }
.note-preview ul,
.note-preview ol,
.markdown-preview ul,
.markdown-preview ol,
.note-editor ul,
.note-editor ol { padding-left: 1.4rem; margin: 0.35rem 0; }
.note-preview li,
.markdown-preview li,
.note-editor li { margin: 0.1rem 0; }
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
  color: var(--text-muted);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
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
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-btn.copied {
  opacity: 1;
  color: var(--text-success);
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
  width: min(400px, 90vw);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  position: relative;
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
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.confirm-actions button {
  flex: 1 1 0;
  min-width: 72px;
  padding: 0.5rem 0.35rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.continue-btn {
  padding: 0.5rem 1.25rem;
  background: #fff;
  color: #1a73e8;
  border: 1px solid #d2e3fc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.continue-btn:hover {
  background: #f8fafd;
}

.draft-btn {
  padding: 0.5rem 1.25rem;
  background: #fff7e6;
  color: #b06000;
  border: 1px solid #f6dfa6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.draft-btn:hover {
  background: #fef3c7;
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
/* Native dialog: the element is the centred box and `::backdrop` is the dim
   layer. The platform puts the dialog in the top layer, so there is no
   z-index to maintain and no focus trap to hand-roll. */
.modal-overlay {
  border: none;
  padding: 0;
  background: transparent;
  /* `fit-content` shrink-wraps the dialog box around the panel inside it;
     the UA's automatic margin (restored in base.css) then centres it in the
     viewport. `width: auto` would stretch the box to the full viewport
     width and leave the panel pinned to the top-left corner. */
  width: fit-content;
  height: fit-content;
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}

.modal-overlay::backdrop {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Fallback tint variables for the editor surface. `:where()` gives this zero
   specificity on purpose: the modal element also carries `note-color-*` when
   tinted, and those must win. Without this the fallback would override the tint
   simply by coming later in the sheet. */
:where(.note-form-modal) {
  --card-surface-start: #ffffff;
  --card-surface-end: #ffffff;
  --card-border-color: transparent;
  --card-accent-start: #8ab4f8;
  --card-accent-end: #1a73e8;
}

.note-form-modal {
  /* Consumes the same tint variables as the note card, so the editor shows the
     note's colour while editing. */
  background: linear-gradient(180deg, var(--card-surface-start) 0%, var(--card-surface-end) 100%);
  border-radius: 12px;
  padding: 1.5rem;
  width: min(var(--note-modal-width, 960px), 94vw);
  height: min(var(--note-modal-height, 760px), 92vh);
  max-height: 92vh;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  position: relative;
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.note-form-modal.editing-form {
  border: 2px solid var(--card-accent-end);
  box-shadow: 0 10px 25px rgba(26, 115, 232, 0.2);
}

/* Tinted editor: the accent bar mirrors the card's top stripe. */
.note-form-modal.is-tinted {
  border: 1px solid var(--card-border-color);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.18);
}

.note-form-modal.is-tinted::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(90deg, var(--card-accent-start) 0%, var(--card-accent-end) 100%);
  opacity: 0.9;
  pointer-events: none;
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

.history-version-badge {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  min-width: 1.15rem;
  border-radius: 999px;
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
  vertical-align: middle;
}

.version-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.65rem;
  margin-bottom: 0.65rem;
  background: #f8f9fa;
  border: 1px solid #ededed;
  border-radius: 6px;
  font-size: 0.78rem;
  color: #5f6368;
}
.version-chain-label { font-weight: 600; }
.version-chain-arrow { color: var(--text-muted); }
.version-chain-node { color: #1a73e8; font-weight: 600; }

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
  border: none;
  padding: 1rem;
  background: transparent;
  /* `fit-content` shrink-wraps the dialog box around the panel inside it;
     the UA's automatic margin (restored in base.css) then centres it in the
     viewport. `width: auto` would stretch the box to the full viewport
     width and leave the panel pinned to the top-left corner. */
  width: fit-content;
  height: fit-content;
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}

.history-overlay::backdrop {
  background: rgba(32, 33, 36, 0.35);
}

.history-panel {
  width: min(720px, 94vw);
  max-height: 88vh;
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  /* Same font as the Visual editor so both modes look alike. */
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
  /* Soft-wrap long source lines; preserves newlines/indent but avoids horizontal scroll. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.note-form-modal .markdown-preview {
  background: #fafafa;
  cursor: default;
}

.note-form-modal textarea {
  resize: none;
}

.note-form-modal .note-editor {
  /* Rendered markdown is real block HTML (soft breaks are <br>), so normal
     whitespace collapses marked's "\n" separators instead of showing them as
     blank lines. Source editing keeps pre-wrap on .markdown-source. */
  white-space: normal;
  word-wrap: break-word;
  cursor: text;
  line-height: 1.5;
}
.note-form-modal .note-editor pre {
  white-space: pre;
  overflow-x: auto;
}

.note-form-modal .note-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
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
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.editor-footer-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.action-buttons button {
  min-width: 92px;
}

.paste-mode-select {
  padding: 0.38rem 0.45rem;
  background: #f8f9fa;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  max-width: 130px;
}

.paste-mode-select:hover {
  background: #e8eaed;
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

/* Inside the editor toolbar the image button is a tool: match .md-tool-btn sizing */
.note-editor-toolbar .image-btn {
  position: relative;
  min-width: 30px;
  height: 30px;
  padding: 0 0.4rem;
  background: #f8f9fa;
  color: #3c4043;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Tooltip identical to .md-tool-btn: name normally, shortcut while Alt/Ctrl held. */
.note-editor-toolbar .image-btn::after {
  content: attr(data-label);
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.22rem 0.42rem;
  background: #202124;
  color: #fff;
  border-radius: 4px;
  font-size: 0.66rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  z-index: 320;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.note-editor-toolbar .image-btn:hover::after,
.note-editor-toolbar .image-btn:focus-visible::after {
  opacity: 1;
}

.shortcuts-visible .note-editor-toolbar .image-btn:hover::after,
.shortcuts-visible .note-editor-toolbar .image-btn:focus-visible::after {
  content: attr(data-shortcut);
  background: #1a73e8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.note-editor-toolbar .image-btn:hover:not(:disabled) {
  background: #e8eaed;
  border-color: #c6cacd;
}

.note-editor-toolbar .image-btn:disabled {
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

/* Interface settings */
.ui-settings-modal {
  width: min(720px, 94vw);
  max-height: 88vh;
  overflow-y: auto;
}

.ui-settings-hint {
  margin: 0 0 0.9rem;
  color: #5f6368;
  font-size: 0.82rem;
  line-height: 1.45;
}

.ui-settings-hint code {
  background: #f1f3f4;
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
}

.ui-settings-loading {
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem;
}

.ui-settings-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ui-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.ui-settings-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #3c4043;
}

.ui-settings-grid input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.6rem;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 0.9rem;
}

.ui-settings-grid input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.14);
}

.ui-settings-grid small {
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--text-muted);
}

.ui-settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

@media (max-width: 620px) {
  .ui-settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
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

/* Sort / Action Bar */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 8px;
  position: sticky;
  top: var(--app-header-height, 66px);
  z-index: 9;
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
  position: sticky;
  top: var(--app-header-height, 66px);
  z-index: 9;
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
.btn-deselect-all,
.btn-selection-links {
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

.btn-selection-links {
  border-color: #d2e3fc;
  background: #fff;
}

.btn-selection-links:hover:not(:disabled) {
  background: #f8fafd;
}

.btn-selection-links:disabled {
  opacity: 0.6;
  cursor: default;
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
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.34), 0 2px 6px rgba(15, 23, 42, 0.12);
  transition: box-shadow 0.18s ease, border-radius 0.18s ease;
  z-index: 99;
}

.fab-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 14px 32px rgba(37, 99, 235, 0.42), 0 3px 8px rgba(15, 23, 42, 0.14);
}

.fab-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 3px;
}

.fab-btn svg {
  transition: none;
}

.fab-btn.fab-open {
  border-radius: 50%;
}

.fab-btn.fab-open svg {
  transform: rotate(45deg);
}

.fab-btn[data-label]::after {
  top: auto;
  bottom: calc(100% + 10px);
  left: auto;
  right: 0;
  transform: translateY(2px);
}

.fab-btn[data-label]:hover::after,
.fab-btn[data-label]:focus-visible::after {
  transform: translateY(0);
}

.shortcuts-visible .fab-btn[data-shortcut]::after {
  content: attr(data-shortcut);
  background: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  opacity: 1;
  transform: translateY(0);
}

.fab-btn.fab-open::after {
  display: none;
}

.fab-container {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 100;
}

.fab-menu {
  position: absolute;
  bottom: 58px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fab-menu-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.625rem 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.fab-menu-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

.fab-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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

.new-user-whitelist {
  grid-column: 1 / -1;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid #dbe2ea;
  border-radius: 6px;
  background: #fff;
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.user-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.user-card.disabled {
  opacity: 0.62;
  background: #f8fafc;
}

.user-card .user-row {
  border: none;
  padding: 0;
  border-radius: 0;
}

.user-whitelist-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.user-whitelist-input {
  flex: 1;
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  padding: 0.25rem 0.45rem;
  border: 1px solid #dbe2ea;
  border-radius: 6px;
  background: #fff;
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
  color: var(--text-muted);
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

.mcp-limit-settings {
  border: 1px solid #e8eaed;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  margin: 0.75rem 0;
  background: #fafafa;
}

.mcp-limit-settings h3 {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
}

.mcp-limit-settings .mcp-hint {
  margin: 0.2rem 0 0.5rem;
}

.mcp-limit-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
}

.mcp-limit-form label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1 1 190px;
  color: #3c4043;
  font-size: 0.75rem;
}

.mcp-limit-form input {
  padding: 0.4rem 0.55rem;
  border: 1px solid #dadce0;
  border-radius: 5px;
  font-size: 0.85rem;
  background: #fff;
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
  color: var(--text-muted);
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

@media (max-width: 820px) {
  .account-name {
    display: none;
  }

  .account-btn {
    padding: 0.2rem;
  }

  .header-right {
    gap: 0.2rem;
  }
}

@media (max-width: 620px) {
  .sync-status {
    display: none;
  }

  .brand h1 {
    font-size: 1.05rem;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }

  .header-inner {
    gap: 0.6rem;
  }
}

@media (max-width: 480px) {
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  .reconnect-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    justify-content: center;
  }

  .reconnect-btn span {
    display: none;
  }

  .brand h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
  }

  .header-inner {
    padding: 0.7rem 0.75rem;
    gap: 0.35rem;
  }
}

/* Viewport-driven chrome: the header, the page padding, and the floating
   action button all follow the window, so they stay on a media query. */
@media (max-width: 600px) {
  :root {
    --app-header-height: 63px;
  }

  .header-inner {
    padding: 0.75rem 1rem;
  }

  main {
    padding: 1rem;
  }

  .fab-btn {
    bottom: 1.5rem;
    right: 1.5rem;
    width: 42px;
    height: 42px;
  }
}

/* Stacked-layout breakpoint: measured against the workspace's content box,
   not the viewport. The matching rule for the sidebar itself lives in
   TagSidebar.vue and uses the same container and the same threshold;
   `tests/responsiveLayout.test.js` fails if the two ever drift apart. If
   they do, a width:100% sidebar lands inside a row .workspace and crushes
   the notes area. */
@container workspace (max-width: 600px) {
  .workspace {
    flex-direction: column;
    /* Stacked children must fill the row width (default flex-start shrinks
       them to min-content and misaligns/overflows at very narrow widths). */
    align-items: stretch;
  }
}

/* There is deliberately no column-count rule for the notes grid. The column
   count is derived from the measured grid width by `dashboardColumnCount()`
   and applied as an inline style, so it already follows the container and
   not the viewport. */

/* ── Reduced motion ──────────────────────────────────────────────────
   Spatial motion is opt-in: the keyframe animations and the transform
   part of each transition are declared here instead of in the base rules,
   so a user who asks for reduced motion simply does not get them. Colour,
   opacity, filter, box-shadow, and border-radius transitions stay in the
   base rules because they do not move anything. */
@media (prefers-reduced-motion: no-preference) {
  .sync-status.connecting .sync-dot {
    animation: sync-pulse 1.4s ease-in-out infinite;
  }
  .note-preview-skeleton span {
    animation: note-skeleton-shimmer 1.4s ease-in-out infinite;
  }
  .confirm-modal {
    animation: slideUp 0.2s ease-out;
  }
  .modal-overlay {
    animation: fadeIn 0.2s ease-out;
  }
  .note-form-modal {
    animation: slideUp 0.2s ease-out;
  }
  .presence-dot::after {
    animation: presence-pulse 2s ease-out infinite;
  }
  .selection-bar {
    animation: fadeIn 0.2s ease-out;
  }
  .fab-menu {
    animation: slideUp 0.15s ease-out;
  }
  .auth-box button {
    transition: filter 0.15s, transform 0.15s;
  }
  .icon-btn {
    transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
  }
  .fab-btn[data-label]::after {
    transition: opacity 0.12s ease, transform 0.12s ease;
  }
  button[data-shortcut]:not(.icon-btn):not(.fab-btn):not(.md-tool-btn):not(.note-editor-toolbar button)::after {
    transition: opacity 0.12s ease, transform 0.12s ease;
  }
  :where(.note-card) {
    transition: box-shadow 0.2s, border-color 0.2s, background-color 0.2s, transform 0.2s;
  }
  .note-color-option {
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .fab-btn {
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-radius 0.18s ease;
  }
  .fab-btn svg {
    transition: transform 0.2s ease;
  }
  .fab-menu-item {
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }
}
</style>
