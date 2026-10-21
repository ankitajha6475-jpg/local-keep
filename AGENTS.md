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
  App.vue                         # Main app: note list/editor, history, archived view, WS
  components/
    WhiteboardEditor.vue          # Excalidraw wrapper (manual React mount, not veaury bridge)
    TagSidebar.vue                # hierarchical tag tree/filter
    GraphView.vue, GraphCanvas.vue# relationship graph (d3-force)
    BacklinksPanel.vue            # incoming links + context
  collab/
    collabManager.js              # Client-side collab: delta, LWW, undo/redo, checkpoint
  server/
    db.js                         # openDatabase, migrations runner, backup
    schema.js                     # Pre-revision base tables + FTS
    auth/passwords.js             # scrypt hashing, legacy upgrade, temp passwords
    embeddings/client.js           # OpenAI-compatible /embeddings client
    embeddings/chunk.js            # paragraph-aware chunker
    embeddings/secrets.js          # AES-GCM API-key encryption
    migrations/001-note-threads.js
    migrations/002-relationships-and-tags.js
    migrations/003-api-tokens.js
    migrations/004-multiuser-auth.js
    migrations/005-embeddings.js
    services/notes.js             # head CRUD, archive/restore/purge, history facade
    services/revisions.js         # immutable revisions, branch, restore/promote, checkpoints
    services/imageRefs.js         # head/revision/tile image refs + cleanup
    services/users.js             # accounts, roles, password reset, last-admin guard
    services/embeddings.js        # admin config, vector tables, background indexer, vector search
    services/tags.js              # tag sync, tree, descendant filter
    services/links.js             # wiki-link sync/resolve, backlinks, graph
    services/renders.js           # whiteboard page manifests + staleness
    images.js, fts.js, canvas.js, events.js, sessionStore.js
  mcp/
    createServer.js               # MCP tools/resources (SDK v2)
  shared/
    notesText.js                  # display title + markdown-to-text (client/server)
    markdownCode.js               # code-aware transform helper
    tags.js, links.js             # tag/wiki-link parsers
  utils/
    markdown.js                   # sanitised renderer, Turndown paste conversion
    editorSerialize.js            # contentEditable -> canonical markdown
    whiteboardTiles.js            # pure reading-order page planner
    notes.js                      # compatibility re-export of shared note text
data/
  local-keep.db                   # SQLite database (head notes + revisions)
  images/                         # Content-addressed image files (SHA-256 hashed filenames)
  backups/                        # Pre-migration VACUUM INTO snapshots
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
  while the editor is open. `note_drafts` exists for a future autosave layer and must
  never create revisions or move the head until an explicit commit.
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
  and signed into the `local_keep_session` cookie. The DB is authoritative for
  validation/revocation, so CLI resets invalidate live sessions immediately.
- `checkAuth`/`mcpAuth` share `authenticate()`: bearer MCP token → `mcp:<name>`,
  session → `user:<username>`. Admin routes use `requireAdmin`.
- Admin UI: add person, role changes, disable/enable, reset password (returns
  a one-time temporary password). CLI: `npm run auth:reset -- <username>`.
- Last active admin cannot be demoted or disabled. Password reset sets
  `must_change_password=1`; the UI forces a new password after login.
- The workspace is shared; there is no per-note ACL in this version.

### HTTPS

- Vite uses `/app/certs/server.pem` + `server-key.pem` (mounted from
  `${LOCAL_KEEP_CERTS_DIR:-/home/tom/projects/certs}`). The mkcert SAN is
  `192.168.3.222`; use `https://192.168.3.222:5174`, not localhost.
- Express remains HTTP on 5173 inside the container; Vite proxies REST/WS/MCP.
  `COOKIE_SECURE=1` is set because the browser origin is HTTPS.
- If cert files are absent, Vite falls back to HTTP. Restart after rotating certs.
- Direct MCP clients can keep using `http://localhost:5173/mcp`; browser MCP
  clients can use `https://192.168.3.222:5174/mcp`.

### Semantic Search / Embeddings

- Optional admin-configured semantic search over text notes and canvas text.
  Provider is any OpenAI-compatible `POST /embeddings`; default SiliconFlow
  `https://api.siliconflow.cn/v1` (e.g. `BAAI/bge-m3`).
- `embedding_settings` is a singleton: enabled, base URL, encrypted API key,
  active model, dimensions, chunk size/overlap. The key is AES-256-GCM encrypted
  with a key derived from `data/server_secret`; never return it.
- **Model name is the partition key.** `embedding_models` stores a hashed
  `emb_<hash>` table key and dimensions. Same model name reuses the original
  `embedding_chunks_emb_<hash>` + `embedding_vec_emb_<hash>` tables; a new name
  creates new tables; switching back reuses the old table. Same name with
  different dimensions is rejected.
- Vector tables are `sqlite-vec` `vec0` tables using cosine distance. The
  database is opened with `allowExtension: true`; `sqlite-vec` is loaded from
  `node_modules/sqlite-vec-linux-x64/vec0.so`. The image is `node:22-slim`
  because the distributed extension is glibc, not musl/Alpine.
- Chunking: markdown/canvas text → plain text, paragraph-aware chunks
  (default 1200 chars, 180 overlap). The note title prefixes the embedding input,
  not the stored chunk.
- Background worker indexes sequentially; note create/edit/checkpoint, archive,
  restore, and config changes enqueue work. Archived/purged notes remove chunks.
  In-flight results are discarded if the note hash changed.
- Search: `GET /api/search/semantic|hybrid`; MCP `search_notes` with
  `mode: keyword|semantic|hybrid` plus `semantic_search`. Hybrid uses RRF.
  UI ✨ search toggle falls back to keyword with a notice on failure.
- Admin UI: avatar → **✨ Semantic search**; APIs under `/api/admin/embeddings`.
  `Rebuild index` force-queues all notes. Old model tables are preserved.

### Markdown Editor and Rendering

- Canonical text content is markdown. The client renderer lives in
  `src/utils/markdown.js`: `marked` (GFM, breaks) + `DOMPurify`; HTML paste conversion
  uses `Turndown` + `turndown-plugin-gfm`.
- Three modes: **Write** (contentEditable), **Markdown** (raw textarea), **Preview**
  (read-only sanitised render). `Ctrl/Cmd+Shift+M` cycles modes. Switching out of Write
  serialises first; switching back re-renders from markdown.
- `src/utils/editorSerialize.js` converts the rich editor to markdown: headings,
  paragraphs, ordered/unordered lists, blockquotes, fenced/inline code, tables, HR,
  links, wiki-link spans, images with `{width=N}`.
- Rich paste is converted to markdown and sanitised; `data:image` sources are uploaded
  and rewritten to `/api/images/<hash>.<ext>` before insertion/save. Save aborts with a
  notice if an image upload fails (no silent base64 persistence).
- Raw HTML in note markdown is escaped, not interpreted. This preserves technical notes
  containing literal `<type>` snippets. The renderer has an optional `resolveLink`
  callback for `[[...]]`; unresolved links get `.note-link--broken`.
- Gallery cards and preview share the same renderer; do not reintroduce the old regex
  `renderContent`/`markdownToHTML` helpers.

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
- The UI filters tags client-side from the in-memory note list (including archived notes)
  so link resolution stays complete; the API also supports `tag`/`exactTag` for external
  clients. Descendants are included by default.
- Components: `TagSidebar`, `GraphView`/`GraphCanvas` (`d3-force`), `BacklinksPanel`.
- Do not make tags/links describe branch revisions; they are head-level materialised views.

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

### Embedded MCP

- Endpoint `/mcp` uses MCP SDK v2 `createMcpHandler` + `toNodeHandler`; the factory runs
  per request with `authInfo`. The Express body is passed to `toNodeHandler`.
- Auth: `Authorization: Bearer lk_mcp_...` or session cookie. `api_tokens` stores only
  SHA-256 hashes. Token names become actors `mcp:<name>`; `ui` is the browser actor.
- `checkAuth` (REST) and `mcpAuth` share `authenticate()`. Token mutations require the
  `write` scope; read-only tokens can only GET/MCP read tools.
- Tools call the same services as REST/WS; MCP edits create revisions, branch on stale
  bases, emit `note.revised`, and notify open browsers. `docs/mcp.md` is the user guide.
- `get_whiteboard` returns ordered image blocks/markdown/URLs; stale renders can ask a
  connected browser via `render-request`. No server-side rendering.
- Token management: UI 🔌 modal, `/api/mcp/tokens`, `npm run mcp:token`.
- stdio adapter (`mcp-stdio.js`) opens the DB directly with WAL; HTTP is preferred because
  stdio writes cannot push WS events to an open browser.

### DB Schema

```sql
notes (
  id TEXT PK, title, content, type, canvasData, thumbnail, createdAt, updatedAt,
  head_revision_id, revision_no, display_title, content_hash, canvas_hash,
  archived_at, last_checkpoint_at
)
note_revisions (
  id TEXT PK, note_id, parent_revision_id, revision_no, title, content, display_title,
  type, canvas_data, thumbnail, snapshot_hash, actor, source, message, created_at
)
note_drafts (note_id, session_id, base_revision_id, title, content, updated_at)
note_events (id, note_id, revision_id, type, actor, payload, created_at)
note_tags (note_id, tag, source, created_at)              -- head-level tag paths
note_links (id, source_note_id, source_revision_id, target_note_id, target_label,
            label, target_kind, raw, status, source, created_at)
notes_fts (note_id, title, content, canvas_text)          -- FTS5; content is plain text
users (id, username, display_name, password_hash, role, must_change_password,
       created_at, updated_at, last_login_at, disabled_at)
sessions (sessionId, user_id, hash, expiresAt)
embedding_settings (id=1, enabled, base_url, api_key_encrypted, model, dimensions,
                    chunk_size, chunk_overlap, last_tested_at, last_error, updated_at)
embedding_models (model, table_key, dimensions, base_url, chunk_count, status,
                  last_indexed_at, last_error, created_at, updated_at)
embedding_index_state (model, note_id, revision_id, content_hash, chunk_count, status, error, updated_at)
-- per model: embedding_chunks_emb_<hash>, embedding_vec_emb_<hash> (vec0 cosine)
image_refs (image_hash, note_id)                          -- head/tile refs
revision_image_refs (image_hash, revision_id)             -- protects old-version images
whiteboard_renders (id, note_id, revision_id, scene_hash, ...)
whiteboard_tiles (render_id, page_index, image_hash, ...)
api_tokens (id, name, token_hash, scopes, created_at, last_used_at, revoked_at)
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
8. **Syntax limitations**: Avoid unsupported diagram syntax (for example Mermaid block syntax that the renderer rejects). Prefer broadly supported flowchart syntax when editing docs or architecture notes.
9. **Port distinction**: In development, port 5173 is API-only (no frontend). Port 5174 is the Vite dev server. Access app at `:5174`, not `:5173`. Backend serves static files only when `NODE_ENV=production`.
10. **Stable note identity**: `editingId`/`notes.id` must never become a `revisionId`. Revisions are versions; the document id is permanent. Client saves send `baseRevisionId`; a stale save branches by default and must show the notice.
11. **Archive vs purge**: `DELETE /api/notes/:id` archives; use `?purge=1` only for permanent deletion. Archived notes are excluded from lists/search but retain revisions and image refs.
12. **Canvas revision snapshots**: `note_revisions.canvas_data` must be lean (no `dataURL`); the head keeps `dataURL` so Excalidraw renders. Hydrate historical scenes from `data/images` when restoring.
13. **Migration backup**: never delete `data/backups/pre-migration-*.db` (the first live run used `pre-note-threads-*.db`) until the migrated database has been accepted. Migration runs in one transaction and fails closed.
14. **Tests use temp data**: `npm test` starts ephemeral servers with `LOCAL_KEEP_DATA_DIR` and `PORT`; never point tests at the real `data/` directory.
15. **Markdown renderer**: always use `renderMarkdown()` from `src/utils/markdown.js`; never render note HTML directly. Raw HTML is escaped; wiki links use a placeholder replaced after `marked` parsing.
16. **Editor modes**: `newNoteContent` is the single canonical string. Serialise before leaving Write; never keep a separate copy per mode. Save normalises/upload `data:image` refs before `POST`/`PUT`.
17. **Wiki links**: `note:<id>` is the stable form; title links can become ambiguous. Parsing is code-aware; do not regex the raw content without `transformOutsideCode`.
18. **Tag filtering**: the UI keeps all active+archived notes in memory and filters tags client-side so link resolution stays complete. The server also supports `tag`/`exactTag` for API/MCP; descendants are included by default.
19. **Whiteboard page rendering is browser-only**: `exportToBlob` needs DOM/fonts. If no browser is open, the API returns the last manifest with `stale`; MCP will need to request a render rather than synthesize one.
20. **Page planner order**: never replace the band/x ordering with a simple sort by y; that breaks left-to-right reading within a row. Keep bound arrows/text/frames in one unit.
21. **MCP auth**: `/mcp` must never be anonymous. Tokens are hashed; token names are actors `mcp:<name>`. Do not log raw tokens. Token-management routes are browser-session only.
22. **MCP whiteboard recall**: render pages in the browser; if no browser is connected, return the stale manifest with a notice. Do not add headless Chromium to the server for this.
23. **HTTPS cert SAN**: the shared mkcert cert is for `192.168.3.222`, not `localhost`; use the IP or issue a cert for your hostname. `COOKIE_SECURE=1` means login cookies only work over HTTPS.
24. **Multiuser migration**: existing installs become `admin` / `Administrator` with the old password. Do not delete `users`/`sessions`; use `npm run auth:reset -- <username>` for recovery and keep at least one active admin.
25. **sqlite-vec / image**: the loadable extension is glibc; keep `node:22-slim` (or rebuild for musl). `openDatabase` must pass `allowExtension: true` before `loadExtension`.
26. **Embedding model partitions**: never store vectors of two models in one table. Use the hashed `emb_<hash>` table key; a changed model name gets a new table, and switching back reuses the old one. Dimensions are fixed per model name.
27. **Embedding key**: only decrypt in the server; never return `api_key_encrypted` or log the key. The admin API returns `hasApiKey`/mask only.
28. **Embedding index freshness**: note head edits/checkpoints and archive/restore must enqueue the note. A failed embedding call must not delete the previous vector rows; index atomically after all vectors succeed.
