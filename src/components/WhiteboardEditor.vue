<template>
  <div ref="editorRoot" class="whiteboard-editor">
    <header class="wb-header">
      <button @click="goBack" class="wb-back-btn" title="Back to notes">← Notes</button>
      <input
        v-model="title"
        class="wb-title-input"
        placeholder="Whiteboard title..."
        @keydown.enter.prevent
      />
      <div class="wb-header-actions">
        <span v-if="syncStatus" class="wb-save-status">{{ syncStatus === 'saved' ? '✓ Saved' : syncStatus === 'saving' ? '○ Saving...' : syncStatus === 'loaded' ? '✓ Loaded' : syncStatus }}</span>
        <button @click="debugOpen = !debugOpen" class="wb-debug-btn" :title="debugOpen ? 'Hide pen inspector' : 'Pen event inspector'">
          🖊
        </button>
        <button @click="toggleFullscreen" class="wb-fs-btn" :title="isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'">
          {{ isFullscreen ? '↙' : '↗' }}
        </button>
      </div>
    </header>
    <div ref="canvasContainer" class="wb-canvas-container"></div>

    <!-- Pen event diagnostic panel -->
    <div v-if="debugOpen" class="debug-panel">
      <div class="debug-header">
        <span>Pen Event Inspector</span>
        <span class="debug-count">{{ debugLog.length }} events</span>
        <button @click="copyLog" class="debug-copy-btn" :title="copyStatus || 'Copy log'">
          {{ copyStatus || '📋' }}
        </button>
        <button @click="debugLog = []" class="debug-clear-btn">Clear</button>
        <button @click="debugOpen = false" class="debug-close-btn">✕</button>
      </div>
      <!-- Active filter chips -->
      <div v-if="debugFilters.length" class="debug-filter-bar">
        <span class="debug-filter-label">Filters:</span>
        <span v-for="sig in debugFilters" :key="sig" class="debug-filter-chip" @click="debugFilters = debugFilters.filter(s => s !== sig)">
          {{ sig }} ✕
        </span>
      </div>
      <div class="debug-log" ref="debugLogEl">
        <div v-for="(entry, i) in debugLog" :key="i" class="debug-entry">
          <button @click="toggleFilter(entry)" class="debug-filter-btn" :title="'Exclude: ' + filterSignature(entry)">
            ⊘
          </button>
          <span class="debug-time">{{ entry.time }}</span>
          <span class="debug-type" :class="'ev-' + entry.type.replace('▼_','').replace('▲_','').replace('→_','')">{{ entry.type }}</span>
          <template v-if="entry.kind === 'pointer'">
            <span class="debug-prop">pointerType=<b>{{ entry.pointerType }}</b></span>
            <span class="debug-prop">button=<b>{{ entry.button }}</b></span>
            <span class="debug-prop">buttons=<b>{{ entry.buttons }}</b></span>
            <span class="debug-prop">isPrimary=<b>{{ entry.isPrimary }}</b></span>
            <span class="debug-prop">pressure=<b>{{ entry.pressure }}</b></span>
            <span v-if="entry.tiltX != null" class="debug-prop">tilt=<b>{{ entry.tiltX }},{{ entry.tiltY }}</b></span>
            <span v-if="entry.twist != null" class="debug-prop">twist=<b>{{ entry.twist }}</b></span>
            <span v-if="entry.pointerId != null" class="debug-prop">ptrId=<b>{{ entry.pointerId }}</b></span>
          </template>
          <template v-else-if="entry.kind === 'key'">
            <span class="debug-prop">key=<b>{{ entry.key }}</b></span>
            <span class="debug-prop">code=<b>{{ entry.code }}</b></span>
            <span class="debug-prop">keyCode=<b>{{ entry.keyCode }}</b></span>
            <span class="debug-prop">ctrlKey=<b>{{ entry.ctrlKey }}</b></span>
            <span class="debug-prop">shiftKey=<b>{{ entry.shiftKey }}</b></span>
            <span class="debug-prop">altKey=<b>{{ entry.altKey }}</b></span>
            <span class="debug-prop">metaKey=<b>{{ entry.metaKey }}</b></span>
            <span v-if="entry.repeat" class="debug-prop"><b>repeat</b></span>
          </template>
          <template v-else-if="entry.kind === 'mouse'">
            <span class="debug-prop">button=<b>{{ entry.button }}</b></span>
            <span class="debug-prop">buttons=<b>{{ entry.buttons }}</b></span>
            <span v-if="entry.detail != null" class="debug-prop">detail=<b>{{ entry.detail }}</b></span>
            <span class="debug-prop">x,y=<b>{{ entry.clientX }},{{ entry.clientY }}</b></span>
          </template>
          <span class="debug-prop debug-target">{{ entry.target }}</span>
        </div>
        <div v-if="debugLog.length === 0" class="debug-empty">Tap/draw with your stylus to see events…</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createCollabManager } from '../collab/collabManager.js'

export default {
  name: 'WhiteboardEditor',
  props: {
    noteId: { type: String, required: true },
    canvasData: { type: String, default: null },
    initialTitle: { type: String, default: '' },
    ws: { type: Object, default: null }  // WebSocket instance for collab
  },
  emits: ['back', 'saved'],
  setup(props, { emit }) {
    const title = ref(props.initialTitle || '')
    const canvasContainer = ref(null)
    const editorRoot = ref(null)
    const syncStatus = ref('')   // 'saved' | 'saving' | 'loaded' | ''
    const isFullscreen = ref(false)
    const debugOpen = ref(false)
    const debugLog = ref([])
    const debugLogEl = ref(null)
    const debugFilters = ref([])  // array of filter signature strings
    const copyStatus = ref('')
    const MAX_DEBUG = 40

    function filterSignature(entry) {
      // Build a unique signature for this event pattern
      if (entry.kind === 'pointer') {
        return `${entry.type}|${entry.pointerType}|${entry.button}|${entry.buttons}|${entry.isPrimary}`
      } else if (entry.kind === 'mouse') {
        return `${entry.type}|${entry.button}|${entry.buttons}`
      } else if (entry.kind === 'key') {
        return `${entry.type}|${entry.key}|${entry.code}`
      }
      return entry.type
    }

    function toggleFilter(entry) {
      const sig = filterSignature(entry)
      const idx = debugFilters.value.indexOf(sig)
      if (idx >= 0) {
        debugFilters.value.splice(idx, 1)
      } else {
        debugFilters.value.push(sig)
        // Remove all existing entries that match this new filter
        debugLog.value = debugLog.value.filter(e => filterSignature(e) !== sig)
      }
    }

    function hasFilter(entry) {
      return debugFilters.value.includes(filterSignature(entry))
    }

    function pushDebug(entry) {
      // Completely off when panel is closed
      if (!debugOpen.value) return
      // Drop event if it matches any active filter
      if (hasFilter(entry)) return
      debugLog.value = [entry, ...debugLog.value].slice(0, MAX_DEBUG)
    }

    function copyLog() {
      const text = debugLog.value.map(e => {
        const sig = filterSignature(e)
        const masked = hasFilter(e) ? ' [MASKED]' : ''
        return `${e.time} ${e.type} ${sig}${masked}`
      }).join('\n')
      navigator.clipboard.writeText(text).then(() => {
        copyStatus.value = 'Copied!'
        setTimeout(() => { copyStatus.value = '' }, 1500)
      }).catch(() => {
        copyStatus.value = 'Failed'
      })
    }

    let excalidrawAPI = null
    let reactRoot = null

    // ── Thumbnail generator (used by collab manager) ──
    async function generateThumbnail(elements, appState, files) {
      try {
        const blob = await exportToBlob({
          elements: elements.filter(el => !el.isDeleted),
          appState,
          files,
          mimeType: 'image/png',
          maxWidthOrHeight: 400,
          exportPadding: 10
        })
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
      } catch (e) {
        console.error('Thumbnail generation failed:', e)
        return null
      }
    }

    // ── Collab manager ──
    const collab = createCollabManager({
      noteId: props.noteId,
      generateThumbnail,
      onStatus(status) {
        syncStatus.value = status
        if (status === 'saved') {
          setTimeout(() => { if (syncStatus.value === 'saved') syncStatus.value = '' }, 1500)
        }
      },
      onNoteGone(goneNoteId) {
        // Server says the note we're editing no longer exists. Surface to parent.
        emit('note-gone', goneNoteId)
      }
    })

    // ── Stylus button pen/eraser toggle (via keyup: Unidentified, keyCode=0) ──
    function handleStylusKeyUp(e) {
      if (e.key === 'Unidentified' && e.keyCode === 0) {
        e.preventDefault()
        if (!excalidrawAPI) return
        const tool = excalidrawAPI.getAppState().activeTool.type
        if (tool === 'eraser') {
          excalidrawAPI.setActiveTool({ type: 'freedraw' })
        } else {
          excalidrawAPI.setActiveTool({ type: 'eraser' })
        }
      }
    }

    // ── Touch: two-finger zoom/pan in drawing mode ──
    const DRAWING_TOOLS = new Set(['freedraw', 'text', 'eraser', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line'])
    let touchFingerCount = 0
    let fingerToolRestore = null

    function isFingerTouch(touch) {
      // touchType 'stylus' means Apple Pencil / active pen — exclude those
      if (touch.touchType === 'stylus') return false
      return true
    }

    function handleTouchStart(e) {
      for (const touch of e.changedTouches) {
        if (isFingerTouch(touch)) touchFingerCount++
      }
      if (touchFingerCount >= 2 && excalidrawAPI && fingerToolRestore === null) {
        const tool = excalidrawAPI.getAppState().activeTool.type
        if (DRAWING_TOOLS.has(tool)) {
          fingerToolRestore = tool
          excalidrawAPI.setActiveTool({ type: 'hand' })
        }
      }
    }

    function handleTouchEnd(e) {
      for (const touch of e.changedTouches) {
        if (isFingerTouch(touch)) touchFingerCount = Math.max(0, touchFingerCount - 1)
      }
      if (touchFingerCount < 2 && fingerToolRestore && excalidrawAPI) {
        excalidrawAPI.setActiveTool({ type: fingerToolRestore })
        fingerToolRestore = null
      }
    }

    // ── Stylus diagnostic (captures pointer + keyboard at document level) ──
    function handleDebugPointer(e) {
      if (!debugOpen.value) return
      function fmt(n) {
        if (n == null) return null
        if (typeof n === 'number') return Number(n.toFixed(3))
        return n
      }
      const entry = {
        time: new Date().toISOString().slice(11, 23),
        type: e.type === 'pointerdown' ? '▼_pdown' : e.type === 'pointerup' ? '▲_pup' : e.type === 'pointermove' ? '→_pmove' : '●_' + e.type,
        kind: 'pointer',
        pointerType: e.pointerType,
        button: e.button,
        buttons: e.buttons,
        isPrimary: e.isPrimary,
        pressure: fmt(e.pressure),
        pointerId: e.pointerId,
        tiltX: fmt(e.tiltX),
        tiltY: fmt(e.tiltY),
        twist: fmt(e.twist),
        width: fmt(e.width),
        height: fmt(e.height),
        altitudeAngle: fmt(e.altitudeAngle),
        azimuthAngle: fmt(e.azimuthAngle),
        tangentialPressure: fmt(e.tangentialPressure),
        target: e.target?.tagName || '?'
      }
      pushDebug(entry)
    }

    function handleDebugKey(e) {
      if (!debugOpen.value) return
      const entry = {
        time: new Date().toISOString().slice(11, 23),
        type: e.type === 'keydown' ? '▼_kdown' : '▲_kup',
        kind: 'key',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
        target: e.target?.tagName || '?'
      }
      pushDebug(entry)
    }

    function handleDebugMouse(e) {
      if (!debugOpen.value) return
      // Pen side buttons often map to legacy mouse events
      const entry = {
        time: new Date().toISOString().slice(11, 23),
        type: '●_' + e.type.replace('mouse', 'm'),
        kind: 'mouse',
        button: e.button,
        buttons: e.buttons,
        detail: e.detail,
        clientX: e.clientX,
        clientY: e.clientY,
        target: e.target?.tagName || '?'
      }
      pushDebug(entry)
    }

    function handleDebugContextMenu(e) {
      if (!debugOpen.value) return
      const entry = {
        time: new Date().toISOString().slice(11, 23),
        type: '■_ctxmenu',
        kind: 'mouse',
        button: e.button,
        buttons: e.buttons,
        target: e.target?.tagName || '?'
      }
      pushDebug(entry)
    }

    // ── Fullscreen ──
    function handleFullscreenChange() {
      isFullscreen.value = !!document.fullscreenElement
    }

    function toggleFullscreen() {
      if (!document.fullscreenEnabled) return
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        editorRoot.value?.requestFullscreen()
      }
    }

    function goBack() {
      collab.detach()
      cleanup()
      emit('back')
    }

    function cleanup() {
      if (reactRoot) {
        reactRoot.unmount()
        reactRoot = null
      }
    }

    function handleExcalidrawAPI(api) {
      excalidrawAPI = api
      collab.setAPI(api)
    }

    function handleChange(elements, appState, files) {
      collab.handleChange(elements, appState, files)
    }

    // Return the current scene (elements + files) for save-as / export flows.
    function getCurrentScene() {
      // Prefer the live Excalidraw API if available; fall back to collab state.
      if (excalidrawAPI) {
        try {
          return {
            elements: excalidrawAPI.getSceneElementsIncludingDeleted
              ? excalidrawAPI.getSceneElementsIncludingDeleted()
              : (excalidrawAPI.getSceneElements ? excalidrawAPI.getSceneElements() : []),
            files: typeof excalidrawAPI.getFiles === 'function' ? (excalidrawAPI.getFiles() || {}) : {}
          }
        } catch (e) {
          console.error('Failed to read scene from Excalidraw API', e)
        }
      }
      return collab.getCurrentScene ? collab.getCurrentScene() : { elements: [], files: {} }
    }

    onMounted(async () => {
      await nextTick()
      let initialData = null
      if (props.canvasData) {
        try {
          const parsed = JSON.parse(props.canvasData)
          // Handle both raw Excalidraw JSON and our stored format
          if (parsed.elements) {
            initialData = {
              elements: parsed.elements || [],
              appState: parsed.appState || {},
              scrollToContent: true
            }
            if (parsed.files) initialData.files = parsed.files
            console.log('[WhiteboardEditor] Loaded canvas data:', parsed.elements.length, 'elements')
          }
        } catch (e) {
          console.error('Failed to parse canvas data:', e)
        }
      }

      if (!initialData) {
        initialData = {
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' },
          scrollToContent: true
        }
      }

      reactRoot = createRoot(canvasContainer.value)
      reactRoot.render(
        React.createElement(Excalidraw, {
          initialData,
          excalidrawAPI: handleExcalidrawAPI,
          onChange: handleChange,
          theme: 'light',
          name: title.value || 'Whiteboard',
          UIOptions: {
            canvasActions: {
              export: { saveFileToDisk: true },
              loadScene: true,
              saveToActiveFile: false,
              toggleTheme: true,
              changeViewBackgroundColor: true
            }
          }
        })
      )

      // Wire up stylus, touch, debug, and fullscreen listeners
      const el = canvasContainer.value
      window.addEventListener('keyup', handleStylusKeyUp)
      el.addEventListener('touchstart', handleTouchStart, { passive: false })
      el.addEventListener('touchend', handleTouchEnd)
      el.addEventListener('touchcancel', handleTouchEnd)

      // Debug: capture at document level so we see events Excalidraw might swallow
      document.addEventListener('pointerdown', handleDebugPointer, true)
      document.addEventListener('pointerup', handleDebugPointer, true)
      document.addEventListener('pointermove', handleDebugPointer, true)
      document.addEventListener('mousedown', handleDebugMouse, true)
      document.addEventListener('mouseup', handleDebugMouse, true)
      document.addEventListener('click', handleDebugMouse, true)
      document.addEventListener('auxclick', handleDebugMouse, true)
      document.addEventListener('dblclick', handleDebugMouse, true)
      document.addEventListener('contextmenu', handleDebugContextMenu, true)
      document.addEventListener('keydown', handleDebugKey, true)
      document.addEventListener('keyup', handleDebugKey, true)
      document.addEventListener('fullscreenchange', handleFullscreenChange)

      // ── Collab: attach when WebSocket is connected ──
    watch(() => props.ws, (newWs) => {
      if (newWs && newWs.readyState === WebSocket.OPEN) {
        collab.attach(newWs)
      } else if (!newWs) {
        collab.detach()
      }
    }, { immediate: true })
    })

    onUnmounted(() => {
      collab.detach()
      window.removeEventListener('keyup', handleStylusKeyUp)
      const el = canvasContainer.value
      if (el) {
        el.removeEventListener('touchstart', handleTouchStart)
        el.removeEventListener('touchend', handleTouchEnd)
        el.removeEventListener('touchcancel', handleTouchEnd)

      }
      document.removeEventListener('pointerdown', handleDebugPointer, true)
      document.removeEventListener('pointerup', handleDebugPointer, true)
      document.removeEventListener('pointermove', handleDebugPointer, true)
      document.removeEventListener('mousedown', handleDebugMouse, true)
      document.removeEventListener('mouseup', handleDebugMouse, true)
      document.removeEventListener('click', handleDebugMouse, true)
      document.removeEventListener('auxclick', handleDebugMouse, true)
      document.removeEventListener('dblclick', handleDebugMouse, true)
      document.removeEventListener('contextmenu', handleDebugContextMenu, true)
      document.removeEventListener('keydown', handleDebugKey, true)
      document.removeEventListener('keyup', handleDebugKey, true)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      cleanup()
    })

    return {
      title,
      canvasContainer,
      editorRoot,
      syncStatus,
      isFullscreen,
      debugOpen,
      debugLog,
      debugLogEl,
      debugFilters,
      filterSignature,
      toggleFilter,
      copyLog,
      copyStatus,
      goBack,
      toggleFullscreen,
      getCurrentScene
    }
  }
}
</script>

<style>
.whiteboard-editor {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  z-index: 50;
}

.wb-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #fff;
  border-bottom: 1px solid #e8eaed;
  z-index: 10;
  flex-shrink: 0;
}

.wb-back-btn {
  padding: 0.5rem 1rem;
  background: #f1f3f4;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
  white-space: nowrap;
}

.wb-back-btn:hover {
  background: #e8eaed;
}

.wb-title-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  color: #202124;
  outline: none;
  transition: border-color 0.2s;
}

.wb-title-input:focus {
  border-color: #1a73e8;
}

.wb-title-input::placeholder {
  color: #80868b;
  font-weight: 400;
}

.wb-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;
}

.wb-save-status {
  font-size: 0.8125rem;
  color: #1e8e3e;
}

.wb-save-status.error {
  color: #d93025;
}

.wb-save-btn {
  padding: 0.5rem 1.5rem;
  background: #1a73e8;
  color: white;
  border: 1px solid #1a73e8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background 0.2s;
}

.wb-save-btn:hover:not(:disabled) {
  background: #1557b0;
}

.wb-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wb-fs-btn {
  padding: 0.35rem 0.75rem;
  background: #f1f3f4;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  transition: background 0.2s;
}

.wb-fs-btn:hover {
  background: #e8eaed;
}

.whiteboard-editor:fullscreen {
  background: #fff;
}

.whiteboard-editor:fullscreen .wb-header {
  background: #f8f9fa;
}

.wb-canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* ── Debug panel ── */
.wb-debug-btn {
  padding: 0.35rem 0.5rem;
  background: #f1f3f4;
  color: #5f6368;
  border: 1px solid #dadce0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  transition: background 0.2s;
}

.wb-debug-btn:hover {
  background: #e8eaed;
}

.debug-panel {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 540px;
  height: 360px;
  background: rgba(0, 0, 0, 0.82);
  color: #d4d4d4;
  border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.6875rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}

.debug-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  background: rgba(255,255,255,0.08);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
  min-height: 1.8rem;
}

.debug-header > span:first-child {
  font-weight: 600;
  color: #fff;
  font-size: 0.75rem;
}

.debug-count {
  color: #888;
  font-size: 0.65rem;
}

.debug-clear-btn,
.debug-close-btn,
.debug-copy-btn {
  margin-left: auto;
  padding: 0.15rem 0.5rem;
  background: rgba(255,255,255,0.1);
  color: #ccc;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.65rem;
  font-family: inherit;
}

.debug-close-btn {
  margin-left: 0;
}

.debug-clear-btn:hover,
.debug-close-btn:hover,
.debug-copy-btn:hover {
  background: rgba(255,255,255,0.2);
}

.debug-copy-btn {
  margin-left: 0;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
}

/* ── Filter bar ── */
.debug-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  min-height: 1.5rem;
}

.debug-filter-label {
  color: #888;
  font-size: 0.6rem;
  margin-right: 0.25rem;
}

.debug-filter-chip {
  padding: 0.1rem 0.4rem;
  background: rgba(206,145,120,0.15);
  color: #ce9178;
  border: 1px solid rgba(206,145,120,0.25);
  border-radius: 3px;
  font-size: 0.58rem;
  cursor: pointer;
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.debug-filter-chip:hover {
  background: rgba(206,145,120,0.3);
}

.debug-log {
  flex: 1;
  overflow-y: auto;
  padding: 0.35rem 0.5rem;
}

.debug-log::-webkit-scrollbar {
  width: 4px;
}

.debug-log::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
}

.debug-entry {
  padding: 0.18rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  white-space: nowrap;
  display: flex;
  align-items: baseline;
  gap: 0;
  line-height: 1.3;
  min-height: 1.3rem;
}

.debug-filter-btn {
  flex-shrink: 0;
  padding: 0;
  margin: 0 0.3rem 0 0;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.5rem;
  line-height: 1;
  font-family: inherit;
  transition: color 0.15s;
}

.debug-filter-btn:hover {
  color: #ce9178;
}

.debug-time {
  color: #666;
  margin-right: 0.4rem;
}

.debug-type {
  display: inline-block;
  min-width: 3.2rem;
  margin-right: 0.4rem;
  font-weight: 600;
}

.ev-pdown { color: #4ec9b0; }
.ev-pup   { color: #dcdcaa; }
.ev-pmove { color: #9cdcfe; }
.ev-kdown { color: #ce9178; }
.ev-kup   { color: #c586c0; }
.ev-mdown { color: #569cd6; }
.ev-mup   { color: #b5cea8; }
.ev-click { color: #d7ba7d; }
.ev-auxclick { color: #d16969; }
.ev-dblclick { color: #4fc1ff; }
.ev-ctxmenu { color: #f44747; }

.debug-prop {
  margin-right: 0.5rem;
}

.debug-prop b {
  color: #ce9178;
  font-weight: 600;
}

.debug-target {
  color: #555;
  font-size: 0.6rem;
}

.debug-empty {
  color: #666;
  text-align: center;
  padding: 1rem 0;
  font-style: italic;
}
</style>
