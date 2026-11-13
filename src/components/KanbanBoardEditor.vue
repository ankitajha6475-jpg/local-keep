<template>
  <div class="kanban-board-container" :class="color ? `note-color-${color}` : ''">
    <!-- Header bar using shared NoteHeader -->
    <header class="kanban-board-header">
      <NoteHeader
        :title="title"
        :color="color"
        :tags="tags"
        :revision-no="currentRevisionNo"
        :known-tags="knownTags"
        @title-change="handleTitleChange"
        @color-change="handleColorChange"
        @tags-change="handleTagsChange"
      >
        <template #actions>
          <button
            type="button"
            class="kanban-save-btn"
            :class="{ 'kanban-save-btn--dirty': pendingActions.length > 0 }"
            :disabled="saving || pendingActions.length === 0"
            @click="flushSave"
            title="Save board changes"
          >
            <AppIcon v-if="saving" name="refresh" :size="14" />
            <AppIcon v-else-if="pendingActions.length === 0" name="check" :size="14" />
            <span>{{ saving ? 'Saving...' : (pendingActions.length > 0 ? 'Save' : 'Saved') }}</span>
          </button>

          <button
            type="button"
            class="kanban-header-btn close-btn"
            @click="$emit('back')"
            title="Close Kanban Board"
            aria-label="Close Kanban Board"
          >
            <AppIcon name="x" :size="18" />
          </button>
        </template>
      </NoteHeader>
    </header>

    <!-- Main Kanban Board Canvas -->
    <main class="kanban-canvas" aria-label="Kanban columns">
      <div
        v-for="column in columns"
        :key="column.id"
        class="kanban-column"
        :data-col-id="column.id"
        @dragover.prevent="onDragOver(column.id, $event)"
        @drop.prevent="onDrop(column.id, $event)"
      >
        <!-- Column Header -->
        <div class="kanban-col-header">
          <input
            v-if="editingColId === column.id"
            ref="colInputRef"
            v-model="column.title"
            class="kanban-col-title-input"
            aria-label="Edit column title"
            @blur="finishRenameColumn(column)"
            @keydown="onRenameKeyDown(column, $event)"
          />
          <h3
            v-else
            class="kanban-col-title"
            title="Click to rename"
            @click="startRenameColumn(column.id)"
          >
            {{ column.title }}
          </h3>
          <div class="kanban-col-actions">
            <span class="kanban-col-badge">{{ getCardsForColumn(column.id).length }}</span>
            <button
              type="button"
              class="kanban-col-delete-btn"
              title="Delete column"
              aria-label="Delete column"
              @click="deleteColumn(column.id)"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Cards List -->
        <div class="kanban-card-list">
          <div
            v-for="card in getCardsForColumn(column.id)"
            :key="card.id"
            class="kanban-card"
            :class="[
              card.color ? `kanban-card--${card.color}` : '',
              { 'kanban-card--dragging': draggedCardId === card.id }
            ]"
            draggable="true"
            @dragstart="onDragStart(card, $event)"
            @dragend="onDragEnd"
            @click="openCardModal(card)"
          >
            <div class="kanban-card-main">
              <span class="kanban-card-title">{{ card.title }}</span>
              <button
                type="button"
                class="kanban-card-del-btn"
                title="Delete card"
                aria-label="Delete card"
                @click.stop="deleteCard(card.id)"
              >
                ×
              </button>
            </div>
            <p v-if="card.description" class="kanban-card-desc">
              {{ card.description }}
            </p>
          </div>
        </div>

        <!-- Column Footer / Add Card -->
        <div class="kanban-col-footer">
          <div v-if="addingCardColId === column.id" class="kanban-new-card-form">
            <textarea
              ref="newCardInputRef"
              v-model="newCardTitle"
              class="kanban-new-card-input"
              placeholder="Enter title for this card..."
              rows="2"
              aria-label="New card title"
              @keydown="onNewCardKeyDown(column.id, $event)"
            ></textarea>
            <div class="kanban-new-card-actions">
              <button
                type="button"
                class="kanban-btn-primary"
                :disabled="!newCardTitle.trim()"
                @click="submitNewCard(column.id)"
              >
                Add Card
              </button>
              <button
                type="button"
                class="kanban-btn-ghost"
                @click="addingCardColId = null"
              >
                Cancel
              </button>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="kanban-add-card-btn"
            @click="startAddCard(column.id)"
          >
            + Add card
          </button>
        </div>
      </div>

      <!-- Add Column Button / Form -->
      <div class="kanban-add-column-section">
        <div v-if="addingColumn" class="kanban-new-col-form">
          <input
            ref="newColInputRef"
            v-model="newColTitle"
            class="kanban-new-col-input"
            placeholder="Enter column name..."
            aria-label="New column name"
            @keydown="onNewColKeyDown($event)"
          />
          <div class="kanban-new-col-actions">
            <button
              type="button"
              class="kanban-btn-primary"
              :disabled="!newColTitle.trim()"
              @click="submitNewColumn"
            >
              Add Column
            </button>
            <button
              type="button"
              class="kanban-btn-ghost"
              @click="addingColumn = false"
            >
              Cancel
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="kanban-add-col-btn"
          @click="startAddColumn"
        >
          + Add column
        </button>
      </div>
    </main>

    <!-- Card Detail Modal -->
    <div
      v-if="modalCard"
      class="kanban-modal-backdrop"
      @click.self="closeCardModal"
    >
      <div class="kanban-modal-panel" aria-labelledby="card-modal-title">
        <div class="kanban-modal-header">
          <h2 id="card-modal-title">Edit Card</h2>
          <button
            type="button"
            class="kanban-header-btn"
            title="Close modal"
            aria-label="Close modal"
            @click="closeCardModal"
          >
            <AppIcon name="x" :size="18" />
          </button>
        </div>

        <div class="kanban-modal-body">
          <label class="kanban-field-label" for="card-edit-title">Title</label>
          <input
            id="card-edit-title"
            v-model="modalCard.title"
            class="kanban-field-input"
            placeholder="Card title..."
          />

          <label class="kanban-field-label" for="card-edit-col">Column</label>
          <select id="card-edit-col" v-model="modalCard.columnId" class="kanban-field-select">
            <option v-for="col in columns" :key="col.id" :value="col.id">
              {{ col.title }}
            </option>
          </select>

          <label class="kanban-field-label" for="card-edit-desc">Description (Markdown)</label>
          <textarea
            id="card-edit-desc"
            v-model="modalCard.description"
            class="kanban-field-textarea"
            placeholder="Add details, notes or checklist..."
            rows="5"
          ></textarea>
        </div>

        <div class="kanban-modal-footer">
          <button
            type="button"
            class="kanban-btn-primary"
            @click="saveCardModal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import NoteHeader from './NoteHeader.vue'
import AppIcon from './AppIcon.vue'
import { isImeComposing } from '../shared/ime.js'

export default {
  name: 'KanbanBoardEditor',
  components: { NoteHeader, AppIcon },
  props: {
    noteId: { type: String, required: true },
    initialTitle: { type: String, default: '' },
    initialColor: { type: String, default: null },
    initialTags: { type: Array, default: () => [] },
    initialContent: { type: String, default: '' },
    revisionNo: { type: Number, default: 1 },
    knownTags: { type: Array, default: () => [] },
    ws: { type: Object, default: null },
    currentUser: { type: Object, default: () => ({ username: 'user', displayName: 'User' }) }
  },
  emits: ['back', 'title-change', 'color-change', 'tags-change'],
  data() {
    return {
      title: this.initialTitle,
      color: this.initialColor,
      tags: [...this.initialTags],
      currentRevisionNo: this.revisionNo,
      columns: [],
      cards: [],
      pendingActions: [],
      saving: false,
      draggedCardId: null,
      editingColId: null,
      addingCardColId: null,
      newCardTitle: '',
      addingColumn: false,
      newColTitle: '',
      modalCard: null,
      saveTimer: null
    }
  },
  watch: {
    initialTitle(val) { this.title = val },
    initialColor(val) { this.color = val },
    initialTags(val) { this.tags = [...val] },
    initialContent: {
      immediate: true,
      handler(val) { this.loadBoardFromContent(val) }
    },
    revisionNo(val) { this.currentRevisionNo = val }
  },
  mounted() {
    this.joinKanban()
    this.bindWebSocket()
  },
  beforeUnmount() {
    if (this.pendingActions.length > 0) {
      this.flushSave()
    }
    this.leaveKanban()
    this.unbindWebSocket()
  },
  methods: {
    loadBoardFromContent(content) {
      if (!content) {
        this.columns = [
          { id: 'col_todo', title: 'To Do', order: 1000 },
          { id: 'col_doing', title: 'In Progress', order: 2000 },
          { id: 'col_done', title: 'Done', order: 3000 }
        ]
        this.cards = []
        return
      }
      try {
        const body = String(content).replace(/^---[\s\S]*?---\n*/, '').trim()
        if (body.startsWith('{')) {
          const parsed = JSON.parse(body)
          if (Array.isArray(parsed.columns)) {
            this.columns = parsed.columns
            this.cards = Array.isArray(parsed.cards) ? parsed.cards : []
            return
          }
        }
      } catch (_) {}
      this.columns = [
        { id: 'col_todo', title: 'To Do', order: 1000 },
        { id: 'col_doing', title: 'In Progress', order: 2000 },
        { id: 'col_done', title: 'Done', order: 3000 }
      ]
      this.cards = []
    },
    getCardsForColumn(colId) {
      return this.cards
        .filter(c => c.columnId === colId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    },
    onRenameKeyDown(column, e) {
      if (e.key === 'Enter' && !isImeComposing(e)) {
        this.finishRenameColumn(column)
      }
    },
    onNewCardKeyDown(columnId, e) {
      if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) {
        e.preventDefault()
        this.submitNewCard(columnId)
      } else if (e.key === 'Escape') {
        this.addingCardColId = null
      }
    },
    onNewColKeyDown(e) {
      if (e.key === 'Enter' && !isImeComposing(e)) {
        this.submitNewColumn()
      } else if (e.key === 'Escape') {
        this.addingColumn = false
      }
    },
    joinKanban() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'kanban-join', noteId: this.noteId }))
        } catch (_) {}
      }
    },
    leaveKanban() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'kanban-leave', noteId: this.noteId }))
        } catch (_) {}
      }
    },
    bindWebSocket() {
      if (!this.ws) return
      this._wsHandler = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'kanban-delta' && msg.noteId === this.noteId) {
            if (msg.revisionNo) this.currentRevisionNo = msg.revisionNo
          }
        } catch (_) {}
      }
      this.ws.addEventListener('message', this._wsHandler)
    },
    unbindWebSocket() {
      if (this.ws && this._wsHandler) {
        this.ws.removeEventListener('message', this._wsHandler)
        this._wsHandler = null
      }
    },
    scheduleSave() {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => {
        this.flushSave()
      }, 1500)
    },
    async flushSave() {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer)
        this.saveTimer = null
      }
      if (this.pendingActions.length === 0 || this.saving) return

      this.saving = true
      const actionsToSave = [...this.pendingActions]
      this.pendingActions = []

      try {
        const board = {
          columns: this.columns,
          cards: this.cards
        }
        const res = await fetch(`/api/notes/${this.noteId}/kanban`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actions: actionsToSave,
            board
          })
        })
        if (!res.ok) {
          throw new Error('Failed to save kanban board')
        }
        const data = await res.json()
        if (data.revision?.revisionNo) {
          this.currentRevisionNo = data.revision.revisionNo
        }
      } catch (err) {
        console.error('Failed to save kanban board:', err)
        // Put uncommitted actions back
        this.pendingActions = [...actionsToSave, ...this.pendingActions]
      } finally {
        this.saving = false
      }
    },
    onDragStart(card, event) {
      this.draggedCardId = card.id
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', card.id)
    },
    onDragEnd() {
      this.draggedCardId = null
    },
    onDragOver(columnId, event) {
      event.dataTransfer.dropEffect = 'move'
    },
    onDrop(columnId, event) {
      const cardId = event.dataTransfer.getData('text/plain') || this.draggedCardId
      if (!cardId) return

      const card = this.cards.find(c => c.id === cardId)
      if (!card) return

      if (card.columnId !== columnId) {
        const fromCol = card.columnId
        card.columnId = columnId
        const existingInCol = this.getCardsForColumn(columnId)
        card.order = existingInCol.length > 0 ? (existingInCol[existingInCol.length - 1].order || 1000) + 1000 : 1000

        this.pendingActions.push({
          type: 'card_moved',
          cardId: card.id,
          fromColumnId: fromCol,
          toColumnId: columnId,
          order: card.order
        })
        this.scheduleSave()
      }
      this.draggedCardId = null
    },
    startAddCard(columnId) {
      this.addingCardColId = columnId
      this.newCardTitle = ''
      this.$nextTick(() => {
        this.$refs.newCardInputRef?.[0]?.focus()
      })
    },
    submitNewCard(columnId) {
      const title = this.newCardTitle.trim()
      if (!title) return

      const existingInCol = this.getCardsForColumn(columnId)
      const order = existingInCol.length > 0 ? (existingInCol[existingInCol.length - 1].order || 1000) + 1000 : 1000
      const newCard = {
        id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        columnId,
        title,
        description: '',
        color: null,
        order
      }

      this.cards.push(newCard)
      this.pendingActions.push({
        type: 'card_added',
        card: newCard
      })
      this.newCardTitle = ''
      this.addingCardColId = null
      this.scheduleSave()
    },
    deleteCard(cardId) {
      this.cards = this.cards.filter(c => c.id !== cardId)
      this.pendingActions.push({
        type: 'card_deleted',
        cardId
      })
      this.scheduleSave()
    },
    openCardModal(card) {
      this.modalCard = { ...card }
    },
    closeCardModal() {
      this.modalCard = null
    },
    saveCardModal() {
      if (!this.modalCard) return
      const idx = this.cards.findIndex(c => c.id === this.modalCard.id)
      if (idx !== -1) {
        const orig = this.cards[idx]
        const updates = {
          title: this.modalCard.title,
          description: this.modalCard.description,
          columnId: this.modalCard.columnId
        }
        this.cards[idx] = { ...orig, ...updates }
        this.pendingActions.push({
          type: 'card_updated',
          cardId: orig.id,
          updates
        })
        this.scheduleSave()
      }
      this.modalCard = null
    },
    startAddColumn() {
      this.addingColumn = true
      this.newColTitle = ''
      this.$nextTick(() => {
        this.$refs.newColInputRef?.focus()
      })
    },
    submitNewColumn() {
      const title = this.newColTitle.trim()
      if (!title) return

      const order = this.columns.length > 0 ? (this.columns[this.columns.length - 1].order || 1000) + 1000 : 1000
      const newCol = {
        id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        order
      }

      this.columns.push(newCol)
      this.pendingActions.push({
        type: 'column_added',
        column: newCol
      })
      this.newColTitle = ''
      this.addingColumn = false
      this.scheduleSave()
    },
    startRenameColumn(columnId) {
      this.editingColId = columnId
      this.$nextTick(() => {
        this.$refs.colInputRef?.[0]?.focus()
      })
    },
    finishRenameColumn(column) {
      this.editingColId = null
      this.pendingActions.push({
        type: 'column_renamed',
        columnId: column.id,
        title: column.title
      })
      this.scheduleSave()
    },
    deleteColumn(columnId) {
      const colCards = this.getCardsForColumn(columnId)
      if (colCards.length > 0) {
        if (!window.confirm(`Delete column "${this.columns.find(c => c.id === columnId)?.title}" and its ${colCards.length} cards?`)) {
          return
        }
      }
      this.columns = this.columns.filter(c => c.id !== columnId)
      this.cards = this.cards.filter(c => c.columnId !== columnId)
      this.pendingActions.push({
        type: 'column_deleted',
        columnId
      })
      this.scheduleSave()
    },
    async handleTitleChange(newTitle) {
      this.title = newTitle
      try {
        await fetch(`/api/notes/${this.noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        })
        this.$emit('title-change', newTitle)
      } catch (e) {
        console.error('Failed to update title', e)
      }
    },
    async handleColorChange(newColor) {
      this.color = newColor
      try {
        await fetch(`/api/notes/${this.noteId}/color`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color: newColor })
        })
        this.$emit('color-change', newColor)
      } catch (e) {
        console.error('Failed to update color', e)
      }
    },
    async handleTagsChange(newTags) {
      this.tags = [...newTags]
      try {
        await fetch(`/api/notes/${this.noteId}/properties`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: { tags: newTags } })
        })
        this.$emit('tags-change', newTags)
      } catch (e) {
        console.error('Failed to update tags', e)
      }
    }
  }
}
</script>

<style scoped>
.kanban-board-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #f8fafc;
  color: #0f172a;
  overflow: hidden;
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.kanban-board-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  z-index: 10;
}

.kanban-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #5f6368;
  cursor: pointer;
  line-height: 1.2;
}

.kanban-save-btn--dirty {
  background: #6366f1;
  color: #fff;
  border-color: #4f46e5;
}

.kanban-save-btn:disabled:not(.kanban-save-btn--dirty) {
  opacity: 0.8;
  cursor: default;
}

.kanban-header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem;
  border: none;
  background: transparent;
  color: #5f6368;
  cursor: pointer;
  border-radius: 6px;
  line-height: 1;
}

.kanban-header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

.close-btn {
  font-size: 1.1rem;
}

/* Main Canvas */
.kanban-canvas {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 1.25rem;
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}

/* Column */
.kanban-column {
  width: 290px;
  flex-shrink: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.kanban-col-header {
  padding: 0.75rem 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}

.kanban-col-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  cursor: pointer;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kanban-col-title-input {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1e293b;
  border: 1px solid #6366f1;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  width: 100%;
}

.kanban-col-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.kanban-col-badge {
  font-size: 0.72rem;
  font-weight: 600;
  background: #f1f5f9;
  color: #5f6368;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
}

.kanban-col-delete-btn {
  background: transparent;
  border: none;
  font-size: 1rem;
  line-height: 1;
  color: #5f6368;
  cursor: pointer;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
}

.kanban-col-delete-btn:hover {
  background: #f1f5f9;
  color: #c5221f;
}

/* Card list */
.kanban-card-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 60px;
}

.kanban-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: grab;
  transition: box-shadow 0.15s ease;
}

.kanban-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.07);
}

.kanban-card--dragging {
  opacity: 0.4;
}

.kanban-card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4rem;
}

.kanban-card-title {
  font-size: 0.88rem;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.35;
  word-break: break-word;
}

.kanban-card-del-btn {
  background: transparent;
  border: none;
  font-size: 0.95rem;
  line-height: 1;
  color: #5f6368;
  cursor: pointer;
  padding: 0 0.2rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.kanban-card:hover .kanban-card-del-btn {
  opacity: 1;
}

.kanban-card-del-btn:hover {
  color: #c5221f;
}

.kanban-card-desc {
  font-size: 0.78rem;
  color: #5f6368;
  margin: 0.35rem 0 0 0;
  line-height: 1.35;
  white-space: pre-line;
  max-height: 4.2em;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Column footer */
.kanban-col-footer {
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #f1f5f9;
}

.kanban-add-card-btn {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  font-size: 0.82rem;
  font-weight: 500;
  color: #5f6368;
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
}

.kanban-add-card-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.kanban-new-card-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.kanban-new-card-input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid #6366f1;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  resize: vertical;
}

.kanban-new-card-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Add column section */
.kanban-add-column-section {
  width: 260px;
  flex-shrink: 0;
}

.kanban-add-col-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #5f6368;
  cursor: pointer;
  text-align: left;
}

.kanban-add-col-btn:hover {
  border-color: #6366f1;
  color: #4338ca;
  background: #f5f3ff;
}

.kanban-new-col-form {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.kanban-new-col-input {
  padding: 0.45rem 0.6rem;
  border: 1px solid #6366f1;
  border-radius: 6px;
  font-size: 0.88rem;
}

.kanban-new-col-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* Shared Buttons */
.kanban-btn-primary {
  padding: 0.35rem 0.75rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}

.kanban-btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.kanban-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.kanban-btn-ghost {
  padding: 0.35rem 0.65rem;
  background: transparent;
  color: #5f6368;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
}

.kanban-btn-ghost:hover {
  background: #f1f5f9;
  color: #0f172a;
}

/* Card Detail Modal */
.kanban-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1.5rem;
}

.kanban-modal-panel {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kanban-modal-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kanban-modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;
  margin: 0;
}

.kanban-modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.kanban-field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}

.kanban-field-input,
.kanban-field-select,
.kanban-field-textarea {
  width: 100%;
  padding: 0.5rem 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
  font-family: inherit;
}

.kanban-field-input:focus,
.kanban-field-select:focus,
.kanban-field-textarea:focus {
  border-color: #6366f1;
}

.kanban-modal-footer {
  padding: 0.85rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  background: #f8fafc;
}
</style>
