<template>
  <div class="graph-overlay" @mousedown.self="$emit('close')">
    <div class="graph-panel">
      <div class="graph-header">
        <h2>🕸 Relationship graph</h2>
        <div class="graph-controls">
          <label>
            Depth
            <select :value="depth" @change="$emit('refresh', { depth: Number($event.target.value), includeUnresolved })">
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </label>
          <label class="graph-check">
            <input
              type="checkbox"
              :checked="includeUnresolved"
              @change="$emit('refresh', { depth, includeUnresolved: $event.target.checked })"
            >
            Unresolved
          </label>
          <button type="button" :data-shortcut="shortcut('graphRefresh')" @click="$emit('refresh', { depth, includeUnresolved })">↻ Refresh</button>
          <button type="button" class="graph-close" :data-shortcut="shortcut('graphClose')" @click="$emit('close')">×</button>
        </div>
      </div>
      <p v-if="loading" class="graph-loading">Loading graph…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <GraphCanvas
        v-else
        :nodes="nodes"
        :edges="edges"
        :center="center"
        @open="$emit('open', $event.id)"
      />
      <p v-if="!loading && !error && nodes.length === 0" class="graph-empty">
        No relationships yet. Add <code>[[Another note]]</code> to a note.
      </p>
    </div>
  </div>
</template>

<script>
import GraphCanvas from './GraphCanvas.vue'
import { SHORTCUTS, shortcutLabel } from '../shared/shortcuts.js'

export default {
  name: 'GraphView',
  components: { GraphCanvas },
  props: {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    center: { type: String, default: null },
    depth: { type: Number, default: 1 },
    includeUnresolved: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    modKey: { type: String, default: 'Ctrl' }
  },
  emits: ['close', 'refresh', 'open'],
  methods: {
    shortcut(id) {
      return shortcutLabel(SHORTCUTS[id], this.modKey)
    }
  }
}
</script>

<style scoped>
.graph-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(32, 33, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.graph-panel {
  width: min(var(--graph-width, 1100px), 96vw);
  height: min(var(--graph-height, 760px), 92vh);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.graph-header h2 {
  font-size: 1rem;
  margin: 0;
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: #5f6368;
}

.graph-controls select,
.graph-controls button {
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  border-radius: 5px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.graph-check {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.graph-close {
  font-size: 1.1rem;
  line-height: 1;
}

.graph-loading,
.graph-empty {
  color: #80868b;
  text-align: center;
  padding: 2rem;
  font-size: 0.85rem;
}

.graph-panel :deep(.graph-canvas) {
  flex: 1;
}
</style>
