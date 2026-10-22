<template>
  <div class="md-tools" :class="{ 'shortcuts-visible': shortcutsVisible }" role="toolbar" aria-label="Markdown tools">
    <template v-for="(group, groupIndex) in groups" :key="group.id">
      <span v-if="groupIndex > 0" class="md-tool-group-divider" aria-hidden="true"></span>
      <div class="md-tool-group">
        <button
          v-for="tool in group.tools"
          :key="tool.id"
          type="button"
          class="md-tool-btn"
          :class="[tool.iconStyle && `md-tool-btn--${tool.iconStyle}`]"
          :data-label="tool.label"
          :data-shortcut="shortcutText(tool)"
          :aria-label="`${tool.label} (${shortcutText(tool)})`"
          @mousedown.prevent
          @click="$emit('command', tool.id)"
        >
          <span class="md-tool-icon">{{ tool.icon }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script>
import { EDITOR_TOOLS, EDITOR_TOOL_GROUPS } from '../shared/editorTools.js'

export default {
  name: 'MarkdownToolbar',
  props: {
    modKey: { type: String, default: 'Ctrl' },
    shortcutsVisible: { type: Boolean, default: false }
  },
  emits: ['command'],
  computed: {
    groups() {
      return EDITOR_TOOL_GROUPS.map(group => ({
        ...group,
        tools: EDITOR_TOOLS.filter(tool => tool.group === group.id)
      }))
    }
  },
  methods: {
    shortcutText(tool) {
      return tool.shortcut.replace('Mod', this.modKey)
    }
  }
}
</script>

<style scoped>
.md-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem;
  flex: 1 1 auto;
  min-width: 0;
}

.md-tool-group {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.md-tool-group-divider {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  margin: 0 0.2rem;
}

.md-tool-btn {
  position: relative;
  min-width: 30px;
  height: 30px;
  padding: 0 0.4rem;
  background: #f8f9fa;
  color: #3c4043;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}

.md-tool-btn:hover {
  background: #e8eaed;
  border-color: #c6cacd;
}

.md-tool-btn:active {
  background: #dadce0;
}

.md-tool-btn:focus-visible {
  outline: 2px solid #1a73e8;
  outline-offset: 1px;
}

.md-tool-icon {
  font-size: 0.82rem;
  line-height: 1;
  white-space: nowrap;
}

.md-tool-btn--bold .md-tool-icon {
  font-weight: 800;
}

.md-tool-btn--italic .md-tool-icon {
  font-style: italic;
  font-family: Georgia, serif;
}

.md-tool-btn--strike .md-tool-icon {
  text-decoration: line-through;
}

.md-tool-btn--code .md-tool-icon,
.md-tool-btn--small .md-tool-icon {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.7rem;
}

/* Tooltip: name normally, keyboard shortcut while Alt/Option is held. */
.md-tool-btn::after {
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

.md-tool-btn:hover::after,
.md-tool-btn:focus-visible::after {
  opacity: 1;
}

.md-tools.shortcuts-visible .md-tool-btn:hover::after,
.md-tools.shortcuts-visible .md-tool-btn:focus-visible::after {
  content: attr(data-shortcut);
  background: #1a73e8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
