# Whiteboard Wishlist — Implementation Plan

## Control Surface

We have two channels to control Excalidraw:

| Channel | Key Capabilities |
|---|---|
| **Props** (declarative) | `initialData`, `viewModeEnabled`, `zenModeEnabled`, `isCollaborating`, `theme`, `UIOptions`, `onPointerUpdate`, `onChange`, `handleKeyboardGlobally` |
| **`excalidrawAPI`** (imperative) | `setActiveTool(type)`, `updateScene({ elements, appState, collaborators })`, `getSceneElements()`, `getAppState()`, `getFiles()`, `resetScene()`, `toggleSidebar()`, `scrollToContent()`, plus event hooks: `onChange`, `onPointerDown`, `onPointerUp`, `onScrollChange` |

Key method: `setActiveTool({ type, customType })` — switches tool programmatically.
Tool types: `"selection" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text" | "image" | "eraser" | "hand" | "frame" | "magicframe" | "embeddable" | "laser"`

---

## 1. Stylus Side Button → Pen/Eraser Toggle

**Complexity:** Low (~30 lines)  
**Target file:** `src/components/WhiteboardEditor.vue`

### Design

Stylus eraser buttons emit `PointerEvent` with `event.button === 5` (eraser tip) or `event.buttons & 32` (barrel button). Intercept at the canvas container level.

### Implementation

```js
// In setup(), add:
let previousTool = null

function handleCanvasPointerDown(e) {
  // Stylus eraser: button 5, or barrel button with bit 5 set
  if ((e.pointerType === 'pen' && e.button === 5) || (e.pointerType === 'pen' && e.buttons & 32)) {
    if (excalidrawAPI) {
      const state = excalidrawAPI.getAppState()
      if (state.activeTool.type !== 'eraser') {
        previousTool = { ...state.activeTool }
        excalidrawAPI.setActiveTool({ type: 'eraser' })
      }
    }
  }
}

function handleCanvasPointerUp(e) {
  if (previousTool && excalidrawAPI) {
    excalidrawAPI.setActiveTool(previousTool)
    previousTool = null
  }
}
```

Bind to `canvasContainer` in `onMounted`:
```js
canvasContainer.value.addEventListener('pointerdown', handleCanvasPointerDown)
canvasContainer.value.addEventListener('pointerup', handleCanvasPointerUp)
```

Clean up in `onUnmounted`:
```js
canvasContainer.value.removeEventListener('pointerdown', handleCanvasPointerDown)
canvasContainer.value.removeEventListener('pointerup', handleCanvasPointerUp)
```

### Edge Cases
- If tool was already eraser, don't toggle (let normal behavior apply)
- If previous tool is null (no prior tool), restore to `"freedraw"` as safe default
- Test with Wacom / Surface Pen / Apple Pencil (button mappings differ)

---

## 2. Two-Finger Zoom+Pan in Pen/Draw Mode

**Complexity:** Medium (~80 lines)  
**Target file:** `src/components/WhiteboardEditor.vue`

### Design

Excalidraw disables multi-touch gestures when `penDetected` (and to some extent `penMode`) is true — it treats all touch input as drawing. Workaround: detect finger touch vs. pen touch, and temporarily switch tool to `"hand"` when 2+ fingers are on screen.

### Implementation

```js
let touchFingerCount = 0
let fingerToolRestore = null

function handleTouchStart(e) {
  for (const touch of e.changedTouches) {
    if (touch.touchType !== 'stylus') {  // Only count fingers, not stylus
      touchFingerCount++
    }
  }
  if (touchFingerCount >= 2 && excalidrawAPI && fingerToolRestore === null) {
    const state = excalidrawAPI.getAppState()
    if (state.activeTool.type === 'freedraw' || state.activeTool.type === 'text' || state.activeTool.type === 'eraser') {
      fingerToolRestore = state.activeTool.type
      excalidrawAPI.setActiveTool({ type: 'hand' })
    }
  }
}

function handleTouchEnd(e) {
  for (const touch of e.changedTouches) {
    if (touch.touchType !== 'stylus') {
      touchFingerCount = Math.max(0, touchFingerCount - 1)
    }
  }
  if (touchFingerCount < 2 && fingerToolRestore && excalidrawAPI) {
    excalidrawAPI.setActiveTool({ type: fingerToolRestore })
    fingerToolRestore = null
  }
}
```

Bind via `{ passive: false }` to allow `preventDefault` if needed.

### Edge Cases
- `touchType` not supported in all browsers (Safari doesn't have it) — fallback: assume all touches are fingers unless stylus event seen recently
- Three+ finger gestures (browser/OS gestures) — we only care about 2 fingers
- Switch back to correct tool on all-fingers-up
- Only activate for drawing-like tools (freedraw, text, eraser), not for selection/hand/zoom modes

### Testing Plan
- Verify on actual touch device + stylus hardware
- Test: 1 finger draw → 2 finger pinch-zoom → 2 finger pan → release → back to drawing
- Test: stylus drawing uninterrupted by finger touches
- Test: pinch zoom works, scroll works

---

## 3. Full-Screen Mode

**Complexity:** Low (~50 lines)  
**Target file:** `src/components/WhiteboardEditor.vue`

### Design

Standard Fullscreen API. Toggle button in header bar. Excalidraw canvas auto-adapts since it fills `flex: 1` container.

### Implementation

Template addition (in header):
```html
<button @click="toggleFullscreen" class="wb-fs-btn" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen (F11)'">
  {{ isFullscreen ? '↙' : '↗' }}
</button>
```

Logic:
```js
const isFullscreen = ref(false)

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    // Fullscreen the wrapper div, not just canvas (keeps header visible)
    editorEl.value.requestFullscreen()
  }
}

// Alternative: fullscreen only the canvas area
// canvasContainer.value.requestFullscreen()
```

In `onMounted`:
```js
document.addEventListener('fullscreenchange', onFullscreenChange)
editorEl.value = // the root .whiteboard-editor div
```

CSS:
```css
.whiteboard-editor:fullscreen {
  background: #fff;
}
.whiteboard-editor:fullscreen .wb-header {
  /* header styling in fullscreen if kept visible */
}
.wb-fs-btn {
  padding: 0.5rem 0.75rem;
  background: #f1f3f4;
  border: 1px solid #dadce0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}
```

### Edge Cases
- F11 / Escape key exits fullscreen (browser-native) — our button state should sync
- Mobile browsers: restricted fullscreen API; guard with `document.fullscreenEnabled` check
- Cleanup `fullscreenchange` listener in `onUnmounted`

---

## 4. Real-Time Collaboration

**Complexity:** High (~900+ lines across multiple files)  
**Target files:** `server.js`, `src/components/WhiteboardEditor.vue`, new `src/collab/` module

### Architecture Overview

```
Client A                          Server                        Client B
   |                                |                              |
   |--- ws connect (token) -------->|                              |
   |<-- snapshot (full scene) ------|                              |
   |                                |<--- ws connect (token) -----|
   |                                |--- snapshot (full scene) -->|
   |                                |                              |
   |--- delta { op: "update",      |                              |
   |     element, timestamp } ---->|                              |
   |                                |--- broadcast delta -------->|
   |                                |   (to other clients)        |
   |                                |                              |
   |--- lock_request { elementId }->|                              |
   |<-- lock_granted { elementId }--|                              |
   |                                |--- lock_acquired { el, by }->|
```

### 4a. WebSocket Protocol

Extend existing `/ws` endpoint with new message types:

| Message | Direction | Payload |
|---|---|---|
| `snapshot` | Server → Client | `{ elements, appState, files }` (full `serializeAsJSON`) |
| `delta` | Client ↔ Server | `{ op: "create"|"update"|"delete"|"batch", elements, timestamp, clientId }` |
| `pointer` | Client → Server | `{ x, y, tool, button }` |
| `cursor_sync` | Server → Client | `{ clientId, pointer, username, color }` |
| `lock_request` | Client → Server | `{ elementId }` |
| `lock_release` | Client → Server | `{ elementId }` |
| `lock_state` | Server → Client | `{ locks: { [elementId]: clientId } }` |
| `presence_join/leave` | Server → Client | `{ clientId, username, color }` |
| `note_delta` | Client ↔ Server | `{ noteId, field, value, timestamp }` (for text notes) |
| `note_lock` | Client ↔ Server | `{ noteId, clientId }` |

### 4b. Server-Side (`server.js` changes)

```js
// Per-document session tracking
const documentSessions = new Map()  // docId -> Map<ws, { clientId, username, color }>

function broadcastToDocument(docId, message, excludeWs = null) {
  const sessions = documentSessions.get(docId)
  if (!sessions) return
  for (const [ws, info] of sessions) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }
}

// Element locks (server-authoritative)
const elementLocks = new Map()  // elementId -> { clientId, timestamp, ws }

// On ws message:
ws.on('message', (data) => {
  const msg = JSON.parse(data)
  switch (msg.type) {
    case 'delta':        // validate + broadcast to other clients
    case 'pointer':      // broadcast cursor position
    case 'lock_request': // check if element unlocked, grant if so
    case 'lock_release': // release lock
    case 'snapshot_request': // send full snapshot
  }
})
```

### 4c. Client-Side — Whiteboard Collaboration

**File:** `src/components/WhiteboardEditor.vue` (additions)

```js
// Collaboration state
const isCollaborating = ref(true)
const clientId = ref(generateClientId())
const collaborators = ref(new Map())  // socketId -> Collaborator

// Send local deltas on change
function handleChange(elements, appState, files) {
  currentElements = elements
  currentAppState = appState
  currentFiles = files
  hasUnsavedChanges = true

  // Diff and send delta
  if (ws && isCollaborating.value) {
    const delta = computeDelta(prevElements, elements)
    if (delta) {
      ws.send(JSON.stringify({
        type: 'delta',
        op: delta.op,
        elements: delta.elements,
        timestamp: Date.now(),
        clientId: clientId.value
      }))
    }
  }
  prevElements = elements
}

// Apply remote deltas
function applyRemoteDelta(delta) {
  if (delta.clientId === clientId.value) return  // skip own deltas
  if (!excalidrawAPI) return

  const currentElements = excalidrawAPI.getSceneElements()
  let merged = [...currentElements]

  // LWW: apply if remote timestamp > local timestamp for each element
  for (const remoteEl of delta.elements) {
    const localEl = merged.find(e => e.id === remoteEl.id)
    if (!localEl || remoteEl.updated > localEl.updated) {
      merged = localEl
        ? merged.map(e => e.id === remoteEl.id ? remoteEl : e)
        : [...merged, remoteEl]
    }
  }

  excalidrawAPI.updateScene({ elements: merged })
}
```

### 4d. LWW Conflict Resolution

Simple rule: each element carries a `version`/`updated` timestamp. On merge, later timestamp wins.

```js
function lwwMerge(localElements, remoteDelta) {
  const merged = [...localElements]
  for (const remoteEl of remoteDelta.elements) {
    const idx = merged.findIndex(e => e.id === remoteEl.id)
    if (idx === -1) {
      // New element from remote
      if (remoteDelta.op === 'create') merged.push(remoteEl)
    } else {
      // Existing element — compare timestamps
      if ((remoteEl.updated || 0) > (merged[idx].updated || 0)) {
        if (remoteDelta.op === 'delete') merged.splice(idx, 1)
        else merged[idx] = remoteEl
      }
    }
  }
  return merged
}
```

### 4e. Pessimistic Locking

Before editing an element:
1. Client sends `lock_request { elementId }`
2. Server checks if `elementLocks.has(elementId)` → if free, grants lock
3. Server broadcasts `lock_state` to all clients
4. Locked element shows visual indicator (border color = locker's color)
5. On element deselect/blur → send `lock_release`

For simplicity, lock only on double-click (entering edit mode), not on select/move.

### 4f. Remote Cursors / Presence

Use Excalidraw's built-in collaborators system:

```js
function updateRemoteCursors(remoteClients) {
  if (!excalidrawAPI) return
  const collab = new Map()
  for (const [socketId, info] of remoteClients) {
    collab.set(socketId, {
      socketId,
      username: info.username,
      pointer: info.pointer,
      button: info.button,
      color: info.color
    })
  }
  excalidrawAPI.updateScene({ collaborators: collab })
}
```

Connect via `onPointerUpdate` prop:
```js
// In Excalidraw props:
onPointerUpdate: (payload) => {
  ws.send(JSON.stringify({
    type: 'pointer',
    pointer: payload.pointer,
    button: payload.button
  }))
}
```

### 4g. Text Note Collaboration

Extend existing notes update flow:

```js
// In App.vue, when user starts editing a note:
function startEditingNote(note) {
  // Request lock on this note
  ws.send(JSON.stringify({
    type: 'note_lock',
    action: 'request',
    noteId: note.id
  }))
  // ... open modal, set editingId
}

// On save:
function saveNote(note) {
  // PUT with timestamp
  api(`/api/notes/${note.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: note.title,
      content: note.content,
      updated: Date.now(),
      clientId: clientId.value
    })
  })
  // Release lock
  ws.send(JSON.stringify({
    type: 'note_lock',
    action: 'release',
    noteId: note.id
  }))
}
```

Show "User X is editing" indicator on locked notes in the list.

### Implementation Order

1. **Server protocol + session management** — message types, per-document broadcasting
2. **Snapshot init + delta sync** (whiteboard) — get basic sync working
3. **LWW merge** — conflict resolution
4. **Pessimistic locks** — element locking with visual indicators
5. **Remote cursors + presence** — see who's online, where they are
6. **Text note collaboration** — lock + LWW for text notes

---

## Summary

| # | Feature | Complexity | Est. Lines | Priority |
|---|---|---|---|---|
| 1 | Stylus pen/eraser toggle | Low | ~30 | Phase 1 |
| 2 | Touch zoom+pan in pen mode | Medium | ~80 | Phase 2 |
| 3 | Full-screen mode | Low | ~50 | Phase 1 |
| 4 | Real-time collaboration | High | ~900+ | Phase 3 |

### Recommended Approach

- **Phase 1** (quick wins, ~1 session): #1 + #3 — stylus button + fullscreen
- **Phase 2** (~1 session): #2 — touch behavior
- **Phase 3** (major feature): #4 — collaboration (design doc first, then implement incrementally per 4g order)
