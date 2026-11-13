# AGENTS.md — Local Keep

## Overview

Google Keep-like notes app with text notes and Excalidraw whiteboard canvas. Vue 3 frontend, Express+SQLite backend, WebSocket real-time sync.

## Architecture

```
Docker "local-keep" (node:22-slim)
├── node --watch server.js    → Express + WS on :5173 (API only in dev)
└── npx vite --host 0.0.0.0   → HTTPS Vite dev server on :5174 (frontend)
```

- Host files live-mounted (`.:/app`), `node_modules` is a named volume
- Vite serves HTTPS (shared mkcert cert) and proxies `/api/*`, `/mcp`, and `/ws` → `:5173`
- Browser connects to **https://192.168.3.222:5174** (cert SAN is the LAN IP, not localhost)
- Host publishes are pinned per address (never `0.0.0.0`, the host has a public
  IPv6): `127.0.0.1:5173` for host MCP/API clients, `${LOCAL_KEEP_BIND:-192.168.3.222}:5174`
  for the LAN UI. LAN clients use the Vite proxy on `:5174`, not the raw backend
- Port 5173 serves only API/WebSocket in development (`NODE_ENV !== 'production'`)
- Port 5173 serves static frontend only in production mode (`NODE_ENV=production`)
- `node --watch` auto-restarts on `server.js` changes (no manual restart needed)
- Vite HMR handles frontend changes automatically

## Commands

```bash
docker compose up -d              # start container
docker restart local-keep         # full restart (only needed for dependency changes)
docker logs -f local-keep         # watch server logs
npm run build                     # build frontend (run inside container or on host)
npm test                          # node:test suite (server, migration, API, WS, MCP)
npm run mcp:token -- create "Claude Desktop"  # manage MCP tokens
npm run auth:reset -- <username>  # reset a human password (prints temp password)
npm run mcp                       # optional stdio MCP adapter
```

## File Structure

```
server.js                         # Composition root: Express routes, WS, image routes, /mcp
mcp-stdio.js                      # Optional stdio MCP adapter (direct DB)
scripts/mcp-token.js              # MCP token CLI
scripts/auth-reset.js             # human password reset CLI
src/
  main.js                         # Vue app entry
  styles/base.css                 # global tokens, focus ring, .sr-only
  App.vue                         # Main app: note list/editor, history, archived view, WS
  components/
    WhiteboardEditor.vue          # Excalidraw wrapper (manual React mount, not veaury bridge)
    DashboardNoteCard.vue         # virtual-list card (index summary + hydrated detail)
    TagSidebar.vue                # hierarchical tag tree/filter
    GraphView.vue, GraphCanvas.vue# relationship graph (d3-force)
    BacklinksPanel.vue            # incoming links + context
  collab/
    collabManager.js              # Client-side collab: delta, LWW, undo/redo, checkpoint
  server/
    db.js                         # openDatabase, migrations runner, backup
    config.js                     # config.json loader and safe defaults
    schema.js                     # Pre-revision base tables + FTS
    auth/passwords.js             # scrypt hashing, legacy upgrade, temp passwords
    embeddings/client.js           # OpenAI-compatible /embeddings client
    embeddings/rerankClient.js     # optional OpenAI-compatible /rerank client
    embeddings/chunk.js            # paragraph-aware chunker
    embeddings/secrets.js          # AES-GCM API-key encryption
    migrations/001-note-threads.js
    migrations/002-relationships-and-tags.js
    migrations/003-api-tokens.js
    migrations/004-multiuser-auth.js
    migrations/005-embeddings.js
    migrations/006-optional-rerank.js
    migrations/007-live-text-collab.js
    migrations/008-embedding-variants.js
    migrations/009-embedding-tuning.js
    migrations/010-token-admin.js
    migrations/011-mcp-session-limits.js
    migrations/012-app-settings.js
    migrations/013-note-color.js
    migrations/014-frozen-references.js
    migrations/015-properties-section.js
    migrations/016-unified-accounts-tag-whitelist.js
    services/notes.js             # head CRUD, archive/restore/purge, history facade
    services/revisions.js         # immutable revisions, branch, restore/promote, checkpoints
    services/imageRefs.js         # head/revision/tile image refs + cleanup
    services/users.js             # accounts, roles, password reset, last-admin guard
    services/embeddings.js        # admin config, vector tables, background indexer, vector search
    services/tags.js              # tag sync, tree, descendant filter
    services/textCollab.js        # Yjs live text docs, persistence, base revision
    services/mcpEditing.js        # MCP write/read sessions, state/guide, TTL
    services/uiSettings.js        # config-file defaults + runtime UI overrides
    services/links.js             # wiki-link sync/resolve, backlinks, graph
    services/renders.js           # whiteboard page manifests + staleness
    images.js, fts.js, canvas.js, events.js, sessionStore.js
  mcp/
    createServer.js               # MCP tools/resources (SDK v2)
  shared/
    notesText.js                  # display title + markdown-to-text (client/server)
    markdownCode.js               # code-aware transform helper
    tags.js, links.js             # tag/wiki-link parsers
    linkMarkdown.js               # markdown/wiki-link builders for the link dialog
    noteColors.js                 # dashboard note tint ids, labels, normalization
    uiConfig.js                   # UI dimension fields, defaults, and clamping
    shortcuts.js                  # central UI shortcut map + display/event normalization
    ime.js                        # IME composition guard for Enter/Escape handlers
    dialog.js                     # native overlay stack + dialog controller
  utils/
    markdown.js                   # sanitised renderer, Turndown paste conversion
    editorSerialize.js            # contentEditable -> canonical markdown
    whiteboardTiles.js            # pure reading-order page planner
    dashboardVirtual.js           # column count, row chunking, ranges, search ordering
    notes.js                      # compatibility re-export of shared note text
data/
  local-keep.db                   # SQLite database (head notes + revisions)
  images/                         # Content-addressed image files (SHA-256 hashed filenames)
  backups/                        # Pre-migration VACUUM INTO snapshots
config.json                       # Interface defaults (or LOCAL_KEEP_CONFIG path)
public/
  fonts/                          # Excalidraw fonts (served as static assets)
tests/                            # node:test suite + helpers (temp DB, server process)
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
- Image tool enabled — images sync via WebSocket `files` field, extracted to `data/images/` on server

### Real-time Collaboration

Multiple users, tabs, and devices. Same note, same WS endpoint (`/ws?token=`).

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
- `{ type: 'leave', noteId }` — leave a note (last leave forces a checkpoint)
- `{ type: 'delta', noteId, elements, files?, thumbnail? }` — send changes
- `{ type: 'checkpoint', noteId, reason? }` — force a canvas revision

**Protocol** (server → client):
- `{ type: 'snapshot', noteId, elements, files }` — full state on join
- `{ type: 'delta', noteId, elements, files, serverTs }` — incremental update
- `{ type: 'checkpoint-saved', noteId }` — checkpoint ack
- `{ type: 'note-created' | 'note-revised' | 'note-archived' | 'note-restored' | 'note-purged', ... }` — lifecycle events
- `{ type: 'note-deleted', noteId }` — archive notification used by the deletion mask
- `{ type: 'note-gone', noteId }` — delta rejected

### Live Text Collaboration

Text notes use a Yjs CRDT document per note, shared over the existing `/ws`
socket. The live document is a **shared draft**: it syncs on every edit, survives
reconnects, and is persisted in `note_text_docs`, but it is not a revision until
a client explicitly saves.

**Client** (`src/collab/textCollabManager.js`):
- Creates a local `Y.Doc` and binds `content` (`Y.Text`) and `meta.title` (`Y.Map`).
- Sends only local Yjs updates (`text-update`); applies remote updates and asks
  the editor to re-render.
- `applyMarkdown()` converts the editor snapshot into one contiguous Yjs
  delete/insert. The Visual editor captures/restores the text caret around a
  remote re-render; Source restores the textarea selection.
- `attach(socket)` / `detach()` handle reconnect. The snapshot includes the
  server state vector; the client sends any local-only state after applying it.

**Server** (`src/server/services/textCollab.js`, `server.js`):
- `note_text_docs(note_id, update_data, base_revision_id, updated_at)` stores the
  Yjs state. Loading creates a doc from the head when no row exists.
- `textSessions` tracks sockets per note; updates are applied to the server doc,
  broadcast to the other text sessions, and persisted with a 400 ms debounce.
- On the last leave, a clean draft (same content/title as the head) is deleted.
  `text-discard` deletes a draft only when the sender is the last editor.
- A browser Save (`source: 'ui'`, no conflict) updates the draft base revision
  and broadcasts `text-saved` with the committed head content. MCP/external edits
  do not move the draft base, so the next Save branches as usual.
- Restore/promote broadcasts `text-reset`; clients replace their local Y.Doc
  rather than merging (Yjs updates are additive).

**Dashboard drafts**:
- `GET /api/drafts` lists persisted `note_text_docs` rows whose title/content
  differs from the head; archived notes and clean/corrupt rows are omitted.
- The dashboard has mutually exclusive **Notes**, **Archived**, and **Drafts**
  tabs (`dashboardTab`). `sortedNotes` filters active vs archived; the Drafts tab
  maps API drafts to read-only cards. Quick Shortcuts appears only in Notes.
- Editor **Draft** closes without discarding the shared Yjs document, so it stays
  in the Drafts tab; **Discard** keeps the last-editor discard behavior; **Save**
  commits a revision. The unsaved dialog offers Save/Draft/Discard/Continue.
- Drafts are keyed by note id, so new-note drafts are not supported; the Draft
  action is hidden while creating a note.

**Protocol** (client → server):
- `{ type: 'text-join', noteId }`
- `{ type: 'text-leave', noteId }`
- `{ type: 'text-update', noteId, update }` (`update` is base64)
- `{ type: 'text-discard', noteId }`

**Protocol** (server → client):
- `{ type: 'text-snapshot', noteId, update, stateVector, baseRevisionId, revisionNo }`
- `{ type: 'text-update', noteId, update }`
- `{ type: 'text-saved', noteId, baseRevisionId, revisionNo, title, content }`
- `{ type: 'text-reset', noteId, update, baseRevisionId, revisionNo }`
- `{ type: 'text-discarded', noteId }`

**Presence**: `notePresence` tracks text and canvas sessions per note. Every
join/leave broadcasts `{ type: 'presence', noteId, count, users }`; a full
`presence` snapshot is sent on connect. The dashboard renders a green dot on the
corresponding card while any session has that note open.

### Note Threads and Revisions

- `notes.id` is the **stable document identity** for life. Never replace it with a
  revision id, never re-key the editor, card, WS session, or URL to a revision.
- `notes` is the materialized **head** (latest committed state). `note_revisions` is
  append-only history:
  `note_revisions(id, note_id, parent_revision_id, revision_no, title, content,
  display_title, type, canvas_data, thumbnail, snapshot_hash, actor, source, message,
  created_at)`.
- Creation and every committed text save create a revision. A stale save (different
  `baseRevisionId` from the head) creates a **branch** and leaves the head unchanged;
  `mode: 'take_head'` is the explicit override. Restore/promote append new revisions and
  never rewrite history.
- Editing sessions are identity-stable. The client holds
  `{ editingId, editingBaseRevisionId, editingRevisionNo }`; `editingId` never changes
  while the editor is open. `note_text_docs` holds the shared live draft; it must
  never create revisions or move the head until an explicit Save. `note_drafts`
  remains reserved for a future per-session autosave layer.
- `DELETE /api/notes/:id` **archives** (`archived_at`); revisions/images remain.
  `?purge=1` is the explicit permanent delete. Lists/search exclude archived notes by
  default (`includeArchived=1` to show them).
- Canvas revisions store **lean** `canvas_data` (file hash refs, no base64); the head keeps
  Excalidraw's required `dataURL`. Checkpoints happen on back/leave, manual
  `checkpoint`, or a 5-minute interval (`LOCAL_KEEP_CHECKPOINT_MS`), never per 500 ms
  delta.
- Migration is versioned (`schema_migrations`) and runs in one transaction after a
  `VACUUM INTO` backup under `data/backups/`. Existing notes become revision 1 with
  unchanged ids/content.

### Authentication and Users

- Human accounts are shared-workspace users with roles `admin`/`member`.
  `users.password_hash` uses scrypt (N=16384); the legacy 32-bit hash is accepted
  once for migration and upgraded on first login.
- First run creates the first admin. Existing single-password installs get
  `admin` / `Administrator` with the old password in migration 4.
- Sessions are opaque IDs stored in `sessions` (user_id, hash, expiresAt)
  and signed into the `local_keep_session` cookie — or
  `__Host-local_keep_session` when the cookie is `Secure`, which the
  `__Host-` prefix requires. The DB is authoritative for
  validation/revocation, so CLI resets invalidate live sessions immediately.
- `checkAuth`/`mcpAuth` share `authenticate()`: bearer MCP token → `mcp:<name>`,
  session → `user:<username>`. Admin routes use `requireAdmin`.
- Admin UI: add person, role changes, disable/enable, reset password (returns
  a one-time temporary password). CLI: `npm run auth:reset -- <username>`.
- Last active admin cannot be demoted or disabled. Password reset sets
  `must_change_password=1`; the UI forces a new password after login.
- **Unified accounts & API tokens**: API tokens belong to a human user account
  (`api_tokens.user_id`). Any user can create and manage their own client tokens;
  only admins can mint admin tokens or view all tokens.
- **Tag whitelist**: Users can have a `.gitignore`-style `tag_whitelist` (supporting
  globs like `work/*`, exclusions with `!rule`, and `:untagged` for notes without tags).
  Tag boundaries are enforced across REST endpoints, WebSocket broadcasts, search,
  and MCP tools. Admins have unrestricted access by default (empty whitelist);
  restricted users and their API tokens cannot see or modify notes outside their whitelist.

### HTTPS

- Vite uses `/app/certs/server.pem` + `server-key.pem` (mounted from
  `${LOCAL_KEEP_CERTS_DIR:-/home/tom/projects/certs}`). The mkcert SAN is
  `192.168.3.222`; use `https://192.168.3.222:5174`, not localhost.
- Express remains HTTP on 5173 inside the container; Vite proxies REST/WS/MCP.
  `COOKIE_SECURE=1` is set because the browser origin is HTTPS.
- If cert files are absent, Vite falls back to HTTP. Restart after rotating certs.
- Direct MCP clients can keep using `http://localhost:5173/mcp` (the port is
  published on `127.0.0.1` only); browser MCP clients can use
  `https://192.168.3.222:5174/mcp`, which is also how LAN machines reach the API.

### Security Headers

`server.js` sends a baseline header set on every response, from middleware
registered before the route handlers:

```
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
X-Frame-Options: DENY
```

- The policy has **no `default-src`** and names no source lists. It restricts
  only framing, plugins, and `<base>`. Do not add `default-src`,
  `script-src`, `style-src`, `img-src`, or `connect-src` without first
  accounting for the Excalidraw React mount, the Excalidraw fonts, and the
  `blob:` URLs the whiteboard exports images to.
- A strict policy is still the right end state. It has to be deployed
  **report-only** first, and the `innerHTML` sinks in `src/utils/markdown.js`,
  `src/utils/mermaid.js`, and the Visual editor have to become
  Trusted-Types-safe first. That is a separate change.
- `nosniff` depends on every content-bearing route setting a `Content-Type`.
  The image route uses `imageMimeForExt(ext)`; `express.static` derives it
  from the extension.
- The WebSocket handshake is not covered: it is not an HTTP response and
  carries no document.
- In development the **document** is served by Vite on `:5174`, not by
  Express, so the HTML itself does not carry these headers. The API
  responses proxied through Vite do.
- `tests/securityHeaders.test.js` enforces the header set and the absence of
  a `default-src`.

### Interface Configuration

- Interface dimensions live in `config.json` at the repo root. `LOCAL_KEEP_CONFIG`
  overrides the path. File edits are read at startup; restart after changing them.
- Fields are defined once in `src/shared/uiConfig.js` with min/max/step bounds:
  note editor width/height, link dialog width, graph width/height, and selection-links
  panel width/height. Default note editor is 960×760.
- Admins can override values at runtime from **avatar → 🎛 Interface**. Overrides live
  in `app_settings` (`key='ui'`, JSON patch), so they survive restarts without touching
  the file. **Reset to config file** deletes the override row.
- `GET /api/config` returns effective UI values to any authenticated user.
  `/api/admin/config` provides defaults, overrides, file path/error, and PUT/DELETE.
  Writes broadcast `{ type: 'config', config: { ui } }`; the WS handshake also sends it.
- The client applies values as CSS variables on `#app`. Components use
  `min(var(--…), viewport)` so large values still fit small screens. Manual note-modal
  resizing still wins via inline styles for that open modal.
- Migration 12 creates `app_settings`. Config-file values are clamped; runtime admin
  values are rejected with 400 when out of range.

### Browser Support

Baseline features that shipped in Chrome/Edge 116, Safari 17 and Firefox 125 or
earlier are usable. Adopt newer features only with a feature detect and a
graceful degradation, and never bundle a polyfill except where the guide
requires one.

| Feature | Status | Fallback |
|---|---|---|
| `<dialog>` + `showModal()` | Baseline | none needed |
| `closedby` | Chrome 134+, Firefox 141+, no Safari | `Esc`-only dismissal + the `pointerdown`/`pointerup` outside-test in `installLightDismiss` |
| `overscroll-behavior` | Chrome 144+, Firefox 150+, no Safari | progressive enhancement; the dialog still contains its own scroll and the page is still inert |
| `:focus-visible`, `color-mix`, `oklch`, `min()`/`max()`, `clamp()` | Baseline | none needed |
| `@container` + `container-type` | Baseline (Chrome 105+, Safari 16+, Firefox 110+) | none needed — the workspace layout is the only consumer |
| `content-visibility: auto` + `contain-intrinsic-size` | Baseline (Chrome 85+, Safari 18+, Firefox 125+) | none needed — the card keeps its fixed height either way |
| `popover` | Baseline (Chrome 116+) | **not used** — an unanchored popover is centred on the viewport and CSS anchor positioning is not Baseline |
| CSS anchor positioning | not Baseline | menus keep their absolute positioning |
| Invoker Commands (`command`/`commandfor`) | not Baseline | buttons keep their `@click` handlers |

### Overlays and Dialogs

Every blocking overlay is a native `<dialog>` opened with `showModal()`.

- `src/shared/dialog.js` owns the plumbing: `createOverlayStack()`,
  `createDialogController()`, `showModalDialog()`, `hideDialog()` and
  `installLightDismiss()`.
- The reactive `open` flag is the single source of truth. Every call site that
  sets it opens or closes the dialog — the controller watches it.
- The dialog's `close` event is the single source of truth for "this overlay
  is gone". It fires for `Esc`, the back gesture, and `close()`.
- The dim layer is `::backdrop`. Never paint a backdrop on the dialog itself.
- Do not add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling, a
  manual `Esc` handler, a `z-index`, or a manual `.focus()` call.
- Name each dialog with `aria-labelledby` and put `autofocus` on the primary
  control — or on the **safe** action in a destructive confirmation.
- `overlayStack` records the open overlays because the top layer does not
  follow DOM order. `shortcutRoot()` asks the stack.

### Semantic Search / Embeddings

- Optional admin-configured semantic search over text notes and canvas text.
  Provider is any OpenAI-compatible `POST /embeddings`; default SiliconFlow
  `https://api.siliconflow.cn/v1` (e.g. `BAAI/bge-m3`).
- `embedding_settings` is a singleton: enabled, base URL, encrypted API key,
  active model, dimensions, chunk size/overlap. The key is AES-256-GCM encrypted
  with a key derived from `data/server_secret`; never return it.
- **Model + dimension variant is the partition key.** `embedding_models` stores
  a hashed `emb_<hash(model+variant)>` table key and dimensions; `variant` is the
  dimensions string. Same model at the same dimensions reuses its original
  `embedding_chunks_emb_<hash>` + `embedding_vec_emb_<hash>` tables; a new model
  or dimensions creates new tables; switching back reuses the old table.
- Vector tables are `sqlite-vec` `vec0` tables using cosine distance. The
  database is opened with `allowExtension: true`; `sqlite-vec` is loaded from
  `node_modules/sqlite-vec-linux-x64/vec0.so`. The image is `node:22-slim`
  because the distributed extension is glibc, not musl/Alpine.
- Runtime batch tuning lives in `embedding_settings` (`batch_size`,
  `concurrency`, `max_batch_chars`, `note_concurrency`). Admin saves update it in
  SQLite; the next note uses the new batch values without a process restart;
  `note_concurrency` applies to the next background run. Do not introduce a
  separate tuning JSON/env layer.
- Chunking: markdown/canvas text → plain text, paragraph-aware chunks
  (default 1200 chars, 180 overlap). The note title prefixes the embedding input,
  not the stored chunk.
- Background worker indexes sequentially; note create/edit/checkpoint, archive,
  restore, and config changes enqueue work. Archived/purged notes remove chunks.
  In-flight results are discarded if the note hash changed.
- Search: `GET /api/search/semantic|hybrid`; MCP `search_notes` with
  `mode: keyword|semantic|hybrid` plus `semantic_search`. Hybrid uses RRF.
  Without a reranker, semantic results are cosine-similarity order and hybrid is
  RRF order; do not flatten either to `updatedAt`.
- Qwen3-Embedding is instruction-aware. `searchMatches` prefixes **queries** with
  `Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: …`.
  Indexed document chunks stay unprefixed; existing indexes remain valid. This
  asymmetry is required for short queries, especially Chinese (`云存储`). Other
  models use the raw query.
- Dashboard search uses `GET /api/search/hybrid` when hybrid is enabled, not the
  semantic-only endpoint. `GET /api/config.search` exposes non-secret availability
  (`semanticEnabled`, model, `rerankEnabled`). The browser toggle defaults on when
  available and honors `localStorage['local-keep-hybrid-search'] = '0'`; it is
  disabled when unavailable.
- Search results are displayed in API order. The first search switches the sort to
  **Relevance** (remembering the previous sort), and `orderBySearchResults` maps ids
  to ranks; missing ids sort last. Users may choose date/title sort during search.
  Clearing/closing search restores the previous sort. Hybrid `notice` / request
  failure or `semantic_count: 0` is labelled keyword; server notices are shown as a toast.
  Tab/sort/tag/search changes reset the viewport to the notes grid top below the
  sticky header and control/selection bar; keep the second RAF pass for virtual
  spacer updates.
- Optional rerank (`BAAI/bge-reranker-v2-m3` etc.). If unset, semantic search is
  vector-only. If configured, it reorders the semantic candidate list; failure
  falls back to vector order with `rerank.error`. It can reuse the embedding
  base URL/key or use a separate encrypted key. Rerank does not partition tables.
- Admin UI: avatar → **✨ Hybrid search**; APIs under `/api/admin/embeddings`.
  `Rebuild index` force-queues all notes. Old model tables are preserved.

### Markdown Editor and Rendering

- Canonical text content is markdown. The client renderer lives in
  `src/utils/markdown.js`: `marked` (GFM, breaks) + `DOMPurify`. Paste defaults to
  plain text (`text/plain`) with a toolbar switch for opt-in rich mode; rich mode converts
  `text/html` through Turndown + GFM. The preference is per browser (`local-keep-paste-mode`
  in localStorage).
- Two modes: **Source** (raw markdown textarea, image references shown as URLs) and
  **Visual** (contentEditable, rendered markdown, images displayed). **Source is the
  default** for new and existing notes; opening the editor must not depend on the last
  used mode. `Ctrl/Cmd+Shift+M` toggles them. Preview was removed because Visual already
  renders the note; the gallery and detail view are the read-only surfaces.
- The markdown toolbar (`MarkdownToolbar.vue` + `shared/editorTools.js`) is available in
  both modes: inline formatting, headings, quote, lists, links/wiki links, code, tables,
  and rules. Shortcuts require Ctrl/Cmd; hold Alt/Option to replace tooltips with shortcuts.
  Toolbar buttons prevent `mousedown` so the editor/textarea selection is preserved.
- The same Alt/Option reveal state (`shortcutsVisible` in `App.vue`) drives dashboard
  action tooltips. Header controls use `AppIcon.vue` (inline SVG) with
  `data-label`/`data-shortcut`; holding Alt reveals shortcut hints for actions that
  declare a shortcut, even without hover. Do not reintroduce emoji or add hints for
  shortcuts that are not actually handled.
- Link insertion uses `LinkDialog.vue`, not `window.prompt`. Regular links edit Text + URL;
  wiki links search `/api/search` as you type (excluding the current/archived notes), offer
  recent notes for an empty query, and allow new titles. The pre-dialog editor selection is
  captured and replaced on submit.
- The wiki renderer emits `data-note-target` + `data-note-label`; the serializer uses both so
  aliased unresolved links round-trip as `[[target|label]]`.
- Images: Visual renders them; Source shows `![alt](/api/images/...)`; image insertion
  and paste insert an `<img>` in Visual and a markdown reference in Source. Switching
  modes never rewrites images or URLs.
- Switching out of Visual serialises **only when the DOM is un-serialised**; switching
  back re-renders from markdown. Merely opening a note (including a shared draft) or
  toggling modes must not rewrite canonical markdown or trigger the unsaved-changes prompt.
  `editorDirty` means "DOM needs serialising", not "content differs from head"; use
  `hasUnsavedChanges()` for the latter. `syncVisualEditor()` serialises and clears the
  flag; `applySharedText()` clears it after rendering a snapshot.
- Marked v18's GFM tokenizer accepts a single tilde as strikethrough. A `literalTilde`
  inline extension consumes lone `~` as text so paths such as `~/.config` stay literal;
  only `~~text~~` strikes through. Do not remove this extension or add a preprocess strip
  that could alter link URLs.
- `src/utils/editorSerialize.js` converts the rich editor to markdown: headings,
  paragraphs, ordered/unordered lists, blockquotes, fenced/inline code, tables, HR,
  links, wiki-link spans, images with `{width=N}`.
- Paste defaults to plain text: read `text/plain`, ignore `text/html`, and insert literally
  (Visual text node with `white-space: pre-wrap`; Source at the textarea caret). This keeps
  Source byte-identical to what was pasted. The editor toolbar's **Paste: plain/rich**
  switch opts into rich mode, which converts `text/html` with `htmlToMarkdown` and inserts
  rendered markdown (Visual) or converted markdown (Source). Clipboard image files remain
  an exception and are uploaded as markdown images in both modes. Save still normalises
  `data:image` references and aborts with a notice if an upload fails.
- Raw HTML in note markdown is escaped, not interpreted. This preserves technical notes
  containing literal `<type>` snippets. The renderer has an optional `resolveLink`
  callback for `[[...]]`; unresolved links get `.note-link--broken`.
- Fenced ` ```mermaid ` blocks render as SVG in Visual and gallery views. `renderMarkdown`
  emits a `.mermaid-block` skeleton with a hidden `.mermaid-source`; `src/utils/mermaid.js`
  lazy-loads Mermaid and hydrates after the HTML is in the DOM. Source mode keeps the
  fence visible. `serializeEditorToMarkdown` writes the block back to a mermaid fence.
  Mermaid errors show an inline error and keep the source visible; they must not break
  the note.
- Gallery cards and preview share the same renderer; do not reintroduce the old regex
  `renderContent`/`markdownToHTML` helpers.

### Keyboard Shortcuts

- `src/shared/shortcuts.js` is the single source of truth for workspace
  shortcuts (`SHORTCUTS`), platform labels, and event normalization. `App.vue`
  exposes `shortcut(id)` to templates; components that render outside the app
  tree receive `modKey` as a prop.
- Buttons declare `data-shortcut` with the display label (`R`, `Ctrl+Enter`,
  `Ctrl+Alt+V`). The global dispatcher finds a matching visible button in the
  topmost overlay and clicks it; hidden dashboard buttons are not activated
  while a modal is open. If a form field has focus, a matching submit button in
  that form wins over another form's button in the same modal.
- **Alt/Option only** reveals shortcut hints; Ctrl/Cmd alone does not. Bare Alt
  keydown/keyup is `preventDefault`-ed at window level so the browser (Chrome's
  menu bar) does not act on it. `Ctrl/Cmd+Alt+…` combos are unaffected because
  only bare Alt presses are intercepted. Plain-key shortcuts are
  ignored while an input, textarea, select, or contenteditable has focus;
  modifier shortcuts still work (for example `Ctrl+Alt+D` for Draft).
- `Esc` closes the topmost overlay, `Ctrl/Cmd+Enter` submits the focused form,
  and secondary actions use `Ctrl/Cmd+Alt+...`. Avoid browser-reserved combos.
- Every unique action button in `App.vue` and primary overlay components has a
  shortcut. Repeated per-row controls (revision View/Restore/Promote, user
  reset/disable, token revoke, note color swatches, tag rows, card actions)
  remain native keyboard-accessible controls without ambiguous global bindings.
- The tag sidebar shows a leaf tag icon instead of depth indentation; parent
  rows keep the expand/collapse arrow. The Quick Shortcuts card documents the
  core shortcuts and the hold-Alt reveal behavior.

### Tags and sidebar layout

- The tag sidebar is a fixed 230px column with `overflow-x: hidden`; long tag
  names truncate with an ellipsis so a horizontal scrollbar can never appear.
- The sidebar stacking is driven by a **container query**, not a media query.
  `main` is the query container (`container-type: inline-size;
  container-name: workspace`), and both the sidebar rule in `TagSidebar.vue`
  and the `.workspace { flex-direction: column }` rule in `App.vue` use
  `@container workspace (max-width: 600px)`. They must use the same container
  and the same threshold; `tests/responsiveLayout.test.js` fails if they
  drift. If they do, a `width: 100%` sidebar lands inside a row flex
  container and crushes/overflows the notes area.
- A container query measures the **content box**. `main` has `2rem` of
  horizontal padding, so the viewport width and the workspace width differ by
  64px — a viewport media query fires 64px too late.

### Relationships and Tags

- Wiki links: `[[Title]]`, `[[Title|label]]`, `[[note:<id>|label]]`. Parsing is
  code-aware via `src/shared/markdownCode.js`; titles resolve against head
  `title`/`display_title`; ambiguous/unresolved/archived statuses are stored.
- `note_links` is rebuilt for the source note whenever the head moves; branches do not
  affect head links. Title changes call `links.resolveAll()` globally. Backlinks include
  a context snippet; `GET /api/graph` returns nodes/edges (BFS for note+depth).
- Tags are inline `#tag` / `#area/project/topic`, code-aware, NFKC/lowercased, hex
  colours rejected, max 100/note. `note_tags` stores full paths; the tree computes
  unique-note direct/subtree counts. `GET /api/tags` returns the tree.
- The editor's tag input suggests existing paths while typing (client-side fuzzy
  ranking in `matchTags` from `src/shared/tags.js`: exact, path prefix, segment
  prefix, substring, then in-order subsequence). Applied tags are excluded, and a
  manually typed new tag still commits with Enter/blur.
- The UI filters tags client-side from the in-memory note list (including archived notes)
  so link resolution stays complete; the API also supports `tag`/`exactTag` for external
  clients. Descendants are included by default.
- Components: `TagSidebar`, `GraphView`/`GraphCanvas` (`d3-force`), `BacklinksPanel`.
- The gallery's multi-select **🔗 Links** action calls `POST /api/notes/links/summary`
  and shows both directions in `SelectionLinksPanel`; it groups by counterpart note and
  is read-only (opening a row follows the normal note-open flow).
- Do not make tags/links describe branch revisions; they are head-level materialised views.

### Dashboard Notes and Colors

- `notes.color` stores an optional tint id from `src/shared/noteColors.js`
  (`blue`, `green`, `amber`, `rose`, `violet`, `slate`); `NULL` means the note-type
  default (blue text notes, violet whiteboards). It is head-level presentation metadata:
  it is not revisioned, does not change `updatedAt`, and survives edits/archive/restore.
- `PUT /api/notes/:id/color` validates the palette, returns the updated DTO, and
  broadcasts `{ type: 'note-color', noteId, color }`. The dashboard picker sits right of
  the card checkbox; it applies optimistically, reverts on failure, and closes on
  outside click/Escape. `DashboardNoteCard` emits one `{ note, color }` payload;
  `readNoteColorChange()` unwraps it before calling the API. Do not treat the
  payload as the note object or the request becomes `/api/notes/undefined/color`.
- Card tints are shared CSS variables (`--card-surface-*`, `--card-border-color`,
  `--card-accent-*`) set by `.note-color-*` classes. Keep archived rules after color
  classes so archived cards stay muted.
- Quick Shortcuts is a read-only **virtual** note (`isQuickShortcuts`) prepended by
  `dashboardNotes` for rendering only in the unfiltered Notes tab. It is never in
  `noteIndex`, `sortedNotes`, Select All, counts, search, tag filters, or editing
  sessions. Its markdown body uses the normal `.note-preview` scrollbar; the checkbox,
  color picker, copy, and delete/restore are hidden and `handleCardClick` returns early.
- The Drafts tab maps `GET /api/drafts` entries to read-only cards (`isDraft`). They
  show a Draft badge, hide selection/color/copy/delete, and open the real note so
  `startTextCollab` can load the shared draft.

### Virtualized Dashboard

- The dashboard no longer keeps every full note in memory. `noteIndex` is the complete
  lightweight list (id, title, display title, type, revision, archived state, dates,
  color, tags, link counts); `noteDetails` is a bounded reactive `Map` of card bodies.
  Use the index for filters, sorting, counts, search-result ids, wiki-link resolution,
  Select All, drafts, and Link dialog recents.
- `GET /api/notes/index` returns the index and `POST /api/notes/window` returns ordered
  card DTOs for up to 200 ids. Window DTOs include text content (first 12,000 chars,
  flagged `contentTruncated`), canvas thumbnails, and omit `canvasData`; opening a note
  with a truncated/missing body fetches the full note.
- `vue-virtual-scroller` renders responsive **rows**, not individual cards. `noteColumnCount`
  comes from the measured container width; `chunkDashboardItems` groups the flat list;
  each row has a fixed `396px` height (380px card + 16px gap). The scroller uses
  `page-mode`, an `800px` render buffer, and `:emit-update="true"`.
- `.note-content` (the card body) uses `content-visibility: auto`, so a card that is
  off-screen skips layout and painting. The card's height is explicit (380px) and the
  body is sized by the flex algorithm, so the row height cannot change. See gotcha 76
  before moving an absolutely positioned element into the card body.
- Card bodies hydrate in 30-note batches as the visible range changes. Keep one batch of
  prefetch on each side, evict outside that padded range, and never evict the editing
  note. The hard cache cap is 120 notes. `DashboardNoteCard` shows summary metadata plus a
  skeleton until its detail arrives.
- Open paths go through `openNoteById` / `ensureNoteDetail`, which fetch the full note when
  the cached body is missing or when a canvas scene is required. The editor baseline for
  unsaved-change detection is captured at `startEditing` (`editingOriginal*`), not read
  from the index.
- The WebSocket bulk `notes` message is now an index. Apply it with `applyNoteIndex`,
  invalidate details whose revision/timestamp/title changed, and rehydrate the visible
  range. While the editor is open, buffer the index until close as before.
- `DashboardNoteCard.vue` renders Quick Shortcuts, drafts, archived cards, colors,
  presence, and all card actions. Keep its markup and the App-level handlers in sync; do
  not reintroduce a second inline card template.
- The virtual list is a rendering and detail-cache optimization, not server-side
  filtering. Search, tags, and sorting remain client-side over the complete index.

### Whiteboard Pages

- `src/utils/whiteboardTiles.js` is a pure planner: groups/frames/bindings become atomic
  units, spatial clusters are ordered into top-to-bottom bands and left-to-right within a
  band, then greedily packed into 1600×1600 scene-unit pages (gap 48).
- The browser exports pages sequentially with `exportToBlob` (`maxWidthOrHeight: 2000`,
  padding 24), uploads PNGs to `/api/images`, and posts an ordered manifest. Server-side
  rendering is deliberately unsupported.
- `whiteboard_renders` / `whiteboard_tiles` store the current manifest plus history;
  `scene_hash` is compared with the head `canvas_hash` for `stale`. Legacy thumbnails are
  one-tile renders with `source='legacy-thumbnail'`.
- Triggers: Pages → Render now, leaving the whiteboard when stale, and WS
  `render-request` from a future MCP/other client. Progress/cancel is client-side.
- Routes: `GET /api/notes/:id/renders/latest`, `PUT /api/notes/:id/renders`,
  `POST /api/notes/:id/renders/request`. WS: `render-request`, `render-complete`,
  `render-updated`.
- Tile hashes are referenced by `whiteboard_tiles` and protected from image cleanup;
  old renders can be pruned only by an explicit policy.
- Whiteboard titles use a WS `title` message (client -> server) and `title-updated`
  (server -> other editors). The server commits the title through `notes.updateNote`
  with the current head as base; do not persist titles only in client state.
- `persistNoteState` must preserve `noteRow.thumbnail` when `state._thumbnail` is null.
  Checkpoints and deltas without a fresh thumbnail must not erase the last good cover.

### Embedded MCP

- Endpoint `/mcp` uses MCP SDK v2 `createMcpHandler` + `toNodeHandler`; the factory runs
  per request with `authInfo`. The Express body is passed to `toNodeHandler`.
- Auth: `Authorization: Bearer lk_mcp_...` or session cookie. `api_tokens` stores only
  SHA-256 hashes. Token names become actors `mcp:<name>`; `ui` is the browser actor.
  State is keyed by token id (`authInfo.clientId`), not the display name, so duplicate
  token names never share sessions.
- `checkAuth` (REST) and `mcpAuth` share `authenticate()`. Token mutations require the
  `write` or `admin` scope; read-only tokens can only GET/MCP read tools.
- Tools call the same services as REST/WS; MCP edits create revisions, branch on stale
  bases, emit `note.revised`, and notify open browsers. `docs/mcp.md` is the user guide.
- The MCP tool list is **stable**. `edit_note` is one-shot only; persistent sessions use
  `get_note_state` + `note_session`. Do not reintroduce dynamic open/close tool
  registration or rely on `tools/list_changed` for FSM correctness.
- Session state is per token: up to `max_write_sessions` write sessions (default 5) and
  `max_read_sessions` read sessions (default 8). Limits live in `mcp_settings` and are
  admin-editable in **MCP access → Session limits**; changes apply to new opens without a
  restart. Opening write on a note with a read session upgrades it; opening another write
  after the limit returns `too_many_writes` with the open sessions and guide. Opening read
  for a note that already has a write returns that write session (`read_included`).
  `state.writes` lists all writes; `state.write` remains the first for compatibility.
- `mcpEditing` (`src/server/services/mcpEditing.js`) holds write/read sessions and applies
  edits to `note_text_docs`. Sessions are advisory, TTL-based
  (`LOCAL_KEEP_MCP_EDIT_TTL_MS`, default 30m), and never a hard lock. `get_note_state`
  is always available. Session and mutation results include `state`, `allowed_actions`,
  and `guide`; list/text tools keep their native shapes. Errors include the same
  envelope and a structured `error.code`.
- `note_session` actions: `open_read`, `open_write`, `read`, `replace`, `insert`,
  `delete`, `append`, `set_title`, `save`, `close`, `status`. Mutations require a write
  session; read sessions return `session_mode_mismatch` with a guide to open write.
- `note_session action=save` commits with source `mcp-open`; it updates the draft base and
  broadcasts `text-saved`. One-shot MCP edits use `source: 'mcp'` and must not move a live
  draft base. Archive/purge/restore/promote and token revocation close affected sessions.
- `search_notes`/`list_notes` summaries include `archived_at` and `is_archived` when
  archived rows are included; use these instead of diffing active/all lists.
- Tags are inline content, so `add_tags`/`remove_tags` edit content and create one
  revision per changed note. Both accept multiple note ids + `dry_run`; `edit_note` and
  `append_to_note` also accept `tags`. Use `src/shared/tags.js` helpers, never a raw
  regex append. Archived notes are skipped/`note_archived` until restored.
- `purge_note` permanently deletes one archived note (preview without `confirm: true`,
  optional `expected_title`). `purge_archived` previews by default; bulk purge requires
  `expected_count`, while an explicit `note_ids` subset does not. Both reject active notes
  and require no open write session. `archive_note` remains the reversible operation.
- `edit_note`/`append_to_note` return compact note/revision metadata by default; pass
  `include_content: true` for full bodies. `get_note` omits canvas `canvasData`/`thumbnail`
  unless `include_canvas: true` (use `get_whiteboard` for page recall). `append_to_note`
  normalizes blank lines and accepts `message`.
- Opening a write/read session on an archived note returns `note_archived` (not
  `note_not_found`). `note_session close` reports `draft_kept` from the persisted draft
  row, so a saved clean draft reports `false`.
- `get_whiteboard` returns ordered image blocks/markdown/URLs; stale renders can ask a
  connected browser via `render-request`. No server-side rendering.
- Token management: UI 🔌 modal, `/api/mcp/tokens`, `npm run mcp:token`. Human admins and
  admin-scoped tokens can manage client tokens; only a human admin session can mint a new
  admin token. Admin tokens can use `/api/admin/*`.
- stdio adapter (`mcp-stdio.js`) opens the DB directly with WAL; HTTP is preferred because
  stdio writes cannot push WS events to an open browser. stdio supports persistent
  sessions too, but cannot see browser presence and never discards a dirty shared draft.

### DB Schema

```sql
notes (
  id TEXT PK, title, content, type, canvasData, thumbnail, createdAt, updatedAt,
  head_revision_id, revision_no, display_title, content_hash, canvas_hash,
  archived_at, last_checkpoint_at, color
)
note_revisions (
  id TEXT PK, note_id, parent_revision_id, revision_no, title, content, display_title,
  type, canvas_data, thumbnail, snapshot_hash, actor, source, message, created_at
)
note_drafts (note_id, session_id, base_revision_id, title, content, updated_at)
note_text_docs (note_id PK, update_data BLOB, base_revision_id, updated_at)
note_events (id, note_id, revision_id, type, actor, payload, created_at)
note_meta (note_id, key, value_text, value_num, value_type)  -- fence property index
note_tags (note_id, tag, source, created_at)              -- head-level tag paths
note_links (id, source_note_id, source_revision_id, target_note_id, target_label,
            label, target_kind, raw, status, source, created_at)
notes_fts (note_id, title, content, canvas_text)          -- FTS5; content is plain text
users (id, username, display_name, password_hash, role, must_change_password,
       created_at, updated_at, last_login_at, disabled_at)
sessions (sessionId, user_id, hash, expiresAt)
embedding_settings (id=1, enabled, base_url, api_key_encrypted, model, dimensions,
                    chunk_size, chunk_overlap, batch_size, concurrency,
                    max_batch_chars, note_concurrency, last_tested_at, last_error,
                    updated_at, rerank_enabled, rerank_base_url,
                    rerank_api_key_encrypted, rerank_model, rerank_top_n)
embedding_models (model, variant, table_key, dimensions, base_url, chunk_count, status,
                  last_indexed_at, last_error, created_at, updated_at)
                  -- PRIMARY KEY(model, variant); variant is the dimensions string (e.g. "4096")
embedding_index_state (model, variant, note_id, revision_id, content_hash, chunk_count,
                       status, error, updated_at)  -- PRIMARY KEY(model, variant, note_id)
-- per model: embedding_chunks_emb_<hash>, embedding_vec_emb_<hash> (vec0 cosine)
image_refs (image_hash, note_id)                          -- head/tile refs
revision_image_refs (image_hash, revision_id)             -- protects old-version images
whiteboard_renders (id, note_id, revision_id, scene_hash, ...)
whiteboard_tiles (render_id, page_index, image_hash, ...)
api_tokens (id, name, token_hash, scopes, created_at, last_used_at, revoked_at,
            expires_at, created_by)
mcp_settings (id=1, max_write_sessions, max_read_sessions, updated_at)
app_settings (key, value, updated_at)                     -- runtime UI overrides (key='ui')
```

**Critical**: `canvas_text` column exists ONLY in `notes_fts`, NOT in `notes`. The
`persistNoteState()` function must write `canvasData` to `notes` and `canvas_text` to
`notes_fts` separately.


### Image Storage

- Images stored in `data/images/<sha256-prefix>.<ext>` (content-addressed, deduped)
- Text notes: `![alt](/api/images/<hash>.<ext>)` markdown syntax, rendered inline via contentEditable
- Whiteboard: Excalidraw `files` object with base64 dataURL, extracted to disk on persist
- `image_refs` table tracks usage; `POST /api/images/cleanup` removes orphaned images
- Broken images (404): hidden in gallery view, converted to markdown text in editor

### Touch/Stylus Support (WhiteboardEditor.vue)

- Finger touches (`touchType !== 'stylus'`) counted via `touchstart`/`touchend`/`touchcancel`
- ≥2 fingers → switch to `'hand'` tool (enables pan/zoom)
- On finger lift → restore previous tool
- Stylus side button: `keyup` with `key: 'Unidentified'`, `keyCode: 0` (no `keydown` in Safari)

## OpenSpec

Behavior changes belong in OpenSpec, even during fast iteration. Create or update a change
under `openspec/changes/` with proposal/spec/design/tasks artifacts before implementing,
and sync the delta specs into `openspec/specs/` when the behavior ships. Use the
`openspec-*` skills or `/opsx-*` commands rather than editing main specs ad hoc. Run
`openspec validate --strict` before archiving. If a change was implemented without specs,
use the sync/archive skills as a redemption path and record the retrofit in the changelog.

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
8. **Diagram syntax**: Mermaid fenced blocks are supported in notes; use standard Mermaid v11 syntax. On a parse/render error the block shows an inline error and keeps the source, so switch to Source to fix it.
9. **Port distinction**: In development, port 5173 is API-only (no frontend). Port 5174 is the Vite dev server. Access app at `:5174`, not `:5173`. Backend serves static files only when `NODE_ENV=production`.
10. **Stable note identity**: `editingId`/`notes.id` must never become a `revisionId`. Revisions are versions; the document id is permanent. Client saves send `baseRevisionId`; a stale save branches by default and must show the notice.
11. **Archive vs purge**: `DELETE /api/notes/:id` archives; use `?purge=1` only for permanent deletion. Archived notes are excluded from lists/search but retain revisions and image refs.
12. **Canvas revision snapshots**: `note_revisions.canvas_data` must be lean (no `dataURL`); the head keeps `dataURL` so Excalidraw renders. Hydrate historical scenes from `data/images` when restoring.
13. **Migration backup**: never delete `data/backups/pre-migration-*.db` (the first live run used `pre-note-threads-*.db`) until the migrated database has been accepted. Migration runs in one transaction and fails closed.
14. **Tests use temp data**: `npm test` starts ephemeral servers with `LOCAL_KEEP_DATA_DIR` and `PORT`; never point tests at the real `data/` directory.
15. **Markdown renderer**: always use `renderMarkdown()` from `src/utils/markdown.js`; never render note HTML directly. Raw HTML is escaped; wiki links use a placeholder replaced after `marked` parsing. Mermaid placeholders MUST be hydrated with `renderMermaidBlocks()` after insertion (gallery `MarkdownView` does this; the editor calls it after `renderEditorContent`).
16. **Editor modes**: `newNoteContent` is the single canonical string. Visual is contentEditable; Source is a raw markdown textarea. Serialise before leaving Visual only when dirty; never keep a separate copy per mode. Save normalises/upload `data:image` refs before `POST`/`PUT`.
17. **Wiki links**: `note:<id>` is the stable form; title links can become ambiguous. Parsing is code-aware; do not regex the raw content without `transformOutsideCode`.
18. **Tag filtering**: the UI keeps all active+archived notes in memory and filters tags client-side so link resolution stays complete. The server also supports `tag`/`exactTag` for API/MCP; descendants are included by default.
19. **Whiteboard page rendering is browser-only**: `exportToBlob` needs DOM/fonts. If no browser is open, the API returns the last manifest with `stale`; MCP will need to request a render rather than synthesize one.
20. **Page planner order**: never replace the band/x ordering with a simple sort by y; that breaks left-to-right reading within a row. Keep bound arrows/text/frames in one unit.
21. **MCP auth**: `/mcp` must never be anonymous. Tokens are hashed; token names are actors `mcp:<name>`. Do not log raw tokens. Human admins and admin-scoped tokens may manage client tokens; only a human admin session may mint another admin token.
22. **MCP whiteboard recall**: render pages in the browser; if no browser is connected, return the stale manifest with a notice. Do not add headless Chromium to the server for this.
23. **HTTPS cert SAN**: the shared mkcert cert is for `192.168.3.222`, not `localhost`; use the IP or issue a cert for your hostname. `COOKIE_SECURE=1` means login cookies only work over HTTPS.
24. **Multiuser migration**: existing installs become `admin` / `Administrator` with the old password. Do not delete `users`/`sessions`; use `npm run auth:reset -- <username>` for recovery and keep at least one active admin.
25. **sqlite-vec / image**: the loadable extension is glibc; keep `node:22-slim` (or rebuild for musl). `openDatabase` must pass `allowExtension: true` before `loadExtension`.
26. **Embedding model partitions**: never store vectors of two model/variant pairs in one table. Use the hashed `emb_<hash(model+variant)>` table key; `variant` is the dimensions string (for Qwen3, e.g. 4096/1024). A changed model or dimensions gets a new table, and switching back reuses the old one. Do not reject same model name with different dimensions; that is a separate variant.
27. **Embedding key**: only decrypt in the server; never return `api_key_encrypted` or log the key. The admin API returns `hasApiKey`/mask only.
28. **Embedding index freshness**: note head edits/checkpoints and archive/restore must enqueue the note. A failed embedding call must not delete the previous vector rows; index atomically after all vectors succeed.
29. **Rerank is optional**: never make semantic search depend on a reranker. If it is unset or fails, return vector order and expose `rerank.error`; do not fail the request.
30. **Yjs resets need a fresh doc**: Yjs updates are additive. `text-reset` must replace the local `Y.Doc`, not apply the head update to the old doc, or discarded draft text remains merged in.
31. **Live text is draft-only**: `note_text_docs` must never update `notes.content`, `head_revision_id`, tags, or links. Only an explicit Save commits a revision. Do not make live typing bypass optimistic concurrency.
32. **Text presence and canvas presence share `notePresence`**: add/remove both kinds on join/leave/close so dashboard dots never stick. Only text sessions use `textSessions`; canvas sessions remain in `noteStates`.
33. **Remote text re-render and caret**: the Visual editor must capture/restore the caret around a remote re-render and defer during IME composition. Without this, two clients typing makes the local caret jump or the editor goes stale.
34. **MCP sessions are per token, not per process**: `authInfo.clientId` is the stable token id in the stateless transport. A token may hold several write sessions (default 5) so multiple sub-agents can share it; `state.writes` is authoritative and `state.write` is the first write for older clients. Do not use a global note lock.
35. **MCP tools stay stable**: `get_note_state` and `note_session` are always registered. Every result/error includes `state`, `allowed_actions`, and `guide`; do not derive FSM state from `tools/list` or dynamic tool visibility.
36. **MCP session save source**: `note_session action=save` commits with `source: 'mcp-open'` so the draft base moves and browsers get `text-saved`. One-shot `edit_note`/`append_to_note` use `source: 'mcp'` and must not move a live draft base.
37. **Quick Shortcuts is virtual**: it is rendered by `dashboardNotes` only in the unfiltered Notes tab. Never insert `__quick_shortcuts__` into `noteIndex`, `sortedNotes`, selection, search, tags, counts, or API calls. Hide its card controls via `isQuickShortcuts`; do not reintroduce a separate card template.
38. **Note colors are head metadata**: update `notes.color` only. Do not create a revision, bump `updatedAt`, or copy the tint into `note_revisions`; archived card styles must stay after `.note-color-*`. Under the properties model this is the folder *icon*: display metadata that is not file content, which is why it stays unversioned.
39. **Archived, Notes, and Drafts stay separate**: `dashboardTab` drives the lists; do not reintroduce a `showArchived` toggle that mixes archived rows into Notes. Switching tabs must clear selection.
40. **Drafts are `note_text_docs`**: Draft closes the editor without discarding, Discard removes the shared document for the last editor, and only Save commits a revision. `GET /api/drafts` must omit clean and archived drafts; New Note has no draft because it has no note id yet.
41. **MCP tag edits are property mutations**: `add_tags`/`remove_tags`/the `tags` argument rewrite the `tags` list in the properties section via `notes.setProperties` — never the body. Use `normalizeTag` from `src/shared/tags.js` and never append raw `#tags`. Tag operations create revisions with `source: 'property'`, and archived notes are rejected (`note_archived`).
42. **MCP purge is archived-only and guarded**: `purge_note` requires `confirm: true`; `purge_archived` previews unless confirmed and requires `expected_count` for an all-archived purge. Never expose an unguarded delete action or purge active notes through these tools.
43. **MCP mutation responses are compact by default**: return note/revision summaries unless `include_content: true`; strip canvas payloads from `get_note` unless `include_canvas: true`. Do not reintroduce full base64/canvas blobs into list or mutation output.
44. **Single tildes are literal**: marked's GFM tokenizer accepts `~text~`. Keep the `literalTilde` inline extension so `~/.config` paths do not become `<del>` spans and do not round-trip into `~~`. Only `~~text~~` is strikethrough. `editorDirty` tracks un-serialised DOM edits only; `applySharedText`/`syncVisualEditor` must clear it so clean mode switches do not rewrite source.
45. **Paste defaults to plain text**: plain mode uses `text/plain` and `insertPlainTextAtCursor`; rich mode (toolbar `pasteMode`, persisted in localStorage) uses `htmlToMarkdown` + `insertMarkdownAsRich` (Visual) or `insertMarkdownAtCursor` (Source). Keep plain as the default: HTML conversion is lossy for underline/highlight/spans and complex tables. Clipboard image files are the only non-text exception. `htmlToMarkdown` must keep the double-tilde strike rule, Google Docs wrapper cleanup, table-header promotion, and fenced `<pre>` handling.
46. **The dashboard is index-first**: never restore `notes.value` as a full-note array. `noteIndex` drives ordering, tabs, counts, search, tags, links, and selection; `noteDetails` only holds card bodies/thumbnails for the bounded visible window. Use `patchNote`/`upsertNote` instead of mutating index entries.
47. **Virtual rows must keep fixed height**: `RecycleScroller` item size is `396px` (380px card + 16px gap). If card height or grid gap changes, update `NOTE_ROW_HEIGHT` and the design/spec together. Keep `:emit-update="true"`; without it the visible-range hydration never fires (cards stay skeletons after scrolling).
48. **Canvas cards and full notes are separate**: `/api/notes/window` omits `canvasData`, so whiteboards must go through `openNoteById`/`ensureNoteDetail` before `openCanvasNote`. Do not render a whiteboard from a card DTO. The WebSocket `notes` payload is an index, not full notes; do not assume `content` or `canvasData` exists on `data.notes`.
49. **Search order is the ranking**: dashboard search must call `/api/search/hybrid` when hybrid is enabled and must render ids in returned order (default **Relevance**). Never re-sort search results by `updatedAt`; that silently discards BM25, cosine similarity, and RRF. The hybrid toggle defaults on when `/api/config.search.semanticEnabled`, is opt-out per browser, and falls back to keyword with the server `notice`. Search requests carry a sequence guard so stale responses cannot overwrite newer rankings.
50. **Qwen3 queries need the instruction, documents do not**: `embeddingQueryInput()` adds the Qwen3-Embedding retrieval instruction only at query time. Do not add it to indexed chunks and do not send it to the reranker. Without it, short queries compress to ~0.5 similarity and rank unrelated notes first; no reindex is needed after adding it.
51. **Keyboard shortcuts are declarative but handled**: every `data-shortcut` must have a visible button and a unique combo within its overlay context. The dispatcher only clicks the topmost visible layer; do not add hints for unhandled or background actions. Keep plain keys blocked in text entry, keep the focused form preference for `Mod+Enter`, and keep `Esc` on the topmost overlay close button.
52. **Excalidraw `updateScene` ignores `files`**: `SceneData` in @excalidraw/excalidraw 0.18 has no `files` field — `updateScene({ elements, files })` silently drops the files. Register remote image binaries with `api.addFiles(array)` AFTER the image elements are applied and in the same tick; an image element rendered before its file entry exists gets a permanent error placeholder (the "needs a refresh" bug). Never route collab files through `updateScene`.
53. **One bind per host port (rootless Docker)**: rootlesskit's port driver fails with "address already in use" when the same host port is published on two addresses. Keep `5173` on `127.0.0.1` and `5174` on `${LOCAL_KEEP_BIND:-192.168.3.222}`, and never go back to `0.0.0.0` — the host has a public IPv6 prefix.
54. **The title lives outside the fence**: `notes.title` is head metadata (the folder name), never a `title:` fence key. Renaming creates no revision and must not touch `note_revisions` (pinned links render the revision's recorded title). Restore/promote copy content and properties but keep `notes.title`. Only `title`, `color`, and `type` are reserved keys; `tags` and `aliases` are ordinary fence properties.
55. **`noteHash()` must cover every retrieval input**: the embedding index hash includes title, tags, and body. If you add an input to the chunk prefix (see `embeddingQueryInput` / `noteTags` in `src/server/services/embeddings.js`), add it to `noteHash()` too — otherwise edits to that input produce an unchanged hash and the note is never re-indexed. Fence text is stripped before FTS/vector text (`noteIndexText`, `noteText`), so YAML keys are never searchable prose.
56. **The fence is a strict subset**: `src/shared/noteMeta.js` parses one `key: value` per line, flow lists, and quoted scalars; it rejects anchors, aliases, type tags, block scalars, nested mappings, and comments. Values that YAML would coerce or truncate (`no`, `2026-11-01`, `3.0`, `#e2ece4`) are written quoted, and untouched values keep their raw scalar text so parse→serialise is byte-identical. Do not swap in a general YAML parser: `3.0` → `3` is a valid YAML round-trip and a lossy note round-trip.
57. **The shared text draft is BODY-ONLY**: `note_text_docs` and the Yjs `content` text hold the body without the fence; properties ride `meta.props`, and the file is reassembled with `joinFence(props, body)` at every commit (`mcpEditing.save`, `App.vue` `saveEdit`/`addNote`). Storing the whole file in the draft made `buildNoteContent(props, body)` prepend a **second fence on every save** — it stacked four fences into one note's content (real corruption, repaired as `v6 | property | repair duplicated properties fence`). A fence-inclusive draft also made `hasUnsavedChanges()` true for untouched notes, so closing any note popped the draft dialog. `baseContent`/`isCleanEntry` compare body-only for the same reason.
58. **Shape changes need a consumer audit, not a search-and-replace**: splitting canonical content into `props` + `body` touched FTS, embeddings, markdown, notes, revisions, tags and MCP — and the bug survived because the one layer I missed (`textCollab`) *stores* the shape instead of rendering it. For any cross-cutting data-shape change, enumerate every read **and** write path first, including persistence (Yjs, `note_text_docs`, snapshots, exports). This is why 157 tests passed while data was corrupting: the save-through-draft path had no coverage. Add the regression test in the same commit as the fix.
59. **`:where()` only helps if EVERY fallback is wrapped**: to declare a default that loses to a modifier class, wrap the whole fallback selector in `:where()` (specificity 0). One unwrapped declaration on the same element silently wins by source order — no warning, no error. This is why the editor tint stayed white despite `.note-color-amber` being applied: `.note-form-modal`'s white `--card-surface-*` defaults overrode the tint. Check the built CSS, not just the source.
60. **Repair and migration scripts must be import-safe**: wrap side effects in `main()` gated on `import.meta.url === pathToFileURL(process.argv[1]).href`, and export only the pure helpers. `scripts/repair-fences.js` wrote to the live database on a bare `import`, bypassing its own `--dry-run` gate. A dry-run flag is worthless if importing ignores it. Verify the guard by importing the module and asserting nothing is written.
61. **New-note state must be reset explicitly**: `noteProps`, `tagDraft`, `propKeyDraft`, and the tag-suggestion state are editor-local. Every new-note path (`openNewNoteModal`, global paste) and `closeModal` must call `resetNoteProps()`; otherwise tags added in the previous editor session appear on the next new note. Existing notes still load their parsed fence in `startEditing`.
62. **Tag autocomplete is advisory and client-side**: `matchTags` ranks exact → path prefix → segment prefix → substring → in-order subsequence and excludes tags already on the note. Enter accepts a highlighted suggestion but must still add a manually typed new path; do not make the dropdown a closed list of existing tags.
63. **IME-owned keystrokes must not be intercepted**: while an IME composes, `Enter` confirms the candidate, `Escape` cancels it, and the arrow keys move between candidates. Any keydown handler that acts on those keys must stand down. Use `isImeComposing(event)` / `runUnlessIme(event, action)` from `src/shared/ime.js` — never check `isComposing` inline, and never apply Vue's `.prevent` modifier to an `Enter`/`Escape` binding: `.prevent` expands to a `preventDefault()` that runs *before* the handler body, so it cannot stand down and it swallows the candidate confirmation. Drop `.prevent` and call `event.preventDefault()` inside the handler, after the composition check. The `keyCode === 229` fallback exists only because Safari delivers `compositionend` before the confirming `Enter` keydown, and it is deliberately limited to `Enter`/`Escape`/`Tab`: soft keyboards report `229` for ordinary character entry. `Ctrl/Cmd+Enter` is exempt — modifier combos do not conflict with candidate confirmation. `tests/ime.test.js` enforces the invariant at the source level.
64. **`App.vue` and the other components use the Options API**: they are `<script>` blocks with an explicit `setup()` return object, not `<script setup>`. A new function that the template calls must be added to that return object or the template silently gets `undefined`.
65. **Global tokens and the focus ring live in `src/styles/base.css`**: it is unscoped and imported from `main.js`. Text colours come from `--text-muted` / `--text-success` (never a raw hex — every value must clear 4.5:1 on white, and `tests/accessibility.test.js` enforces it). Do NOT write `outline: none` on a focusable control: the shared `:focus-visible` ring is the only indicator, and deleting it silently removes the keyboard affordance. Per gotcha 59, that global rule is wrapped in `:where()` so a component *can* override it deliberately — but only with a compliant replacement.
66. **Spatial motion is opt-in**: keyframe animations and `transform` transitions belong inside the `@media (prefers-reduced-motion: no-preference)` block at the end of `App.vue`'s stylesheet, never in the base rule. Colour, opacity, filter, box-shadow, and border-radius transitions stay in the base rule. Do not use the global `animation-duration: 0.01ms` reset — the guide calls it out as making some animations *more* jarring.
67. **One polite and one assertive live region**: `App.vue` keeps a single `role="status"` and a single `role="alert"`, both `.sr-only`. Announce through `notify(message, 'polite' | 'assertive')`, never by adding another `role="status"` to a component. `notify()` clears the region before writing so a repeated message is announced again.
68. **Scrollbars use the standard properties plus an isolated fallback**: a container that customises a scrollbar MUST declare `scrollbar-width` and `scrollbar-color`, and its `::-webkit-scrollbar` rules MUST sit inside `@supports not (scrollbar-color: auto)`. The thumb colour comes from `--scrollbar-thumb` / `--scrollbar-thumb-dark` in `src/styles/base.css` and must clear 3:1 against the container background where the track is transparent — `tests/visualTokens.test.js` computes and enforces it. Do not repeat the colour in the fallback block: the custom property cascades.
69. **`color-scheme` is declared, dark mode is not**: the app is deliberately light-only and `src/styles/base.css` says `color-scheme: light` so UA-drawn surfaces match. Adding a `prefers-color-scheme: dark` theme is a separate product decision, not a tweak — do not bundle it.
70. **Every `<img>` declares `loading` and `decoding`**: `tests/visualTokens.test.js` scans the template blocks of every component and fails on an `<img>` without them. Do not combine `fetchpriority="high"` with `loading="lazy"`, and do not add `fetchpriority="low"` to a lazy image. Note that a rendered note image's size cannot be reserved — the image store does not report dimensions — so `aspect-ratio` is not available there.
71. **Blocking overlays are native `<dialog>` elements**: the note editor, the link dialog, the revision history, the graph, the backlinks and selection-links panels, and every admin settings dialog. They are opened with `showModal()` through `createDialogController` in `src/shared/dialog.js`, so the platform provides focus containment, background inertness, the top layer, `Esc` dismissal and focus return. Do NOT add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling, a manual `Esc` handler, a `z-index`, or a manual `.focus()` call to them. The dim layer is `::backdrop`, not a background on the dialog. `tests/overlays.test.js` enforces these invariants.
72. **The topmost overlay comes from the overlay stack, not DOM order**: overlays live in the top layer, so DOM order no longer describes stacking. `overlayStack` in `App.vue` records them and `shortcutRoot()` asks it. Add a new overlay to the stack through its `createDialogController`; do not reintroduce a DOM-order lookup.
73. **`role="menu"` needs the whole menu pattern**: arrow keys, a roving `tabindex`, `Home`/`End`, `Escape` to close, and focus moving into the menu. The account menu and the colour pickers do not implement it, so they use plain buttons and toggle buttons (`aria-pressed`) in a `role="group"` instead. Do not use `popover` for them either: an unanchored popover is centred on the viewport, and CSS anchor positioning is not Baseline.
74. **Browser floor**: Baseline features that shipped in Chrome/Edge 116, Safari 17 and Firefox 125 or earlier are usable. `<dialog>` and `showModal()` are Baseline; `closedby` is not (Chrome 134+, Firefox 141+, no Safari) and degrades to `Esc`-only dismissal plus the `pointerdown`/`pointerup` outside-test in `installLightDismiss`. `overscroll-behavior` is not universally supported and is progressive enhancement. No polyfill is bundled.
75. **The workspace layout is a container query, not a media query**: `main` carries `container-type: inline-size; container-name: workspace`, and the sidebar stacking and the `.workspace` column switch both live in `@container workspace (max-width: 600px)` — in `TagSidebar.vue` and `App.vue` respectively. A container query measures the **content box**, and `main` has `2rem` of padding, so a viewport media query fires 64px too late. The two thresholds must stay identical; `tests/responsiveLayout.test.js` enforces it.
76. **`content-visibility: auto` creates a containing block**: it implies paint and layout containment, so an absolutely positioned descendant of the skipped element is anchored to it instead of to the card. That is why `.presence-dot` is a direct child of `.note-card` and not of `.note-content`. Do not move it back. Also never put `content-visibility: auto` on a scroll container (`.note-preview`): a skipped subtree has no scrollable overflow, so the scrollbar would vanish and reappear and reflow the text under the cursor.
77. **The `__Host-` cookie prefix and the `Secure` attribute are one decision**: `secureCookies()` in `src/server/sessionStore.js` is the single predicate that decides both, so a prefixed cookie is always `Secure` and a `Secure` cookie is always prefixed. The browser rejects a `__Host-` cookie that is not `Secure`, has a `Domain`, or has a `Path` other than `/`. Renaming the cookie invalidates the browser's copy, so the first request after a deploy needs one re-login; the sessions in the database stay valid.
78. **The CSP has no `default-src` on purpose**: it constrains only framing, plugins, and `<base>`. Do not add `default-src`, `script-src`, `style-src`, `img-src`, or `connect-src` without accounting for the Excalidraw React mount, the Excalidraw fonts, and the `blob:` URLs the whiteboard exports. A strict policy is deployed report-only first, and the `innerHTML` sinks have to be converted to Trusted-Types-safe APIs before it can be enforced.
79. **A native `<dialog>` is centred by the UA's automatic margin, not by flexbox**: the UA gives a modal `position: fixed; inset: 0` and lets `margin: auto` push the box into the middle. The global reset in `index.html` (`* { margin: 0 }`, specificity 0,0,0) zeroes that margin, so `src/styles/base.css` restores it with `dialog { margin: auto }` (0,0,1, which always wins). Two things must hold together, or every modal lands in the **top-left corner** instead of the middle of the screen: (a) the reset must keep the selector `*` — give it anything more specific and it beats the restore; (b) each overlay dialog must use `width: fit-content`, because `width: auto` stretches the dialog *box* across the whole viewport while the panel inside it stays at `0,0`. A `width: 100%` panel inside a `fit-content` dialog then collapses to zero, so panels need a definite width. `tests/overlays.test.js` enforces all four.
80. **The note editor resize must clamp to the viewport itself**: the resize writes an inline `width`/`height` *and* `max-width: none; max-height: none`, so the CSS `min(…, 94vw)` clamp is overridden and a dragged modal grows past the edge of the screen. The clamp has to be applied in `onResize` with `window.innerWidth`/`innerHeight`.
