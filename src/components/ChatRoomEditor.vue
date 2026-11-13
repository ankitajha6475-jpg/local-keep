<template>
  <div class="chat-room-container" :class="color ? `note-color-${color}` : ''">
    <!-- Header bar using shared NoteHeader -->
    <header class="chat-room-header">
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
            class="chat-header-btn close-btn"
            @click="$emit('back')"
            title="Close Chat"
            aria-label="Close Chat"
          >
            <AppIcon name="x" :size="18" />
          </button>
        </template>
      </NoteHeader>
    </header>

    <!-- Message Timeline -->
    <div ref="timelineRef" class="chat-timeline" tabindex="0" aria-label="Message transcript">
      <div v-if="messages.length === 0" class="chat-empty-state">
        <div class="chat-empty-icon"><AppIcon name="message" :size="40" /></div>
        <p class="chat-empty-title">No messages in this chat room yet</p>
        <p class="chat-empty-sub">Type a message below to start the conversation.</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-msg"
        :class="{ 'chat-msg--mine': isMine(msg) }"
      >
        <div class="chat-avatar" :title="msg.senderName || msg.sender" aria-hidden="true">
          {{ getInitials(msg.senderName || msg.sender) }}
        </div>
        <div class="chat-bubble">
          <div class="chat-msg-meta">
            <span class="chat-sender">{{ msg.senderName || msg.sender }}</span>
            <time class="chat-time">{{ formatTime(msg.timestamp) }}</time>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="chat-body markdown-preview" v-html="renderMessage(msg.text)"></div>
        </div>
      </div>
    </div>

    <!-- Message Composer -->
    <footer class="chat-composer">
      <form @submit.prevent="sendMessage" class="chat-composer-form">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="chat-input"
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows="2"
          aria-label="Chat message input"
          @keydown="handleKeyDown"
        ></textarea>
        <button
          type="submit"
          class="chat-send-btn"
          :disabled="!inputText.trim() || sending"
          title="Send message"
          aria-label="Send message"
        >
          <AppIcon name="send" :size="18" />
        </button>
      </form>
    </footer>
  </div>
</template>

<script>
import NoteHeader from './NoteHeader.vue'
import AppIcon from './AppIcon.vue'
import { renderMarkdown } from '../utils/markdown.js'
import { isImeComposing } from '../shared/ime.js'

export default {
  name: 'ChatRoomEditor',
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
      messages: [],
      inputText: '',
      sending: false
    }
  },
  watch: {
    initialTitle(val) { this.title = val },
    initialColor(val) { this.color = val },
    initialTags(val) { this.tags = [...val] },
    initialContent: {
      immediate: true,
      handler(val) { this.loadMessagesFromContent(val) }
    },
    revisionNo(val) { this.currentRevisionNo = val }
  },
  mounted() {
    this.joinChatRoom()
    this.bindWebSocket()
    this.$nextTick(() => {
      this.scrollToBottom()
      this.$refs.inputRef?.focus()
    })
  },
  beforeUnmount() {
    this.leaveChatRoom()
    this.unbindWebSocket()
  },
  methods: {
    loadMessagesFromContent(content) {
      if (!content) {
        this.messages = []
        return
      }
      try {
        const body = String(content).replace(/^---[\s\S]*?---\n*/, '').trim()
        if (body.startsWith('{')) {
          const parsed = JSON.parse(body)
          if (Array.isArray(parsed.messages)) {
            this.messages = parsed.messages
            return
          }
        }
      } catch (_) {}
      this.messages = []
    },
    joinChatRoom() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'chat-join', noteId: this.noteId }))
        } catch (_) {}
      }
    },
    leaveChatRoom() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'chat-leave', noteId: this.noteId }))
        } catch (_) {}
      }
    },
    bindWebSocket() {
      if (!this.ws) return
      this._wsHandler = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'chat-delta' && msg.noteId === this.noteId && msg.message) {
            const exists = this.messages.some(m => m.id === msg.message.id)
            if (!exists) {
              this.messages.push(msg.message)
              if (msg.revisionNo) this.currentRevisionNo = msg.revisionNo
              this.$nextTick(() => this.scrollToBottom())
            }
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
    isMine(msg) {
      const myUsername = this.currentUser?.username || 'user'
      return msg.sender === myUsername || msg.sender === `user:${myUsername}`
    },
    getInitials(name) {
      if (!name) return '?'
      const parts = String(name).replace(/^user:/, '').trim().split(/\s+/)
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase()
      }
      return name.slice(0, 2).toUpperCase()
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      try {
        const d = new Date(timestamp)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } catch (_) {
        return ''
      }
    },
    renderMessage(text) {
      if (!text) return ''
      return renderMarkdown(text)
    },
    scrollToBottom() {
      const el = this.$refs.timelineRef
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    },
    handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) {
        e.preventDefault()
        this.sendMessage()
      }
    },
    async sendMessage() {
      const text = this.inputText.trim()
      if (!text || this.sending) return

      this.sending = true
      try {
        const res = await fetch(`/api/notes/${this.noteId}/chat/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || 'Failed to send message')
        }
        const data = await res.json()
        const message = data.message
        if (message && !this.messages.some(m => m.id === message.id)) {
          this.messages.push(message)
        }
        if (data.revision?.revisionNo) {
          this.currentRevisionNo = data.revision.revisionNo
        }
        this.inputText = ''
        this.$nextTick(() => {
          this.scrollToBottom()
          this.$refs.inputRef?.focus()
        })
      } catch (err) {
        console.error('Failed to send message:', err)
      } finally {
        this.sending = false
      }
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
.chat-room-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #ffffff;
  color: #0f172a;
  overflow: hidden;
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.chat-room-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e2e8f0;
  background: inherit;
  z-index: 10;
}

.chat-header-btn {
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

.chat-header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

.close-btn {
  font-size: 1.1rem;
}

/* Timeline */
.chat-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #f8fafc;
}

.chat-empty-state {
  margin: auto;
  text-align: center;
  color: #5f6368;
  padding: 2rem;
}

.chat-empty-icon {
  margin-bottom: 0.75rem;
  color: #5f6368;
}

.chat-empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.25rem 0;
}

.chat-empty-sub {
  font-size: 0.85rem;
  margin: 0;
}

/* Messages */
.chat-msg {
  display: flex;
  gap: 0.75rem;
  max-width: 80%;
  align-self: flex-start;
}

.chat-msg--mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

.chat-msg--mine .chat-avatar {
  background: #6366f1;
  color: #fff;
}

.chat-bubble {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.6rem 0.85rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  min-width: 140px;
}

.chat-msg--mine .chat-bubble {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.chat-msg-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
}

.chat-sender {
  font-weight: 600;
  color: #334155;
}

.chat-msg--mine .chat-sender {
  color: #4338ca;
}

.chat-time {
  color: #5f6368;
  font-size: 0.7rem;
}

.chat-body {
  font-size: 0.9rem;
  line-height: 1.45;
  word-break: break-word;
}

.chat-body :deep(p:first-child) {
  margin-top: 0;
}

.chat-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* Composer */
.chat-composer {
  flex-shrink: 0;
  padding: 0.75rem 1.25rem;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.chat-composer-form {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  max-width: 1000px;
  margin: 0 auto;
}

.chat-input {
  flex: 1;
  padding: 0.6rem 0.8rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.92rem;
  line-height: 1.4;
  resize: vertical;
  min-height: 48px;
  max-height: 180px;
  font-family: inherit;
  background: #ffffff;
  color: #0f172a;
}

.chat-input:focus {
  border-color: #6366f1;
}

.chat-send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #6366f1;
  color: #fff;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.chat-send-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.chat-send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>
