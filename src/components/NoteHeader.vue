<template>
  <div class="note-universal-header" :class="[color ? `note-color-${color}` : '']">
    <div class="note-header-primary-row">
      <div class="note-header-title-wrap">
        <input
          ref="titleInput"
          :value="title"
          type="text"
          :placeholder="placeholder"
          class="note-header-title-input"
          :disabled="readOnly"
          @input="$emit('update:title', $event.target.value)"
          @change="$emit('change:title', $event.target.value)"
          @blur="$emit('blur:title')"
          @keydown.enter="onTitleEnter"
        />
        <span v-if="showVersion && revisionNo" class="note-header-version-badge" title="Current revision">
          v{{ revisionNo }}
        </span>
      </div>

      <div class="note-header-meta-actions">
        <!-- Color Picker -->
        <div v-if="showColor" class="card-color-picker" @click.stop>
          <button
            type="button"
            class="card-color-btn"
            :class="`card-color-btn--${color || 'default'}`"
            :aria-label="`Note color: ${colorLabel}`"
            :title="`Note color: ${colorLabel}`"
            :disabled="readOnly"
            @click="colorMenuOpen = !colorMenuOpen"
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
              v-for="opt in NOTE_COLOR_OPTIONS"
              :key="opt.id || 'default'"
              type="button"
              class="note-color-option"
              :class="[
                `note-color-option--${opt.id || 'default'}`,
                { selected: (color || null) === (opt.id || null) }
              ]"
              :title="opt.label"
              :aria-label="opt.label"
              :aria-pressed="(color || null) === (opt.id || null)"
              @click="setColor(opt.id)"
            >
              <AppIcon
                v-if="(color || null) === (opt.id || null)"
                name="check"
                :size="13"
                :stroke-width="2.4"
              />
            </button>
          </div>
        </div>

        <!-- Custom view actions -->
        <slot name="actions"></slot>
      </div>
    </div>

    <!-- Tag chips row -->
    <div v-if="showTags" class="note-header-tags-row">
      <div class="note-header-tag-chips">
        <span
          v-for="tag in tags"
          :key="tag"
          class="prop-chip"
        >
          #{{ tag }}
          <button
            v-if="!readOnly"
            type="button"
            class="prop-chip-remove"
            :aria-label="`Remove tag ${tag}`"
            @click="removeTag(tag)"
          >×</button>
        </span>

        <!-- Autocomplete input for adding tags -->
        <div v-if="!readOnly" class="note-header-tag-input-wrap">
          <input
            ref="tagInput"
            type="text"
            class="prop-chip-input"
            placeholder="Add tag…"
            autocomplete="off"
            role="combobox"
            :aria-expanded="tagSuggestOpen && tagSuggestions.length > 0"
            :aria-activedescendant="tagSuggestIndex >= 0 ? `tag-suggest-${tagSuggestIndex}` : undefined"
            aria-autocomplete="list"
            v-model="tagDraft"
            @input="onTagInput"
            @focus="onTagFocus"
            @blur="onTagBlur"
            @keydown.enter="onTagEnter"
            @keydown.,="onTagComma"
            @keydown.down="onTagArrow($event, 1)"
            @keydown.up="onTagArrow($event, -1)"
            @keydown.esc="onTagEscape"
          />
          <ul
            v-if="tagSuggestOpen && tagSuggestions.length"
            class="tag-suggestions"
            role="listbox"
            aria-label="Tag suggestions"
          >
            <li
              v-for="(suggestion, idx) in tagSuggestions"
              :id="`tag-suggest-${idx}`"
              :key="suggestion"
              role="option"
              class="tag-suggestion"
              :class="{ active: idx === tagSuggestIndex }"
              :aria-selected="idx === tagSuggestIndex"
              @mousedown.prevent="pickSuggestion(suggestion)"
              @mouseenter="tagSuggestIndex = idx"
            >
              <span class="tag-suggestion-path">#{{ suggestion }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { NOTE_COLOR_OPTIONS, noteColorLabel } from '../shared/noteColors.js'
import { matchTags, normalizeTag } from '../shared/tags.js'
import { isImeComposing } from '../shared/ime.js'

export default {
  name: 'NoteHeader',
  components: { AppIcon },
  props: {
    title: { type: String, default: '' },
    color: { type: String, default: null },
    tags: { type: Array, default: () => [] },
    revisionNo: { type: Number, default: null },
    knownTags: { type: Array, default: () => [] },
    placeholder: { type: String, default: 'Title...' },
    readOnly: { type: Boolean, default: false },
    showTags: { type: Boolean, default: true },
    showColor: { type: Boolean, default: true },
    showVersion: { type: Boolean, default: true }
  },
  emits: [
    'update:title',
    'change:title',
    'blur:title',
    'update:color',
    'update:tags'
  ],
  setup(props, { emit }) {
    const titleInput = ref(null)
    const tagInput = ref(null)
    const colorMenuOpen = ref(false)
    const tagDraft = ref('')
    const tagSuggestOpen = ref(false)
    const tagSuggestIndex = ref(-1)

    const colorLabel = computed(() => noteColorLabel(props.color))

    const tagSuggestions = computed(() => {
      const q = String(tagDraft.value || '').trim()
      if (!q) return []
      return matchTags(q, props.knownTags, { exclude: props.tags })
    })

    function setColor(id) {
      emit('update:color', id)
      colorMenuOpen.value = false
    }

    function addTag(raw) {
      const tag = normalizeTag(raw)
      if (!tag) return
      if (props.tags.includes(tag)) {
        tagDraft.value = ''
        tagSuggestOpen.value = false
        return
      }
      emit('update:tags', [...props.tags, tag])
      tagDraft.value = ''
      tagSuggestOpen.value = false
      tagSuggestIndex.value = -1
    }

    function removeTag(tag) {
      emit('update:tags', props.tags.filter(t => t !== tag))
    }

    function pickSuggestion(tag) {
      addTag(tag)
      tagInput.value?.focus()
    }

    function onTagInput() {
      tagSuggestOpen.value = true
      tagSuggestIndex.value = -1
    }

    function onTagFocus() {
      if (tagDraft.value.trim()) {
        tagSuggestOpen.value = true
      }
    }

    function onTagBlur() {
      // Delay to allow suggestion click
      setTimeout(() => {
        if (tagDraft.value.trim()) {
          addTag(tagDraft.value)
        }
        tagSuggestOpen.value = false
      }, 150)
    }

    function onTagEnter(event) {
      if (isImeComposing(event)) return
      event.preventDefault()
      if (tagSuggestOpen.value && tagSuggestIndex.value >= 0 && tagSuggestions.value[tagSuggestIndex.value]) {
        pickSuggestion(tagSuggestions.value[tagSuggestIndex.value])
      } else if (tagDraft.value.trim()) {
        addTag(tagDraft.value)
      }
    }

    function onTagComma(event) {
      event.preventDefault()
      if (tagDraft.value.trim()) {
        addTag(tagDraft.value)
      }
    }

    function onTagArrow(event, delta) {
      if (!tagSuggestOpen.value || !tagSuggestions.value.length) return
      event.preventDefault()
      const len = tagSuggestions.value.length
      tagSuggestIndex.value = (tagSuggestIndex.value + delta + len) % len
    }

    function onTagEscape() {
      tagSuggestOpen.value = false
      tagSuggestIndex.value = -1
    }

    function onTitleEnter(event) {
      if (isImeComposing(event)) return
      event.preventDefault()
      titleInput.value?.blur()
    }

    function onDocClick(e) {
      if (colorMenuOpen.value && !e.target.closest('.card-color-picker')) {
        colorMenuOpen.value = false
      }
    }

    onMounted(() => {
      document.addEventListener('click', onDocClick)
    })

    onUnmounted(() => {
      document.removeEventListener('click', onDocClick)
    })

    return {
      titleInput,
      tagInput,
      colorMenuOpen,
      colorLabel,
      tagDraft,
      tagSuggestOpen,
      tagSuggestIndex,
      tagSuggestions,
      NOTE_COLOR_OPTIONS,
      setColor,
      addTag,
      removeTag,
      pickSuggestion,
      onTagInput,
      onTagFocus,
      onTagBlur,
      onTagEnter,
      onTagComma,
      onTagArrow,
      onTagEscape,
      onTitleEnter
    }
  }
}
</script>

<style scoped>
.note-universal-header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  background: inherit;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.note-header-primary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.note-header-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.note-header-title-input {
  font-size: 1.15rem;
  font-weight: 600;
  border: none;
  background: transparent;
  width: 100%;
  color: #0f172a;
  padding: 0.25rem 0;
}

.note-header-title-input:focus {
  border-bottom: 2px solid #6366f1;
}

.note-header-version-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}

.note-header-meta-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.note-header-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.note-header-tag-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.note-header-tag-input-wrap {
  position: relative;
  display: inline-block;
}

.prop-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.72rem;
  font-family: var(--font-mono, monospace);
  padding: 0.18rem 0.45rem;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.prop-chip-remove {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
  line-height: 1;
  color: #5f6368;
  display: flex;
  align-items: center;
}

.prop-chip-remove:hover {
  color: #c5221f;
}

.prop-chip-input {
  font-size: 0.75rem;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  padding: 0.18rem 0.4rem;
  background: transparent;
  min-width: 80px;
}

.prop-chip-input:focus {
  border-color: #6366f1;
  border-style: solid;
  background: #fff;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0.25rem 0;
  min-width: 150px;
  max-height: 180px;
  overflow-y: auto;
  z-index: 100;
}

.tag-suggestion {
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: #334155;
  font-family: var(--font-mono, monospace);
}

.tag-suggestion.active,
.tag-suggestion:hover {
  background: #eff6ff;
  color: #1d4ed8;
}
</style>
