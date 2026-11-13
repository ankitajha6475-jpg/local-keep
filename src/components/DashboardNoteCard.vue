<template>
  <div
    class="note-card"
    :class="[
      {
        editing,
        selected,
        'canvas-note': note.type === 'canvas',
        archived: !!note.archivedAt,
        'shortcut-tips-card': note.isQuickShortcuts,
        'draft-card': note.isDraft,
        'note-card-loading': isHydrating
      },
      note.color ? `note-color-${note.color}` : ''
    ]"
    @click="$emit('open', note)"
  >
    <!-- Toolbar row: checkbox + color + copy + delete -->
    <div class="card-toolbar">
      <template v-if="!note.isQuickShortcuts && !note.isDraft && dashboardTab === 'notes'">
        <div class="card-checkbox-container" @click.stop>
          <input
            type="checkbox"
            :checked="selected"
            @change="$emit('toggle-select', note.id)"
            class="card-checkbox"
          >
        </div>
        <div class="card-color-picker" @click.stop>
          <button
            type="button"
            class="card-color-btn"
            :class="`card-color-btn--${note.color || 'default'}`"
            :aria-label="`Note color: ${noteColorLabel(note.color)}`"
            :title="`Note color: ${noteColorLabel(note.color)}`"
            @click="$emit('toggle-color', note.id)"
          >
            <AppIcon name="palette" :size="15" />
          </button>
          <div
            v-if="colorMenuOpen"
            class="note-color-menu"
            role="group"
            aria-label="Choose note color"
          >
            <button
              v-for="option in noteColorOptions"
              :key="option.id || 'default'"
              type="button"
              class="note-color-option"
              :class="[
                `note-color-option--${option.id || 'default'}`,
                { selected: (note.color || null) === (option.id || null) }
              ]"
              :title="option.label"
              :aria-label="option.label"
              :aria-pressed="(note.color || null) === (option.id || null)"
              @click="$emit('select-color', { note, color: option.id })"
            >
              <AppIcon
                v-if="(note.color || null) === (option.id || null)"
                name="check"
                :size="13"
                :stroke-width="2.4"
              />
            </button>
          </div>
        </div>
      </template>
      <div class="toolbar-spacer"></div>
      <template v-if="!note.isQuickShortcuts && !note.isDraft">
        <!-- Copy button (text notes only) -->
        <button
          v-if="note.type !== 'canvas' && !note.archivedAt"
          @click.stop="$emit('copy', note)"
          class="copy-btn"
          :class="{ copied }"
          :title="copied ? 'Copied!' : 'Copy note'"
          :aria-label="copied ? 'Copied' : 'Copy note'"
        >
          <svg v-if="copied" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button
          v-if="note.archivedAt"
          @click.stop="$emit('restore', note)"
          class="restore-btn"
          title="Restore archived note"
        >Restore</button>
        <button
          v-else
          @click.stop="$emit('archive', note.id)"
          class="delete-btn"
          title="Archive note"
          aria-label="Archive note"
        >×</button>
      </template>
    </div>

    <!-- The presence dot is a direct child of the card, not of `.note-content`:
         the card body uses `content-visibility: auto`, and its paint and
         layout containment would otherwise become the containing block for
         this absolutely positioned element and move the dot. -->
    <span
      v-if="!note.isQuickShortcuts && !note.isDraft && presenceCount"
      class="presence-dot"
      :title="presenceTitle"
      :aria-label="presenceTitle"
    ></span>

    <div class="note-content">
      <template v-if="note.isQuickShortcuts || note.isDraft">
        <h3 :title="note.title">
          <span class="card-title-text">{{ note.title }}</span>
          <span v-if="note.isDraft" class="revision-badge draft-badge">Draft</span>
        </h3>
        <MarkdownView
          class="note-preview"
          :html="renderContent(note.content)"
        />
        <small v-if="note.isDraft" class="note-date">
          Draft · {{ formatDate(note.updatedAt) }}
        </small>
      </template>
      <template v-else>
        <!-- Canvas note: show thumbnail -->
        <div v-if="note.type === 'canvas'" class="canvas-thumbnail-wrapper">
          <img
            v-if="note.thumbnail"
            :src="note.thumbnail"
            class="canvas-thumbnail"
            :alt="`Canvas thumbnail of ${displayTitle}`"
            loading="lazy"
            decoding="async"
          />
          <div v-else class="canvas-thumbnail-placeholder">
            <span>✏️</span>
            <span>Whiteboard</span>
          </div>
        </div>
        <h3 :title="displayTitle">
          <span class="card-title-text">{{ displayTitle }}</span>
          <span v-if="note.archivedAt" class="revision-badge">Archived</span>
          <span v-if="hasDraft" class="revision-badge draft-badge">Draft</span>
        </h3>
        <div v-if="note.tags && note.tags.length" class="card-tags">
          <button
            v-for="tag in note.tags"
            :key="tag"
            type="button"
            class="tag-chip"
            @click.stop="$emit('select-tag', { tag })"
            :title="'Filter by #' + tag"
          >#{{ tag }}</button>
        </div>
        <div v-if="note.type === 'chat' && !isHydrating" class="chat-card-preview">
          <div class="chat-card-meta">
            <span class="chat-card-pill">
              <AppIcon name="message" :size="12" />
              <span>{{ chatPreview.count }} {{ chatPreview.count === 1 ? 'message' : 'messages' }}</span>
            </span>
          </div>
          <div v-if="chatPreview.recent.length" class="chat-card-messages">
            <div v-for="m in chatPreview.recent" :key="m.id" class="chat-card-msg">
              <strong class="chat-card-sender">{{ m.senderName || m.sender }}:</strong>
              <span class="chat-card-text">{{ m.text }}</span>
            </div>
          </div>
          <div v-else class="chat-card-empty">No messages yet. Click to chat.</div>
        </div>
        <div v-else-if="note.type === 'kanban' && !isHydrating" class="kanban-card-preview">
          <div class="kanban-card-meta">
            <span class="kanban-card-pill">
              <AppIcon name="kanban" :size="12" />
              <span>{{ kanbanPreview.colCount }} cols · {{ kanbanPreview.cardCount }} cards</span>
            </span>
          </div>
          <div class="kanban-card-col-pills">
            <span v-for="c in kanbanPreview.columns" :key="c.id" class="kanban-card-col-pill">
              {{ c.title }}: {{ c.count }}
            </span>
          </div>
        </div>
        <MarkdownView
          v-else-if="note.type !== 'canvas' && !isHydrating"
          class="note-preview"
          :html="renderContent(note.content)"
          @click="$emit('content-click', $event, note)"
        />
        <div v-else-if="note.type !== 'canvas'" class="note-preview note-preview-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <small class="note-date">{{ formatDate(note.updatedAt) }}</small>
      </template>
    </div>
  </div>
</template>

<script>
import MarkdownView from './MarkdownView.vue'
import AppIcon from './AppIcon.vue'
import { getDisplayTitle } from '../utils/notes.js'
import { NOTE_COLOR_OPTIONS, noteColorLabel } from '../shared/noteColors.js'

export default {
  name: 'DashboardNoteCard',
  components: { MarkdownView, AppIcon },
  props: {
    entry: { type: Object, required: true },
    detail: { type: Object, default: null },
    dashboardTab: { type: String, default: 'notes' },
    selected: { type: Boolean, default: false },
    editing: { type: Boolean, default: false },
    hasDraft: { type: Boolean, default: false },
    copied: { type: Boolean, default: false },
    colorMenuOpen: { type: Boolean, default: false },
    presenceCount: { type: Number, default: 0 },
    presenceTitle: { type: String, default: '' },
    renderContent: { type: Function, required: true },
    formatDate: { type: Function, required: true }
  },
  emits: [
    'open', 'toggle-select', 'toggle-color', 'select-color', 'copy',
    'restore', 'archive', 'select-tag', 'content-click'
  ],
  data() {
    return { noteColorOptions: NOTE_COLOR_OPTIONS }
  },
  computed: {
    note() {
      return this.detail ? { ...this.detail, ...this.entry } : this.entry
    },
    isHydrating() {
      return !this.entry.isQuickShortcuts && !this.entry.isDraft && !this.detail
    },
    displayTitle() {
      const note = this.note
      const fallback = note.type === 'canvas' ? 'Untitled Whiteboard' : (note.type === 'chat' ? 'Untitled Chat' : (note.type === 'kanban' ? 'Untitled Kanban' : 'Untitled'))
      if ((note.title || '').trim()) return note.title.trim()
      // The index stores a content-derived display title, so titleless cards
      // keep their label while their body is still hydrating.
      if (note.displayTitle && note.displayTitle !== 'Untitled') return note.displayTitle
      return getDisplayTitle(note, { fallback })
    },
    chatPreview() {
      if (this.note.type !== 'chat') return { count: 0, recent: [] }
      try {
        const raw = this.note.content || ''
        const body = raw.replace(/^---[\s\S]*?---\n*/, '').trim()
        if (body.startsWith('{')) {
          const data = JSON.parse(body)
          const messages = Array.isArray(data.messages) ? data.messages : []
          return {
            count: messages.length,
            recent: messages.slice(-2)
          }
        }
      } catch (_) {}
      return { count: 0, recent: [] }
    },
    kanbanPreview() {
      if (this.note.type !== 'kanban') return { colCount: 0, cardCount: 0, columns: [] }
      try {
        const raw = this.note.content || ''
        const body = raw.replace(/^---[\s\S]*?---\n*/, '').trim()
        if (body.startsWith('{')) {
          const data = JSON.parse(body)
          const columns = Array.isArray(data.columns) ? data.columns : []
          const cards = Array.isArray(data.cards) ? data.cards : []
          return {
            colCount: columns.length,
            cardCount: cards.length,
            columns: columns.map(col => ({
              id: col.id,
              title: col.title,
              count: cards.filter(c => c.columnId === col.id).length
            }))
          }
        }
      } catch (_) {}
      return { colCount: 0, cardCount: 0, columns: [] }
    }
  },
  methods: { noteColorLabel }
}
</script>
