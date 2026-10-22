<template>
  <aside class="tag-sidebar">
    <div class="tag-sidebar-header">
      <h3>🏷 Tags</h3>
      <button type="button" class="tag-sidebar-close" :data-shortcut="shortcut('tagClose')" @click="$emit('close')" title="Close tags">×</button>
    </div>

    <button
      type="button"
      class="tag-row tag-row-root"
      :class="{ active: !activeTag && !untaggedOnly }"
      :data-shortcut="shortcut('tagAll')"
      @click="$emit('select', { tag: null })"
    >
      <span class="tag-name">All notes</span>
      <span class="tag-count">{{ tree.totalNotes || 0 }}</span>
    </button>

    <button
      type="button"
      class="tag-row tag-row-root"
      :class="{ active: untaggedOnly }"
      :data-shortcut="shortcut('tagUntagged')"
      @click="$emit('select', { tag: '__untagged__' })"
    >
      <span class="tag-name">Untagged</span>
      <span class="tag-count">{{ tree.untaggedCount || 0 }}</span>
    </button>

    <div v-if="flatTags.length" class="tag-tree">
      <div
        v-for="node in flatTags"
        :key="node.tag"
        class="tag-row"
        :class="{ active: activeTag === node.tag }"
        @click="$emit('select', { tag: node.tag })"
      >
        <button
          v-if="node.hasChildren"
          type="button"
          class="tag-toggle"
          @click.stop="toggle(node.tag)"
          :title="collapsed.has(node.tag) ? 'Expand' : 'Collapse'"
        >{{ collapsed.has(node.tag) ? '▸' : '▾' }}</button>
        <span v-else class="tag-leaf-icon"><AppIcon name="tag" :size="12" /></span>
        <span class="tag-name">{{ node.name }}</span>
        <span class="tag-count" :title="node.direct + ' direct / ' + node.total + ' including children'">{{ node.total }}</span>
      </div>
    </div>
    <p v-else class="tag-empty">No tags yet. Type #tag in a note.</p>
  </aside>
</template>

<script>
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { SHORTCUTS, shortcutLabel } from '../shared/shortcuts.js'

export default {
  name: 'TagSidebar',
  components: { AppIcon },
  props: {
    tree: { type: Object, default: () => ({ tags: [], totalNotes: 0, untaggedCount: 0 }) },
    activeTag: { type: String, default: null },
    untaggedOnly: { type: Boolean, default: false },
    modKey: { type: String, default: 'Ctrl' }
  },
  emits: ['select', 'close'],
  setup(props) {
    const collapsed = ref(new Set())
    const shortcut = (id) => shortcutLabel(SHORTCUTS[id], props.modKey)

    function walk(nodes, depth, out) {
      for (const node of nodes) {
        out.push({
          tag: node.tag,
          name: node.name,
          direct: node.direct,
          total: node.total,
          depth,
          hasChildren: Array.isArray(node.children) && node.children.length > 0
        })
        if (node.children?.length && !collapsed.value.has(node.tag)) {
          walk(node.children, depth + 1, out)
        }
      }
      return out
    }

    const flatTags = computed(() => walk(props.tree?.tags || [], 0, []))

    function toggle(tag) {
      const next = new Set(collapsed.value)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      collapsed.value = next
    }

    return { collapsed, flatTags, toggle, shortcut }
  }
}
</script>

<style scoped>
.tag-sidebar {
  width: 230px;
  flex-shrink: 0;
  border-right: 1px solid #e8eaed;
  background: #fafafa;
  padding: 0.75rem 0.5rem;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100vh - 90px);
  position: sticky;
  top: 80px;
  align-self: flex-start;
  border-radius: 8px;
  margin-right: 1rem;
}

.tag-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.35rem 0.5rem;
  border-bottom: 1px solid #ededed;
  margin-bottom: 0.4rem;
}

.tag-sidebar-header h3 {
  margin: 0;
  font-size: 0.85rem;
  color: #202124;
}

.tag-sidebar-close {
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.1rem;
  cursor: pointer;
}

.tag-row {
  width: 100%;
  border: none;
  background: transparent;
  color: #3c4043;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.4rem;
  border-radius: 5px;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}

.tag-row:hover {
  background: #f1f3f4;
}

.tag-row.active {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.tag-row-root {
  padding-left: 0.4rem;
}

.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-count {
  color: #80868b;
  font-size: 0.7rem;
  background: #f1f3f4;
  border-radius: 999px;
  padding: 0.05rem 0.35rem;
}

.tag-row.active .tag-count {
  background: #d2e3fc;
  color: #1a73e8;
}

.tag-toggle {
  width: 1rem;
  border: none;
  background: transparent;
  color: #80868b;
  cursor: pointer;
  padding: 0;
  font-size: 0.7rem;
}

.tag-leaf-icon {
  width: 1rem;
  flex: 0 0 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #80868b;
}

.tag-tree {
  margin-top: 0.35rem;
}

.tag-empty {
  color: #80868b;
  font-size: 0.75rem;
  padding: 0.5rem 0.4rem;
}

@media (max-width: 720px) {
  .tag-sidebar {
    width: 100%;
    position: static;
    max-height: none;
    margin-right: 0;
    margin-bottom: 0.75rem;
  }
}
</style>
