<template>
  <aside class="tag-sidebar">
    <div class="tag-sidebar-header">
      <h3>🏷 Tags</h3>
      <button type="button" class="tag-sidebar-close" :data-shortcut="shortcut('tagClose')" @click="$emit('close')" title="Close tags" aria-label="Close tags">×</button>
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
        <span class="tag-actions" v-if="editable">
          <button
            type="button"
            class="tag-action"
            title="Rename this tag path"
            @click.stop="startRename(node)"
          >✏️</button>
          <button
            type="button"
            class="tag-action"
            title="Move under another tag"
            aria-label="Move under another tag"
            @click.stop="startMove(node)"
          >📁</button>
          <button
            type="button"
            class="tag-action"
            title="Delete this tag path"
            aria-label="Delete this tag path"
            @click.stop="startDelete(node)"
          >🗑</button>
        </span>
      </div>
    </div>
    <p v-else class="tag-empty">No tags yet. Add tags from a note's properties panel.</p>

    <!-- Operable tree: rename / move / delete subtree. All are exact-path
         rewrites across every affected note's tags property. -->
    <div v-if="pending" class="tag-op">
      <div class="tag-op-title">
        {{ pending.kind === 'rename' ? 'Rename' : pending.kind === 'move' ? 'Move' : 'Delete' }}
        <code>{{ pending.node.tag }}</code>
      </div>

      <template v-if="pending.kind === 'delete'">
        <p class="tag-op-help">
          Removes this tag path and all <code>{{ pending.node.tag }}/*</code> from
          {{ pending.node.total }} note(s). Notes themselves are not deleted.
        </p>
      </template>

      <template v-else>
        <input
          ref="opInput"
          v-model="pending.value"
          class="tag-op-input"
          :placeholder="pending.kind === 'rename' ? 'New path (e.g. area/proj)' : 'New parent path (e.g. ops)'"
          @keydown.enter="onOpEnter"
        >
        <p class="tag-op-help">
          <template v-if="pending.kind === 'rename'">
            Rewrites <code>{{ pending.node.tag }}</code> and
            <code>{{ pending.node.tag }}/*</code>.
          </template>
          <template v-else>
            Re-roots <code>{{ pending.node.tag }}</code> under the given parent.
          </template>
        </p>
      </template>

      <div class="tag-op-actions">
        <button type="button" class="tag-op-confirm" @click="confirmOp">
          {{ pending.kind === 'delete' ? 'Delete' : 'Apply' }}
        </button>
        <button type="button" class="tag-op-cancel" @click="pending = null">Cancel</button>
      </div>
      <p v-if="pending.error" class="tag-op-error">{{ pending.error }}</p>
    </div>
  </aside>
</template>

<script>
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { SHORTCUTS, shortcutLabel } from '../shared/shortcuts.js'
import { runUnlessIme } from '../shared/ime.js'

export default {
  name: 'TagSidebar',
  components: { AppIcon },
  props: {
    tree: { type: Object, default: () => ({ tags: [], totalNotes: 0, untaggedCount: 0 }) },
    activeTag: { type: String, default: null },
    untaggedOnly: { type: Boolean, default: false },
    editable: { type: Boolean, default: true },
    modKey: { type: String, default: 'Ctrl' }
  },
  emits: ['select', 'close', 'changed', 'tag-op'],
  setup(props, { emit }) {
    const collapsed = ref(new Set())
    const pending = ref(null)
    const opInput = ref(null)
    const shortcut = (id) => shortcutLabel(SHORTCUTS[id], props.modKey)
    const editable = computed(() => props.editable !== false)

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

    function startRename(node) {
      pending.value = { kind: 'rename', node, value: node.tag, error: '' }
    }

    function startMove(node) {
      const parent = node.tag.includes('/')
        ? node.tag.slice(0, node.tag.lastIndexOf('/'))
        : ''
      pending.value = { kind: 'move', node, value: parent, error: '' }
    }

    function startDelete(node) {
      pending.value = { kind: 'delete', node, value: '', error: '' }
    }

    async function confirmOp() {
      const op = pending.value
      if (!op) return
      try {
        if (op.kind === 'delete') {
          await emit('tag-op', {
            kind: 'delete',
            from: op.node.tag,
            to: null
          })
        } else if (op.kind === 'rename') {
          const target = String(op.value || '').trim().replace(/^#+/, '')
          if (!target || target === op.node.tag) {
            op.error = 'Enter a different tag path.'
            return
          }
          await emit('tag-op', { kind: 'rename', from: op.node.tag, to: target })
        } else {
          const parent = String(op.value || '').trim().replace(/^#+/, '').replace(/\/+$/, '')
          const leaf = op.node.tag.slice(op.node.tag.lastIndexOf('/') + 1)
          const target = parent ? `${parent}/${leaf}` : leaf
          if (target === op.node.tag) {
            op.error = 'Already at that location.'
            return
          }
          await emit('tag-op', { kind: 'move', from: op.node.tag, to: target })
        }
        pending.value = null
        emit('changed')
      } catch (error) {
        op.error = error?.message || String(error)
      }
    }

    // Enter confirms the pending tag operation, but only when no IME owns the
    // keystroke — while an IME is composing, Enter confirms the candidate.
    function onOpEnter(event) {
      runUnlessIme(event, () => confirmOp())
    }

    return {
      collapsed,
      flatTags,
      toggle,
      shortcut,
      editable,
      pending,
      opInput,
      startRename,
      startMove,
      startDelete,
      confirmOp,
      onOpEnter
    }
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
  /* Track the measured sticky header height (--app-header-height is set at
     runtime; keep the fallback in sync with App.vue's :root value). */
  max-height: calc(100vh - var(--app-header-height, 66px) - 1.5rem);
  position: sticky;
  top: calc(var(--app-header-height, 66px) + 0.5rem);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
}

.tag-tree {
  margin-top: 0.35rem;
}

.tag-empty {
  color: var(--text-muted);
  font-size: 0.75rem;
  padding: 0.5rem 0.4rem;
}

/* Per-row operable controls: shown on hover, always keyboard reachable. */
.tag-actions {
  display: inline-flex;
  gap: 0.125rem;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.12s ease-in-out;
}

.tag-row:hover .tag-actions,
.tag-row:focus-within .tag-actions {
  opacity: 1;
}

.tag-action {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0 0.125rem;
  font-size: 0.6875rem;
  line-height: 1;
  border-radius: 3px;
}

.tag-action:hover {
  background: rgba(0, 0, 0, 0.08);
}

.tag-op {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #e8eaed;
  border-radius: 6px;
  background: #fff;
}

.tag-op-title {
  font-size: 0.75rem;
  margin-bottom: 0.375rem;
}

.tag-op-title code {
  font-size: 0.6875rem;
  background: rgba(0, 0, 0, 0.06);
  padding: 0 0.25rem;
  border-radius: 3px;
}

.tag-op-input {
  width: 100%;
  padding: 0.25rem 0.375rem;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-bottom: 0.375rem;
}

.tag-op-help {
  color: var(--text-muted);
  font-size: 0.6875rem;
  line-height: 1.4;
  margin-bottom: 0.375rem;
}

.tag-op-help code {
  font-size: 0.625rem;
  background: rgba(0, 0, 0, 0.06);
  padding: 0 0.25rem;
  border-radius: 3px;
}

.tag-op-actions {
  display: flex;
  gap: 0.375rem;
}

.tag-op-confirm,
.tag-op-cancel {
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.tag-op-confirm {
  background: #1a73e8;
  border-color: #1a73e8;
  color: #fff;
}

.tag-op-error {
  color: #d93025;
  font-size: 0.6875rem;
  margin-top: 0.375rem;
}

/* Stacked layout: measured against the workspace's content box, not the
   viewport. The matching rule for the workspace itself lives in App.vue and
   uses the same container and the same threshold;
   `tests/responsiveLayout.test.js` fails if the two ever drift apart. If
   they do, a width:100% sidebar lands inside a row .workspace and crushes
   the notes area. */
@container workspace (max-width: 600px) {
  .tag-sidebar {
    width: 100%;
    position: static;
    max-height: none;
    margin-right: 0;
    margin-bottom: 0.75rem;
    border-right: none;
    border-bottom: 1px solid #e8eaed;
  }
}
</style>
