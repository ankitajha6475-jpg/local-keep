<template>
  <div class="backlinks-overlay" @mousedown.self="$emit('close')">
    <div class="backlinks-panel">
      <div class="backlinks-header">
        <h3>🔗 Backlinks</h3>
        <button type="button" class="backlinks-close" @click="$emit('close')">×</button>
      </div>
      <p v-if="loading" class="backlinks-empty">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <p v-else-if="backlinks.length === 0" class="backlinks-empty">
        No other note links here yet.
      </p>
      <div v-else class="backlinks-list">
        <button
          v-for="link in backlinks"
          :key="link.id"
          type="button"
          class="backlink-item"
          @click="$emit('open', link.sourceNoteId)"
        >
          <span class="backlink-title">{{ link.sourceDisplayTitle || link.sourceTitle || 'Untitled' }}</span>
          <span class="backlink-meta">
            {{ link.sourceType === 'canvas' ? 'Whiteboard' : 'Note' }}
            <template v-if="link.sourceUpdatedAt"> · {{ formatDate(link.sourceUpdatedAt) }}</template>
          </span>
          <span v-if="link.context" class="backlink-context">{{ link.context }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BacklinksPanel',
  props: {
    backlinks: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' }
  },
  emits: ['close', 'open'],
  setup() {
    function formatDate(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString()
    }
    return { formatDate }
  }
}
</script>

<style scoped>
.backlinks-overlay {
  position: absolute;
  inset: 0;
  z-index: 22;
  background: rgba(32, 33, 36, 0.32);
  border-radius: 12px;
  display: flex;
  padding: 1rem;
}

.backlinks-panel {
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  background: #fff;
  border-radius: 10px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.backlinks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.backlinks-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.backlinks-close {
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.2rem;
  cursor: pointer;
}

.backlinks-empty {
  color: #80868b;
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem;
}

.backlinks-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.backlink-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-align: left;
  border: 1px solid #ededed;
  background: #fff;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
}

.backlink-item:hover {
  background: #f8fafd;
  border-color: #d2e3fc;
}

.backlink-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #202124;
}

.backlink-meta {
  font-size: 0.7rem;
  color: #80868b;
}

.backlink-context {
  font-size: 0.75rem;
  color: #5f6368;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
