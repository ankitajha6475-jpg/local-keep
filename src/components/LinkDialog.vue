<template>
  <div
    class="link-dialog-overlay"
    @mousedown.self="$emit('close')"
    @keydown.esc.stop.prevent="$emit('close')"
  >
    <div
      class="link-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="mode === 'wiki' ? 'Add wiki link' : 'Add link'"
    >
      <div class="link-dialog-header">
        <h3>{{ mode === 'wiki' ? '🔗 Add wiki link' : '🔗 Add link' }}</h3>
        <button type="button" class="link-dialog-close" title="Close (Esc)" :data-shortcut="shortcut('closeDialog')" @click="$emit('close')">×</button>
      </div>

      <div v-if="mode === 'link'" class="link-dialog-form">
        <label>
          Text
          <input ref="textInput" v-model="text" type="text" placeholder="Link text" required @keydown.enter.prevent="submitLink">
        </label>
        <label>
          URL
          <input ref="urlInput" v-model="url" type="text" placeholder="https://example.com" required @keydown.enter.prevent="submitLink">
        </label>
        <p class="link-dialog-hint">Markdown: <code>[text](url)</code></p>
        <div class="link-dialog-actions">
          <button type="button" class="link-dialog-cancel" :data-shortcut="shortcut('cancelDialog')" @click="$emit('close')">Cancel</button>
          <button type="button" class="link-dialog-submit" :data-shortcut="shortcut('submitDialog')" :disabled="!canSubmitLink" @click="submitLink">
            Insert link
          </button>
        </div>
      </div>

      <div v-else class="link-dialog-form">
        <label class="link-search-label">
          Search notes
          <input
            ref="queryInput"
            v-model="query"
            type="text"
            placeholder="Start typing a note title…"
            autocomplete="off"
            @input="onQueryInput"
            @keydown.down.prevent="moveHighlight(1)"
            @keydown.up.prevent="moveHighlight(-1)"
            @keydown.enter.prevent="submitWiki"
          >
        </label>
        <p class="link-dialog-hint">
          Pick a note or link to a new title. Selected text becomes the display label.
        </p>

        <p v-if="loading" class="link-dialog-status">Searching…</p>
        <p v-else-if="error" class="link-dialog-error">{{ error }}</p>
        <p v-else-if="options.length === 0" class="link-dialog-status">
          No matching notes. Type a title to create a new wiki link.
        </p>
        <div v-else class="link-result-list" role="listbox" aria-label="Matching notes">
          <button
            v-for="(option, index) in options"
            :key="optionKey(option)"
            type="button"
            class="link-result"
            :class="{ active: index === highlight, 'link-result--new': option.__new }"
            role="option"
            :aria-selected="index === highlight"
            @mousedown.prevent
            @click="choose(option)"
          >
            <span class="link-result-title">{{ optionLabel(option) }}</span>
            <span class="link-result-meta">
              {{ option.__new ? 'New wiki link' : option.type === 'canvas' ? 'Whiteboard' : 'Note' }}
            </span>
          </button>
        </div>

        <div class="link-dialog-actions">
          <button type="button" class="link-dialog-cancel" :data-shortcut="shortcut('cancelDialog')" @click="$emit('close')">Cancel</button>
          <button
            type="button"
            class="link-dialog-submit"
            :data-shortcut="shortcut('submitDialog')"
            :disabled="!canSubmitWiki"
            @click="submitWiki"
          >
            Insert link
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { SHORTCUTS, shortcutLabel } from '../shared/shortcuts.js'

export default {
  name: 'LinkDialog',
  props: {
    mode: { type: String, default: 'link' }, // 'link' | 'wiki'
    initialText: { type: String, default: '' },
    searchNotes: { type: Function, required: true },
    modKey: { type: String, default: 'Ctrl' }
  },
  emits: ['close', 'submit'],
  data() {
    const hasText = !!String(this.initialText || '').trim()
    return {
      text: hasText ? this.initialText : 'link text',
      url: 'https://',
      query: this.initialText || '',
      results: [],
      loading: false,
      error: '',
      highlight: 0,
      searchTimer: null,
      searchSeq: 0
    }
  },
  computed: {
    trimmedQuery() {
      return String(this.query || '').trim()
    },
    canSubmitLink() {
      const url = this.url.trim()
      return !!this.text.trim() && !!url && url !== 'https://'
    },
    canSubmitWiki() {
      return !!this.trimmedQuery
    },
    options() {
      const options = [...this.results]
      const query = this.trimmedQuery
      if (query) {
        const lower = query.toLowerCase()
        const exact = this.results.some(result => {
          const title = String(result.displayTitle || result.title || '').trim().toLowerCase()
          return title === lower
        })
        if (!exact) {
          options.push({ __new: true, title: query, displayTitle: query, type: 'new' })
        }
      }
      return options
    }
  },
  mounted() {
    this.$nextTick(() => {
      if (this.mode === 'wiki') {
        this.focusAndSelect(this.$refs.queryInput)
        this.runSearch()
      } else if (String(this.initialText || '').trim()) {
        this.focusAndSelect(this.$refs.urlInput)
      } else {
        this.focusAndSelect(this.$refs.textInput)
      }
    })
  },
  beforeUnmount() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },
  methods: {
    shortcut(id) {
      return shortcutLabel(SHORTCUTS[id], this.modKey)
    },
    focusAndSelect(input) {
      if (!input) return
      input.focus()
      input.select?.()
    },
    onQueryInput() {
      this.highlight = 0
      this.results = []
      this.error = ''
      this.loading = true
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => this.runSearch(), 180)
    },
    async runSearch() {
      const seq = ++this.searchSeq
      this.loading = true
      this.error = ''
      try {
        const results = await this.searchNotes(this.trimmedQuery)
        if (seq !== this.searchSeq) return
        this.results = Array.isArray(results) ? results : []
        this.highlight = 0
      } catch (e) {
        if (seq !== this.searchSeq) return
        this.error = e.message || 'Search failed'
        this.results = []
      } finally {
        if (seq === this.searchSeq) this.loading = false
      }
    },
    moveHighlight(delta) {
      if (this.options.length === 0) return
      this.highlight = (this.highlight + delta + this.options.length) % this.options.length
    },
    optionKey(option) {
      return option.__new ? `new:${option.title}` : `note:${option.id}`
    },
    optionLabel(option) {
      if (option.__new) return `Link to new title “${option.title}”`
      return option.displayTitle || option.title || 'Untitled'
    },
    choose(option) {
      if (!option) return
      const label = String(this.initialText || '').trim() ||
        option.displayTitle || option.title || 'Untitled'
      if (option.__new) {
        this.$emit('submit', {
          mode: 'wiki',
          target: { title: option.title },
          label
        })
        return
      }
      this.$emit('submit', {
        mode: 'wiki',
        target: {
          noteId: option.id,
          title: option.displayTitle || option.title || 'Untitled'
        },
        label
      })
    },
    submitWiki() {
      if (!this.trimmedQuery) return
      const option = this.options[this.highlight]
      if (option) {
        this.choose(option)
        return
      }
      this.choose({ __new: true, title: this.trimmedQuery })
    },
    submitLink() {
      if (!this.canSubmitLink) return
      this.$emit('submit', {
        mode: 'link',
        text: this.text.trim(),
        url: this.url.trim()
      })
    }
  }
}
</script>

<style scoped>
.link-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 420;
  background: rgba(32, 33, 36, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: min(14vh, 7rem) 1rem 1rem;
}

.link-dialog {
  width: min(var(--link-dialog-width, 540px), 94vw);
  max-height: 72vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow: hidden;
}

.link-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #f1f3f4;
  padding-bottom: 0.55rem;
  margin-bottom: 0.75rem;
}

.link-dialog-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.link-dialog-close {
  border: none;
  background: transparent;
  color: #80868b;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.link-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  flex: 1 1 auto;
  min-height: 0;
}

.link-dialog-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #5f6368;
}

.link-dialog-form input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.65rem;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #202124;
}

.link-dialog-form input:focus {
  outline: none;
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.14);
}

.link-dialog-hint {
  margin: 0;
  font-size: 0.7rem;
  color: #80868b;
}

.link-dialog-hint code {
  background: #f1f3f4;
  border-radius: 3px;
  padding: 0.05rem 0.25rem;
}

.link-dialog-status,
.link-dialog-error {
  margin: 0;
  padding: 0.8rem;
  text-align: center;
  font-size: 0.8rem;
  color: #80868b;
}

.link-dialog-error {
  color: #c5221f;
}

.link-result-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding-right: 0.15rem;
}

.link-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  text-align: left;
  border: 1px solid #ededed;
  background: #fff;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
}

.link-result:hover,
.link-result.active {
  background: #f8fafd;
  border-color: #d2e3fc;
}

.link-result.active {
  box-shadow: inset 3px 0 0 #1a73e8;
}

.link-result--new {
  border-style: dashed;
}

.link-result-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #202124;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-result-meta {
  flex: 0 0 auto;
  font-size: 0.68rem;
  color: #80868b;
}

.link-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.15rem;
}

.link-dialog-cancel,
.link-dialog-submit {
  padding: 0.45rem 0.8rem;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}

.link-dialog-cancel {
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
}

.link-dialog-submit {
  border: 1px solid #1a73e8;
  background: #1a73e8;
  color: #fff;
}

.link-dialog-submit:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
