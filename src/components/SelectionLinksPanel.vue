<template>
  <div class="links-overlay" @mousedown.self="$emit('close')">
    <div class="links-panel">
      <div class="links-header">
        <div>
          <h2>🔗 Links in selection</h2>
          <p class="links-subtitle">
            {{ selectedCount }} selected {{ selectedCount === 1 ? 'note' : 'notes' }}
            <template v-if="!loading && !error">
              · {{ summary.outgoing.length }} {{ summary.outgoing.length === 1 ? 'target' : 'targets' }}
              · {{ summary.incoming.length }} {{ summary.incoming.length === 1 ? 'source' : 'sources' }}
            </template>
          </p>
        </div>
        <div class="links-modes" role="group" aria-label="Link direction">
          <button
            type="button"
            :class="{ active: mode === 'both' }"
            :data-shortcut="shortcut('linksBoth')"
            @click="$emit('update:mode', 'both')"
          >Both</button>
          <button
            type="button"
            :class="{ active: mode === 'outgoing' }"
            :data-shortcut="shortcut('linksOutgoing')"
            @click="$emit('update:mode', 'outgoing')"
          >Links to</button>
          <button
            type="button"
            :class="{ active: mode === 'incoming' }"
            :data-shortcut="shortcut('linksIncoming')"
            @click="$emit('update:mode', 'incoming')"
          >Linked from</button>
        </div>
        <button type="button" class="links-close" title="Close" :data-shortcut="shortcut('linksClose')" @click="$emit('close')">×</button>
      </div>

      <p v-if="loading" class="links-empty">Loading links…</p>
      <p v-else-if="error" class="error links-error">{{ error }}</p>
      <div v-else class="links-columns" :class="{ 'links-columns--single': mode !== 'both' }">
        <section v-if="mode !== 'incoming'" class="links-section">
          <h3>
            Links to
            <span class="links-count">{{ summary.outgoing.length }}</span>
          </h3>
          <p v-if="summary.outgoing.length === 0" class="links-empty">
            {{ emptyOutgoing }}
          </p>
          <div v-else class="links-list">
            <button
              v-for="entry in summary.outgoing"
              :key="outgoingKey(entry)"
              type="button"
              class="links-row"
              :class="{ 'links-row--muted': !entry.targetNoteId || entry.archived }"
              :disabled="!entry.targetNoteId || entry.archived"
              @click="openOutgoing(entry)"
            >
              <span class="links-row-title">
                {{ noteTitle(entry) }}
                <span v-if="entry.archived" class="links-chip links-chip--archived">archived</span>
                <span v-if="isInSelection(entry.targetNoteId)" class="links-chip links-chip--selected">selected</span>
                <span v-if="entry.status && entry.status !== 'ok' && entry.status !== 'archived'" class="links-chip links-chip--status">{{ entry.status }}</span>
                <span v-if="entry.type === 'canvas'" class="links-chip links-chip--canvas">whiteboard</span>
              </span>
              <span class="links-row-meta">{{ viaLabel(entry.links) }}</span>
              <span v-if="firstContext(entry)" class="links-row-context">{{ firstContext(entry) }}</span>
            </button>
          </div>
        </section>

        <section v-if="mode !== 'outgoing'" class="links-section">
          <h3>
            Linked from
            <span class="links-count">{{ summary.incoming.length }}</span>
          </h3>
          <p v-if="summary.incoming.length === 0" class="links-empty">
            {{ emptyIncoming }}
          </p>
          <div v-else class="links-list">
            <button
              v-for="entry in summary.incoming"
              :key="entry.sourceNoteId"
              type="button"
              class="links-row"
              :class="{ 'links-row--muted': entry.archived }"
              :disabled="entry.archived"
              @click="$emit('open', entry.sourceNoteId)"
            >
              <span class="links-row-title">
                {{ noteTitle(entry) }}
                <span v-if="entry.archived" class="links-chip links-chip--archived">archived</span>
                <span v-if="isInSelection(entry.sourceNoteId)" class="links-chip links-chip--selected">selected</span>
                <span v-if="entry.sourceType === 'canvas'" class="links-chip links-chip--canvas">whiteboard</span>
              </span>
              <span class="links-row-meta">
                {{ entry.links.length }} link{{ entry.links.length === 1 ? '' : 's' }} to the selection
                <template v-if="entry.sourceUpdatedAt"> · {{ formatDate(entry.sourceUpdatedAt) }}</template>
              </span>
              <span v-if="firstContext(entry)" class="links-row-context">{{ firstContext(entry) }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import { SHORTCUTS, shortcutLabel } from '../shared/shortcuts.js'

export default {
  name: 'SelectionLinksPanel',
  props: {
    summary: {
      type: Object,
      default: () => ({ noteIds: [], outgoing: [], incoming: [] })
    },
    selectedCount: { type: Number, default: 0 },
    selectedIds: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    mode: { type: String, default: 'both' },
    modKey: { type: String, default: 'Ctrl' }
  },
  emits: ['close', 'open', 'update:mode'],
  computed: {
    emptyOutgoing() {
      return this.mode === 'both'
        ? 'These notes do not link to any other notes.'
        : 'No outgoing links.'
    },
    emptyIncoming() {
      return this.mode === 'both'
        ? 'No notes link to this selection.'
        : 'No backlinks.'
    }
  },
  setup(props) {
    function noteTitle(entry) {
      const display = entry.displayTitle || entry.sourceDisplayTitle
      const title = entry.title || entry.sourceTitle
      return display || title || 'Untitled'
    }

    function outgoingKey(entry) {
      return entry.targetNoteId || `${entry.status}:${entry.title}`
    }

    function viaLabel(links) {
      const titles = [...new Set((links || []).map(link =>
        link.sourceDisplayTitle || link.sourceTitle || 'Untitled'
      ))]
      if (titles.length === 0) return 'Linked from the selection'
      if (titles.length <= 3) return `via ${titles.join(', ')}`
      return `via ${titles[0]} +${titles.length - 1} more`
    }

    function firstContext(entry) {
      return (entry.links || []).find(link => link.context)?.context || ''
    }

    function isInSelection(noteId) {
      return !!noteId && props.selectedIds.includes(noteId)
    }

    function formatDate(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString()
    }

    return { noteTitle, outgoingKey, viaLabel, firstContext, isInSelection, formatDate }
  },
  methods: {
    shortcut(id) {
      return shortcutLabel(SHORTCUTS[id], this.modKey)
    },
    openOutgoing(entry) {
      if (!entry.targetNoteId || entry.archived) return
      this.$emit('open', entry.targetNoteId)
    }
  }
}
</script>

<style scoped>
.links-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(32, 33, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.links-panel {
  width: min(var(--links-panel-width, 1100px), 96vw);
  max-height: min(var(--links-panel-height, 780px), 92vh);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow: hidden;
}

.links-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.6rem;
  margin-bottom: 0.75rem;
}

.links-header h2 {
  font-size: 1rem;
  margin: 0;
}

.links-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: #80868b;
}

.links-modes {
  display: flex;
  margin-left: auto;
  border: 1px solid #dadce0;
  border-radius: 6px;
  overflow: hidden;
}

.links-modes button {
  border: none;
  border-right: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.links-modes button:last-child {
  border-right: none;
}

.links-modes button.active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.links-close {
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.15rem;
}

.links-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  overflow: hidden;
  min-height: 0;
  flex: 1;
}

.links-columns--single {
  grid-template-columns: minmax(0, 1fr);
}

.links-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #f1f3f4;
  border-radius: 8px;
  padding: 0.65rem;
  background: #fafbfc;
}

.links-section h3 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: #202124;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.links-count {
  background: #e8f0fe;
  color: #1a73e8;
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 0.05rem 0.45rem;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  min-height: 0;
  padding-right: 0.2rem;
}

.links-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  border: 1px solid #ededed;
  background: #fff;
  border-radius: 7px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
}

.links-row:hover:not(:disabled) {
  background: #f8fafd;
  border-color: #d2e3fc;
}

.links-row:disabled {
  cursor: default;
}

.links-row--muted {
  background: #fbfbfc;
}

.links-row-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #202124;
}

.links-chip {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border-radius: 999px;
  padding: 0.08rem 0.4rem;
  background: #f1f3f4;
  color: #5f6368;
}

.links-chip--archived {
  background: #fce8e6;
  color: #c5221f;
}

.links-chip--selected {
  background: #e6f4ea;
  color: #137333;
}

.links-chip--status {
  background: #fef7e0;
  color: #b06000;
}

.links-chip--canvas {
  background: #e8f0fe;
  color: #1a73e8;
}

.links-row-meta {
  font-size: 0.7rem;
  color: #80868b;
}

.links-row-context {
  font-size: 0.74rem;
  color: #5f6368;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links-empty {
  margin: 0;
  color: #80868b;
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem 0.5rem;
}

.links-error {
  padding: 1rem;
  text-align: center;
}

@media (max-width: 760px) {
  .links-columns {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .links-section {
    max-height: 45vh;
  }

  .links-header {
    flex-wrap: wrap;
  }

  .links-modes {
    margin-left: 0;
  }
}
</style>
