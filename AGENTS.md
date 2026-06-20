# AGENTS.md — Local Keep

## Overview

Google Keep-like notes app with text notes and Excalidraw whiteboard canvas. Vue 3 frontend, Express+SQLite backend, WebSocket real-time sync.

## Architecture

```
Docker "local-keep" (node:22-alpine)
├── node --watch server.js    → Express + WS on :5173
└── npx vite --host 0.0.0.0   → Vite dev server on :5174
```

- Host files live-mounted (`.:/app`), `node_modules` is a named volume
- Vite proxies `/api/*` → `:5173` and `/ws` → `ws://:5173`
- Browser connects to **:5174** (Vite), which proxies to backend
- `node --watch` auto-restarts on `server.js` changes (no manual restart needed)
- Vite HMR handles frontend changes automatically

## Commands

```bash
docker compose up -d              # start container
docker restart local-keep         # full restart (only needed for dependency changes)
docker logs -f local-keep         # watch server logs
npm run build                     # build frontend (run inside container or on host)
```

## File Structure

```
server.js                         # Express backend: REST API, SQLite, WebSocket collab
src/
  main.js                         # Vue app entry
  App.vue                         # Main app: note list, canvas routing, WS wiring
  components/
    WhiteboardEditor.vue          # Excalidraw wrapper (manual React mount, not veaury bridge)
  collab/
    collabManager.js              # Client-side collab: delta generation, LWW merge, undo/redo
data/
  local-keep.db                   # SQLite database
public/
  fonts/                          # Excalidraw fonts (served as static assets)
index.html                        # Sets window.EXCALIDRAW_ASSET_PATH = "/"
vite.config.js                    # Vue + React plugins, API/WS proxy
docker-compose.yml                # Container config
```

## Tech Stack

- **Frontend**: Vue 3 (Composition API), React 18 (for Excalidraw only), @excalidraw/excalidraw 0.18
- **Backend**: Express, ws (WebSocket), node:sqlite (experimental SQLite driver)
- **Build**: Vite 5, @vitejs/plugin-vue, @vitejs/plugin-react@4 (v5+ breaks with Vite 5)

## Key Patterns

### Excalidraw Integration (WhiteboardEditor.vue)

Excalidraw is a React component embedded in Vue. Uses **manual React mount**, not veaury bridge:

```js
const reactRoot = createRoot(canvasContainer.value)
reactRoot.render(React.createElement(Excalidraw, { ... }))
```

- `excalidrawAPI` callback receives the API object → passed to collabManager
- `onChange` callback receives elements on every change
- `window.EXCALIDRAW_ASSET_PATH = "/"` set in index.html for font loading
- Image tool disabled via `UIOptions.tools: { image: false }` + paste interceptor

### Real-time Collaboration

Single user, multiple terminals. Same note, same WS endpoint (`/ws?token=`).

**Client** (`collabManager.js`):
- Factory function `createCollabManager({ noteId, generateThumbnail, onStatus })`
- Debounced change detection (500ms): compares `currentElements` vs `lastCommitted` via JSON.stringify
- Sends `{ type: 'delta', noteId, elements, thumbnail }` to server
- LWW merge: elements have `_collab_ts` timestamps, higher wins
- Custom undo/redo via `api.registerAction()` — per-operation element tracking
- `attach(ws)` / `detach(ws)` lifecycle, `setAPI(api)` for Excalidraw API

**Server** (`server.js`):
- Per-note in-memory state: `noteStates` Map with `elements` (Map), `sessions` (Set), `pendingPersist`
- `applyDelta()`: LWW merge with server-assigned `_collab_ts` timestamps
- `schedulePersist()`: 500ms debounce → `persistNoteState()` writes to SQLite
- `broadcastToNote()`: sends delta to all other sessions on the same note
- Snapshot sent on `join` with current elements from DB or in-memory state

**Protocol** (client → server):
- `{ type: 'join', noteId }` — join a note, receive snapshot
- `{ type: 'leave', noteId }` — leave a note
- `{ type: 'delta', noteId, elements, thumbnail }` — send changes

**Protocol** (server → client):
- `{ type: 'snapshot', noteId, elements, files }` — full state on join
- `{ type: 'delta', noteId, elements, serverTs }` — incremental update

### DB Schema

```sql
notes (id TEXT PK, title TEXT, content TEXT, type TEXT, canvasData TEXT, thumbnail TEXT, createdAt TEXT, updatedAt TEXT)
notes_fts (note_id, title, content, canvas_text)  -- FTS5 for search
```

**Critical**: `canvas_text` column exists ONLY in `notes_fts`, NOT in `notes`. The `persistNoteState()` function must write `canvasData` to `notes` and `canvas_text` to `notes_fts` separately.

### Touch/Stylus Support (WhiteboardEditor.vue)

- Finger touches (`touchType !== 'stylus'`) counted via `touchstart`/`touchend`/`touchcancel`
- ≥2 fingers → switch to `'hand'` tool (enables pan/zoom)
- On finger lift → restore previous tool
- Stylus side button: `keyup` with `key: 'Unidentified'`, `keyCode: 0` (no `keydown` in Safari)

## Changelog

All notable changes must be recorded in `CHANGELOG.md`. When making changes:

1. Add an entry under `[Unreleased]` during development
2. Move to a versioned section when the change is complete
3. Use categories: `Added`, `Changed`, `Fixed`, `Removed`
4. One line per change, past tense, be specific

## Gotchas

1. **Server restart**: `node --watch` handles `server.js` changes. For dependency changes, `docker restart local-keep`.
2. **`canvas_text` column**: Only in `notes_fts`, never in `notes`. Writing it to `notes` crashes the server.
3. **`@vitejs/plugin-react`**: Must use v4, not v6+. v6 requires Vite 6.
4. **React in Vue**: Manual `createRoot` + `React.createElement`. Veaury bridge was tried but abandoned.
5. **Excalidraw `registerAction`**: `perform` must return `false` or `{ elements, appState, captureUpdate }`. Invalid return crashes the action system.
6. **Safari stylus**: No `keydown` for side button, only `keyup` with `keyCode: 0`.
7. **`_collab_ts`**: Server-assigned timestamps on elements. Must be stripped before comparing/storing (`stripTs()`).
