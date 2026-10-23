# Local Keep: Relationships, Immutable Threads, Whiteboard Pages, and Embedded MCP

**Status:** Implemented — all five OpenSpec slices; manual browser acceptance pending

**Implementation:** `openspec/changes/add-note-threads-and-revisions`, `add-markdown-editor-modes`, `add-relationships-and-tags`, `add-whiteboard-page-rendering`, `add-embedded-mcp-server`

**Live migration:** 2026-10-21; backup `data/backups/pre-note-threads-2026-10-20T23-51-12-328Z.db`
**Date:** 2026-10-21

**Baseline:** `c1877cc` (89 notes: 86 text, 3 canvas; SQLite DB ≈1.3 MB)

**Audience:** implementer / coding agent

---

## 0. Summary

The wishlist is not one feature; it is a change of model. Today Local Keep is a flat,
mutable note list with a whiteboard attached. The target is a small personal knowledge
system:

- notes have **stable identity** (`notes.id`), **immutable revisions**, and a **thread tree**;
- notes can **reference** each other and be explored as a **graph**;
- **hierarchical tags** provide structure and filtering;
- text is **markdown-first**, with paste sanitisation and edit/Markdown/preview modes;
- a whiteboard can be rendered into **ordered page images** (left-to-right, top-to-bottom);
- an **MCP server is embedded in the app**, so any MCP-capable client can search, read,
  create, edit, inspect threads, and recall whiteboards as multiple images;
- concurrent edits never silently overwrite each other: a stale edit becomes a **branch
  revision** and both sides are preserved.

The plan keeps the existing Vue/Express/SQLite/WebSocket stack and the existing note IDs.
The migration is small (89 notes) and non-destructive.

**Executable OpenSpec slices**

1. `add-note-threads-and-revisions` — implemented (foundation, migration, stable identity,
   immutable revisions, archive, history UI, checkpoints, tests).
2. `add-markdown-editor-modes` — implemented (sanitised renderer, rich-paste normalisation,
   Write/Markdown/Preview, serializer fidelity, markdown image refs, tests).
3. `add-relationships-and-tags` — implemented (wiki links, backlinks, graph, tag
   tree/filtering, migration/backfill, tests).
4. `add-whiteboard-page-rendering` — implemented (planner, ordered manifests, export,
   Pages drawer, staleness, on-demand requests, tests).
5. `add-embedded-mcp-server` — implemented (`/mcp`, tokens, tools/resources, thread search,
   whiteboard images, stdio adapter, tests; see `docs/mcp.md`).

---

## 1. Wishlist → concrete requirements

| # | Wish (paraphrased) | Concrete requirement | Acceptance signal |
|---|---|---|---|
| 1 | A document can reference other documents | Wiki-link syntax `[[Title]]`, `[[Title\|label]]`, `[[note:<id>\|label]]`; links stored in `note_links`; backlinks query | Clicking a rendered link opens the target note; target shows a backlink |
| 2 | References can be opened/viewed directly, "can have a graph" | Internal-link navigation + graph view over resolved links | Graph page shows nodes/edges; clicking a node opens the note |
| 3 | Tag-based structure, tags can be browsed by category | Hierarchical tags (`#area/project/topic`), tag tree with counts, filter by tag including descendants | Sidebar tree filters the gallery; parent tag includes child-tag notes |
| 4 | Strip rich context on paste | `text/html` → markdown via Turndown (no colours/fonts/classes); plain text preserved; images uploaded | Pasting from a web page yields clean markdown, no inline styles |
| 5 | Convert to markdown image references | Canonical text-note image syntax `![alt](/api/images/<hash>.<ext>)`; never persist base64 in text notes | New/edited notes contain only URL refs; old base64 is normalised on save |
| 6 | Markdown-style view toggle | Editor modes: **Write** (current rich contentEditable), **Markdown** (raw source), **Preview** (sanitised render) | Toggle round-trips content without loss; preview renders links/tables/code |
| 7 | Whiteboard renders into multiple images, left→right, top→bottom | Spatial clustering + reading-order packing + PNG page export; ordered manifest stored server-side | Large board produces multiple ordered pages; small board produces one |
| 8 | MCP search returns timestamps | `search_notes` returns `created_at`, `updated_at`, `revision_created_at`, `revision_no`, score, snippet | MCP client sees ISO timestamps for every hit |
| 9 | Thread tree view | Revisions have `parent_revision_id`; `get_thread` returns a tree + head chain | MCP `get_thread` shows a forked tree with timestamps/actors |
| 10 | Every new note can refer to others | `create_note` / `edit_note` accept `related_note_ids`; inline links supported | MCP-created note appears with links/backlinks |
| 11 | Any edit creates a new note, original stays, notify | Every text save creates an immutable revision; UI toast/banner + history drawer; MCP response includes `notice` | Editing keeps revision N; original readable/restorable |
| 12 | A found whiteboard opens as multiple images | `get_whiteboard` returns ordered image content blocks and/or a markdown document with image refs | MCP client receives N images in reading order |
| 13 | MCP server built in; anything that connects can collaborate | Embedded `/mcp` Streamable HTTP endpoint + bearer tokens + shared service layer/events; optional stdio adapter | Two MCP clients + browser can read/write; changes broadcast |

---

## 2. Current implementation audit

### 2.1 Runtime topology

```
Docker "local-keep" (node:22-alpine)
├── node --watch server.js        Express + WS on :5173 (API only in dev)
└── npx vite --host 0.0.0.0      Vite dev server on :5174 (frontend)
        │
        ├── /api/*  ──proxy──▶ :5173
        └── /ws     ──proxy──▶ :5173

Browser ──REST + WS──▶ Vite :5174 ──proxy──▶ Express :5173 ──▶ SQLite + data/images
```

Production (`NODE_ENV=production`) serves `dist/` from :5173.

### 2.2 Data model (current)

`server.js` creates these tables:

- `notes(id TEXT PK, title, content, type DEFAULT 'text', canvasData, thumbnail, createdAt, updatedAt)`
- `notes_fts(note_id, title, content, canvas_text)` — FTS5, porter/unicode61
- `image_refs(image_hash, note_id)` — which images are referenced by which notes
- `password`, `sessions`

Important properties:

- `notes` is **mutable state**; `PUT /api/notes/:id` overwrites `title`, `content`,
  `canvasData`, `thumbnail`, `updatedAt` in place. There is no history.
- `notes.id` is the only stable identity. It is generated as
  `Date.now() + '-' + random` and used by the UI, WebSocket, and image refs.
- `canvas_text` exists only in `notes_fts`, never in `notes` (a known crash gotcha).
- `image_refs` is rebuilt by `syncImageRefs()` from head content/canvas only.
- Existing content is markdown-ish (headings, fenced code, lists, images); `#` and `[[`
  occur mostly inside code blocks, so naive tag/link parsing would create noise.

### 2.3 Text notes (current)

`src/App.vue`:

- The editor is a `contenteditable` div (`imageEditor`) with a custom serializer
  (`serializeEditorToMarkdown`) that understands `IMG`, `B`, `I`, `A`, `DIV`, `BR`.
- Images are inserted as `![alt](url)` markdown and rendered as `<img data-md="...">`.
  Width is a non-standard extension: `![alt](url){width=N}`.
- Paste is only intercepted for image clipboard items (`onEditorPaste`). Rich HTML
  paste falls through to the browser default, so colours/fonts/office markup leak in.
- Gallery rendering (`renderContent`) escapes HTML then applies a few regexes for
  images, checkboxes, bold, italic, links. It is not a complete markdown renderer.
- There are no tags, backlinks, note links, history, or markdown source/preview modes.
- Notes open in a modal; the gallery is the only navigation surface.

### 2.4 Whiteboard (current)

`src/components/WhiteboardEditor.vue`:

- Excalidraw 0.18 is mounted manually with React `createRoot` inside Vue.
- `exportToBlob` generates a **single** thumbnail (`maxWidthOrHeight: 400`) on each
  debounced delta flush.
- `getCurrentScene()` exposes elements + files for save-as flows.
- Collaboration (`src/collab/collabManager.js`): 500 ms debounce, element diff,
  server-assigned `_collab_ts`, LWW merge, custom undo/redo.
- `server.js` keeps per-note in-memory `elements`/`files` and persists to
  `notes.canvasData` after 500 ms. `persistNoteState()` also updates FTS and broadcasts
  the full note list.
- There is no notion of whiteboard pages, tiles, or reading order.

### 2.5 Auth and realtime (current)

- `src/server/sessionStore.js`: opaque session IDs, HMAC-signed HttpOnly cookie
  (~30 days), persisted in `sessions`; REST accepts cookie or `X-Auth-Token`; WS
  accepts `?token=<sessionId>`.
- `server.js` WS: `join`/`leave`/`delta` for whiteboards; broadcasts `notes` (bulk)
  and `note-deleted`. Deltas for unknown notes get `note-gone`.
- Completed but unarchived OpenSpec changes: `deletion-presence-mask-and-save-as`,
  `implicit-title-from-content`, `persist-auth-cookie`, `fix-whiteboard-pasted-images`,
  `relocate-text-note-image-button`. Their code is implemented; verify/archive before
  the refactor so the new change starts from a clean spec baseline.

### 2.6 Consequences for this plan

1. **Keep `notes.id` stable forever.** Links, revisions, tags, and MCP IDs all hang off
   it. Do not make the head ID change on every edit.
2. **Split `server.js` before adding MCP.** MCP and REST must share one service layer;
   otherwise the MCP server reimplements note logic and drifts.
3. **Do not replace contentEditable in one step.** Wrap it in a markdown-aware editor
   with explicit modes; keep the existing image/resize behaviour.
4. **Whiteboard page rendering must run in the browser.** `exportToBlob` needs DOM and
   loaded Excalidraw fonts. Server-side headless rendering is a non-goal for v1.
5. **Migration is cheap.** 89 notes / ~500 KB canvas data. A transactional backfill with
   a pre-migration backup is sufficient.

### 2.7 Touchpoint map

| Area | Current file(s) / function(s) | Planned change |
|---|---|---|
| DB + migrations | `server.js` schema block, ad-hoc `ALTER TABLE` loops | `src/server/db.js` + versioned `migrations/`; add columns/tables; WAL/backup |
| Notes REST | `server.js` `GET/POST/PUT/DELETE /api/notes` | service layer; revisions; archive; new note shape |
| Search | `server.js` `GET /api/search`, `notes_fts` | object results, snippets/timestamps, tag/type/date filters |
| Images | `server.js` `storeImageFromDataURL`, `mergeFiles`, `syncImageRefs`, cleanup | move to `images.js`; revision refs; tile refs; text image normalisation |
| Whiteboard persist | `server.js` `noteStates`, `applyDelta`, `persistNoteState` | `whiteboards.js`; checkpoints; render manifests; stale detection |
| WS | `server.js` `wss.on('connection')` | `realtime/ws.js`; checkpoint/render events; note lifecycle broadcasts |
| Text editor | `src/App.vue` `markdownToHTML`, `serializeEditorToMarkdown`, `onEditorPaste`, `renderContent` | `MarkdownEditor.vue`; modes; Turndown paste; shared renderer |
| Gallery/list | `src/App.vue` template + `sortedNotes` | `NoteCard.vue` / `NotesView.vue`; tags, revisions, link counts |
| Whiteboard UI | `src/components/WhiteboardEditor.vue` `generateThumbnail`, `getCurrentScene` | page planner, export/upload, pages drawer, checkpoint |
| Collab | `src/collab/collabManager.js` | unchanged LWW; add checkpoint-on-leave signal; no revision logic |
| Display title | `src/utils/notes.js` | move to `src/shared/notesText.js`; server + client use it |
| Vite proxy | `vite.config.js` | add `/mcp` proxy to :5173 |
| Config | `package.json`, `docker-compose.yml` | MCP deps, test scripts, env vars (no new ports) |
| Docs | `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/` | new schema, MCP guide, relationships/tags/pages docs |

---

## 3. Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | `notes.id` is the **stable note identity** (also the "thread id"). Revisions have their own immutable IDs. | Existing links/WS/UI already use `notes.id`; changing it would break everything. |
| D2 | `notes` remains the **head** (materialised latest state). `note_revisions` stores immutable snapshots. | Minimal migration and fast list/search; history is additive. |
| D3 | A text **save** creates a revision. A whiteboard **checkpoint** creates a revision (leave, manual, or ≥5 min of dirty state), not every 500 ms delta. | Per-stroke canvas revisions would be unusable and enormous. Checkpoints are the meaningful "edit" boundary for a canvas. |
| D4 | Deletion is **archive by default** (`archived_at`), history retained. Purge is explicit. | "The original is still there" must survive deletion too. |
| D5 | Content is **markdown canonical**. The rich editor is a view over markdown, not a separate format. | Needed for paste sanitisation, preview, MCP, and portable export. |
| D6 | Link syntax: `[[Title]]`, `[[Title\|label]]`, `[[note:<id>\|label]]`. Tag syntax: `#tag`, `#area/project/topic`. | Readable, familiar, and explicit IDs are available when titles are ambiguous. |
| D7 | MCP is **embedded Streamable HTTP** at `/mcp`, authenticated with bearer tokens; optional stdio adapter uses the REST facade. | Works for remote/desktop MCP clients and keeps the browser/WS path. |
| D8 | Stale edits **branch**, never overwrite: `base_revision_id` mismatch creates a sibling revision and notifies. | Preserves both sides of concurrent edits; matches the thread-tree requirement. |
| D9 | Out of scope: CRDT text collaboration, server-side headless whiteboard rendering, automatic 3-way merge, multi-user accounts/permissions. | Keeps the first delivery shippable. |
| D10 | **Document identity is session-stable**: the editor's `noteId` never changes while the document is open. Revisions are version identities, not document identities. Autosave, if added, writes a draft; only explicit save/close commits a revision. | Prevents note-identity churn during editing; links, tabs, and WS sessions stay valid. |

No separate graph database. `note_links` is an adjacency table; graph queries are BFS in
the service layer (or a recursive CTE for small depths). At personal-note scale this is
faster and simpler than adding Neo4j/Redis, and it keeps SQLite as the single source of
truth. If the dataset ever exceeds ~100k edges, add a materialised adjacency cache.

---

## 4. Target architecture

```
                    ┌──────────────────────────────┐
Browser (Vue) ──────│ REST /api/*   +   WS /ws     │
                    │                              │
MCP client ────────▶│ POST /mcp (Streamable HTTP)  │──── Express app
                    │                              │
stdio adapter ─────▶│ REST facade (bearer token)   │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │        service layer         │
                    │ notes / revisions / tags /   │
                    │ links / search / images /    │
                    │ whiteboards / tokens         │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        SQLite (WAL)         data/images          event bus
        notes/revisions      content-addressed    ├─ WS broadcast
        tags/links/renders   PNG/JPEG/SVG         ├─ MCP notifications
        tokens/events                             └─ render requests
```

Module layout:

```
server.js                       composition root: db, migrations, services, app, ws, mcp
src/server/
  db.js                         open DB, PRAGMAs, backup, migrations runner
  migrations/001_threads.js     schema + backfill
  events.js                     EventEmitter bus (note.revised, render.updated, ...)
  services/
    notes.js                    head CRUD, list, archive/restore
    revisions.js                revision creation, branch, tree, restore/promote
    tags.js                     parse/normalise/sync/tree
    links.js                    parse/resolve/backlinks/graph
    search.js                   FTS query, filters, snippets
    images.js                   content-addressed store, normalise text images, GC
    whiteboards.js              state, persist, checkpoints, render manifests
    tokens.js                   MCP token issue/verify/revoke
  http/
    notesRoutes.js
    tagRoutes.js
    graphRoutes.js
    imageRoutes.js
    whiteboardRoutes.js
    mcpTokenRoutes.js
    mcpRoutes.js                /mcp mount + auth
  realtime/
    ws.js                       join/leave/delta/checkpoint/render-complete
    broadcast.js                notes, note-created/revised/archived, render events
  mcp/
    createServer.js             McpServer factory (tools/resources)
    tools/*.js
    resources.js
    facade.js                   DirectFacade (services) / HttpFacade (REST)
  auth.js                       cookie/header/bearer verification, actor resolution
src/shared/
  notesText.js                  cleanContent, displayTitle, markdownToText (client+server)
  markdown.js                   renderMarkdown, sanitize, htmlToMarkdown, wiki links
  tags.js                       tag tokenizer/normaliser/tree helpers
  links.js                      wiki-link tokenizer/resolver helpers
src/utils/
  whiteboardTiles.js            pure page planner (bbox clustering/order/packing)
  notes.js                      re-export from src/shared/notesText.js (compatibility)
mcp-stdio.js                    optional stdio entry using the REST facade
```

`server.js` becomes a composition root of roughly 100–150 lines. Every business rule lives
in `src/server/services/*` and is callable from REST, WS, MCP, and tests.

**New dependencies** (versions to be pinned at implementation time):

- Runtime: `marked`, `dompurify`, `turndown`, `turndown-plugin-gfm`, `d3-force`,
  `vue-router`, `@modelcontextprotocol/server`, `@modelcontextprotocol/express`,
  `@modelcontextprotocol/node`, `zod`.
- Dev/test (optional but recommended): `vitest` + `happy-dom` for renderer/component
  tests; `node:test` remains for server/pure tests.

Do not add a headless browser dependency; whiteboard page export stays in the browser.

---

## 5. Data model

### 5.1 Invariants

1. `notes.id` is stable forever and is the public note/thread identity.
2. `notes` is the **head**; `note_revisions` is append-only.
3. `notes.head_revision_id` points to a revision; `notes.revision_no` is the head number.
4. A revision's `parent_revision_id` forms the thread tree. The "head chain" is the path
   from the head revision back to the root.
5. A stale edit creates a revision whose parent is the **base** revision and does **not**
   move the head; it is a branch.
6. Tags and links in `note_tags` / `note_links` describe the current head. Historical
   revision content can be parsed on demand.
7. Archived notes (`archived_at IS NOT NULL`) are hidden from lists/search by default but
   retain all revisions and image references.
8. Text content is markdown. `canvasData` is Excalidraw JSON. Text-note images use
   `/api/images/<hash>.<ext>` references, not base64.
9. Every mutation appends a `note_events` row for MCP `list_changes` and audit.

### 5.2 Schema changes

Add columns to `notes` (all nullable / defaulted; existing rows keep working):

```sql
ALTER TABLE notes ADD COLUMN head_revision_id TEXT;
ALTER TABLE notes ADD COLUMN revision_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN display_title TEXT;
ALTER TABLE notes ADD COLUMN content_hash TEXT;      -- head snapshot hash
ALTER TABLE notes ADD COLUMN canvas_hash TEXT;       -- canonical scene hash (canvas only)
ALTER TABLE notes ADD COLUMN archived_at TEXT;
ALTER TABLE notes ADD COLUMN last_checkpoint_at TEXT;
CREATE INDEX idx_notes_updated ON notes(updatedAt);
CREATE INDEX idx_notes_archived ON notes(archived_at);
CREATE INDEX idx_notes_display_title ON notes(display_title);
```

New tables:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  parent_revision_id TEXT,
  revision_no INTEGER NOT NULL,
  title TEXT,
  content TEXT,
  display_title TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  canvas_data TEXT,             -- lean: Excalidraw files keep hash refs, not dataURL
  thumbnail TEXT,               -- optional; head keeps the data URL
  snapshot_hash TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'ui',       -- ui | mcp:<token name> | system
  source TEXT NOT NULL DEFAULT 'ui',      -- ui | mcp | import | restore | checkpoint
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_revision_id) REFERENCES note_revisions(id) ON DELETE SET NULL
);
CREATE INDEX idx_revisions_note ON note_revisions(note_id, revision_no);
CREATE INDEX idx_revisions_parent ON note_revisions(parent_revision_id);
CREATE INDEX idx_revisions_created ON note_revisions(created_at);

-- Optional autosave/draft layer. Drafts never change note identity and never appear
-- in history until committed. The current text editor saves explicitly, so this table
-- is only used when autosave is enabled.
CREATE TABLE IF NOT EXISTS note_drafts (
  note_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  base_revision_id TEXT,
  title TEXT,
  content TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (note_id, session_id),
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL,
  tag TEXT NOT NULL,                          -- normalised, no leading '#'
  source TEXT NOT NULL DEFAULT 'inline',      -- inline | explicit
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, tag),
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX idx_note_tags_tag ON note_tags(tag);

CREATE TABLE IF NOT EXISTS note_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_note_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  target_note_id TEXT,                        -- NULL when unresolved/ambiguous
  target_label TEXT NOT NULL,
  target_kind TEXT NOT NULL DEFAULT 'title',  -- title | id | related
  raw TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',          -- ok | unresolved | ambiguous | archived
  source TEXT NOT NULL DEFAULT 'inline',      -- inline | explicit
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX idx_links_source ON note_links(source_note_id);
CREATE INDEX idx_links_target ON note_links(target_note_id);

CREATE TABLE IF NOT EXISTS note_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  revision_id TEXT,
  type TEXT NOT NULL,                         -- created|revised|archived|restored|promoted|rendered|imported
  actor TEXT NOT NULL,
  payload TEXT,                               -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_created ON note_events(created_at);
CREATE INDEX idx_events_note ON note_events(note_id, created_at);

CREATE TABLE IF NOT EXISTS revision_image_refs (
  image_hash TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  PRIMARY KEY (image_hash, revision_id),
  FOREIGN KEY(revision_id) REFERENCES note_revisions(id) ON DELETE CASCADE
);
CREATE INDEX idx_revision_image_refs_hash ON revision_image_refs(image_hash);

CREATE TABLE IF NOT EXISTS whiteboard_renders (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  revision_id TEXT,
  scene_hash TEXT NOT NULL,
  renderer_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'complete',    -- pending | complete | failed | empty
  source TEXT NOT NULL DEFAULT 'client',      -- client | legacy-thumbnail | mcp-request
  tile_count INTEGER NOT NULL DEFAULT 0,
  is_current INTEGER NOT NULL DEFAULT 1,
  rendered_at TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX idx_renders_note ON whiteboard_renders(note_id, rendered_at DESC);

CREATE TABLE IF NOT EXISTS whiteboard_tiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  render_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  image_hash TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT 'png',
  width INTEGER,
  height INTEGER,
  bbox_json TEXT,                             -- [minX, minY, maxX, maxY]
  element_ids_json TEXT,                      -- IDs included in this page
  clipped INTEGER NOT NULL DEFAULT 0,
  UNIQUE(render_id, page_index),
  FOREIGN KEY(render_id) REFERENCES whiteboard_renders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 of the bearer token
  scopes TEXT NOT NULL DEFAULT 'read,write',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
```

Changes to existing tables / behaviour:

- `notes_fts` keeps its four columns. `content` is indexed as **plain text**
  (`markdownToText(content)`) so snippets are readable and code/tag syntax does not
  pollute search. Rebuild on migration.
- `image_refs` remains for head references. `revision_image_refs` protects images used
  only by old revisions. Image cleanup considers the union of both plus tile hashes.
- Foreign keys are enabled (`PRAGMA foreign_keys = ON`); WAL and `busy_timeout` are set.

### 5.3 Migration plan (existing 89 notes)

Preconditions: stop the app or accept `node --watch` restart; take a consistent backup.

1. **Backup**: `VACUUM INTO 'data/backups/pre-revisions-<timestamp>.db'` (or
   `fs.copyFileSync` after a checkpoint). Log the path. Never delete the backup
   automatically.
2. **Baseline**: create `schema_migrations` and record version 0 if the DB already has
   `notes`. On a fresh DB, create the final schema and record version 1 directly.
3. **Transaction** (`BEGIN IMMEDIATE` … `COMMIT`):
   - Add `notes` columns if missing (idempotent via `PRAGMA table_info(notes)`).
   - Create new tables and indexes.
   - For each note without `head_revision_id`:
     - Compute `display_title` with shared `getDisplayTitle`.
     - Compute `snapshot_hash = sha256(title + "\0" + content + "\0" + canvasHash)`.
     - For canvas notes, parse `canvasData`, extract any `files[*].dataURL` to
       `data/images`, replace with `{hash, ext, mimeType, id, created}` in the **lean
       revision** copy; leave the head `canvasData` unchanged.
     - Insert revision #1 (`source='import'`, `actor='system'`, parent NULL).
     - Set `head_revision_id`, `revision_no=1`, `content_hash`, `canvas_hash`,
       `display_title`.
     - Parse inline tags/links from text and canvas text; insert `note_tags` /
       `note_links` with `source='inline'`.
     - Record image refs for the revision.
     - For canvas notes with a thumbnail data URL: store it as a content-addressed image,
       insert a `whiteboard_renders` row (`source='legacy-thumbnail'`, `status='complete'`,
       `is_current=1`) and one tile with `page_index=0`, `bbox_json=NULL`, `clipped=0`.
       Add the tile hash to `image_refs`.
   - Rebuild `notes_fts` with `markdownToText(content)` and canvas text.
   - Insert `note_events(type='imported')` for each note (optional; useful for audit).
   - Write `schema_migrations(version=1)`.
4. **Verify** before commit (or immediately after):
   - `COUNT(notes)` unchanged.
   - Every note has a non-null `head_revision_id`.
   - `COUNT(note_revisions) >= COUNT(notes)`.
   - Content hashes of head vs latest revision match.
   - No note has a null `display_title` when content is non-empty.
   - FTS count equals notes count; spot-check search.
5. **Failure**: the transaction rolls back; startup fails with the backup path and
   instructions. Do not auto-restore over the live DB.
6. **Test on a copy** of `data/local-keep.db` first, then run twice to prove idempotence.

### 5.4 Revision write path (text notes)

```
saveTextRevision({ noteId, title, content, baseRevisionId, actor, source, mode, message }):
  BEGIN IMMEDIATE
  head = notes[noteId] (reject if missing/archived unless restoring)
  prev = revision[head.head_revision_id]
  base = baseRevisionId ? revision[baseRevisionId] : prev
  stale = base.id !== prev.id

  if (stale && (mode === 'branch' || mode === 'append')):   # append is default
      rev = insertRevision(parent=base.id, snapshot=current input, source, actor)
      event('revised', { branch: true })
      COMMIT
      return { note: head, revision: rev, conflict: true,
               notice: "Note changed elsewhere; your edit was kept as a branch." }

  if (stale && mode === 'take_head'):
      // explicit override: move the head to the new content
      rev = insertRevision(parent=prev.id, ...)
      updateHead(rev)
      notify + commit

  if snapshotHash == head.content_hash:
      COMMIT
      return { note: head, revision: prev, unchanged: true,
               notice: "No changes to save." }

  rev = insertRevision(parent=prev.id, revisionNo=prev.revision_no+1, ...)
  updateHead(rev: title/content/display_title/head_revision_id/revision_no/content_hash)
  syncTags(noteId, rev)
  syncLinks(noteId, rev)
  syncImageRefsForRevision(rev)
  event('revised')
  COMMIT
  emit('note.revised', { noteId, revisionId, revisionNo, actor, source, conflict:false })
```

`mode` values exposed by REST/MCP:

- `append` (default): normal edit; stale base → branch.
- `branch`: always create a side revision, never move the head.
- `take_head`: explicit "use my content as the new head".

Restore and promote are implemented as normal revisions, not history rewrites:

- **Restore revision R**: create a new revision whose content is copied from R, parent =
  current head, `source='restore'`; head moves. History is untouched.
- **Promote branch B**: create a new revision whose content is copied from B, parent =
  current head, `source='promote'`; head moves. B remains in the tree.

### 5.5 Whiteboard checkpoint path

```
persistNoteState(noteId):
  head.canvasData = serialise(elements, files)          # every 500ms debounce
  update FTS canvas_text, notes.updatedAt
  if forceCheckpoint or now - last_checkpoint_at >= CHECKPOINT_MS (default 5 min):
      sceneHash = sha256(canonical(elements) + file hashes)
      if sceneHash != head.canvas_hash:
          lean = strip dataURLs from files (keep hash/ext/mime/id/created)
          rev = insertRevision(type='canvas', canvas_data=lean,
                               snapshot_hash=sceneHash, source='checkpoint',
                               parent=head.head_revision_id)
          updateHead(head_revision_id=rev.id, revision_no+1, canvas_hash=sceneHash,
                     last_checkpoint_at=now)
          event('revised')
          emit('note.revised', { actor:'ui', source:'checkpoint' })
```

`checkpoint` is forced on `goBack`, on explicit "Checkpoint", and when the last session
leaves a note. Whiteboard revisions store lean scenes, so history does not duplicate
base64 image data.

### 5.6 Archive vs purge

- `DELETE /api/notes/:id` sets `archived_at`, removes the note from FTS results by join,
  clears in-memory collab state, and broadcasts `note-deleted` (existing clients keep
  working). Revisions, tags, links, image refs, and renders remain.
- `GET /api/notes?includeArchived=1` returns archived heads with `archivedAt`.
- `POST /api/notes/:id/restore` clears `archived_at`.
- `DELETE /api/notes/:id?purge=1` (explicit, second confirmation) hard-deletes the note;
  FKs cascade revisions/tiles; image refs are removed; image GC may then delete orphans.
- MCP exposes `archive_note`, `restore_note`, and (optional) `purge_note` with a
  destructive annotation.

---

## 6. Feature design

### 6.1 Relationships (wiki links, backlinks, graph)

**Syntax**

```
[[Another note]]                       resolve by title/display title
[[Another note|shown text]]            label override
[[note:1785652483902-7avcmlwy0|text]]  stable explicit ID
```

Accepted for compatibility in imported content: `[text](note:<id>)`.

**Parsing**

- Replace fenced code blocks and inline code with spaces (preserve indices) before
  scanning. This is essential: the existing corpus contains `#`/`[[` inside code.
- Regex: `/\[\[([^\]\n]+)\]\]/g`; split the inner value on the first `|`.
- `target_kind='id'` when it starts with `note:`; otherwise `title`.
- Ignore links longer than 200 chars; cap 200 links per note.

**Resolution**

- Explicit ID: verify the note exists and is not purged; `status='ok'` or `'archived'`.
- Title: compare case-insensitively against head `title` and `display_title` (NFKC,
  trimmed, collapsed whitespace). Exactly one match → `ok`; zero → `unresolved`;
  multiple → `ambiguous`.
- On create/edit/restore/title change, rebuild links for the source note, then
  re-resolve unresolved links globally (cheap for a personal DB; optimise with an index
  if needed).
- Store one row per occurrence (raw), so backlinks can show context.

**Backlinks**

Query `note_links` where `target_note_id = ? AND status IN ('ok','archived')`, join the
source head for title/tags/updatedAt. For each row, extract ±80 chars around `raw` from
the source content at read time for a context snippet.

**Graph**

`GET /api/graph` returns nodes (heads) and edges (resolved links). Optional `note_id` +
`depth` returns a BFS neighbourhood (both outgoing and incoming). Optional `tag` filters
nodes. Unresolved links can be included as synthetic nodes when
`include_unresolved=1`.

UI: `GraphCanvas.vue` renders an SVG with a seeded `d3-force` layout (add `d3-force`).
Nodes are coloured by type, sized by degree; click opens the note; drag pins; zoom/pan;
toggle tag nodes/edge labels. Cap at 1000 nodes; above that, show a neighbourhood warning.

### 6.2 Tags (hierarchical structure)

**Syntax**

```
#tag
#area/project/topic
```

Rules:

- `#` must not be immediately preceded by an ASCII word character (`[A-Za-z0-9_/]`);
  start-of-line, whitespace, punctuation, and CJK characters are fine (so `这是#项目`
  works, but `foo#bar`, URLs, and `https://x#frag` do not).
- Tag body: Unicode letters/numbers, `_`, `-`, `/`; must start with a letter; max 64
  chars; must contain a non-hex character if it looks like a CSS colour
  (`/^[0-9a-f]{3,8}$/i` is rejected).
- Ignore fenced and inline code.
- Normalise with NFKC + lowercase; collapse duplicate `/`; trim leading/trailing `/`.
- Max 100 tags per note.

**Storage and tree**

`note_tags(note_id, tag, source)` stores the full path. A tag tree is built by splitting
on `/`; each node has `direct_count` and `subtree_count`. Filtering by `#project`
includes descendants by default (`exact=1` for exact only).

**UI**

- `TagSidebar.vue`: collapsible tree with counts, "All notes", "Untagged", "Archived".
  Selecting a tag filters the gallery and shows a removable breadcrumb.
- Tag chips on cards and in the note detail; click filters.
- Search box understands `tag:foo` and `#foo`; combines with full-text query.
- Optional `TagsView` shows sections per top-level tag (the "classification" view).
- Tag editing: inline tags are edited in markdown; explicit tags (from MCP/API) can be
  added/removed in the detail panel. Inline tags are re-parsed on save; explicit rows are
  preserved.

### 6.3 Markdown-first editor and paste sanitisation

**Canonical form**: markdown in `notes.content`. Existing content is already markdown-ish;
no storage rewrite is needed.

**Renderer** (`src/shared/markdown.js`):

- `marked` (v18+) with GFM (tables, task lists, strikethrough), `breaks: true` to match
  current newline behaviour. Create a local `new Marked(...)` instance rather than
  mutating the global instance; heading IDs are not needed (and DOMPurify can strip
  `id`). Do not use the removed `headerIds`/`mangle`/`sanitize` options.
- `DOMPurify` sanitisation with a strict allow-list; forbid `style`, `script`, `iframe`,
  event handlers; allow `img`, `a`, headings, lists, code, tables, blockquote.
- Custom handling:
  - `[[...]]` → `<a class="note-link" data-note-id="...">label</a>` (or a
    `.note-link--broken` span).
  - `![alt](url){width=N}` → `<img width="N">` (preprocess or custom renderer).
  - `data:image/*` allowed for legacy rendering, but normalised on save.
- `markdownToText(md)` lives in `src/shared/notesText.js` (server-safe, no DOM); it
  strips fences/emphasis/link syntax/images to alt text and is used for FTS, display
  titles, and excerpts.
- `htmlToMarkdown(html)` lives in the client renderer module: Turndown + GFM plugin;
  remove `script/style/meta/link/iframe`, heading style ATX, fenced code, `-` bullets,
  inline links; normalise blank lines.

**Editor modes** (`MarkdownEditor.vue` wrapping the existing editor):

| Mode | Behaviour |
|---|---|
| **Write** | Existing contentEditable + toolbar + image resize; canonical markdown is serialized on input/blur. |
| **Markdown** | Raw `<textarea>` with monospace, no spellcheck, tab inserts two spaces; images remain markdown refs. |
| **Preview** | Sanitised rendered HTML, read-only; internal links clickable; images visible. |

Switching modes:

- Write → Markdown/Preview: `newNoteContent = serializeEditorToMarkdown()`.
- Markdown → Write: `renderEditorContent()` from markdown.
- Any → Preview: `renderMarkdown(newNoteContent)`.
- Add a segmented control in the editor toolbar + `Ctrl/Cmd+Shift+M` toggle. Update the
  shortcuts card.

**Paste pipeline** (`paste` handler):

1. If clipboard has image files: upload each, insert markdown image at the cursor
   (existing behaviour, preserved in all modes).
2. Else if `text/html` exists: `htmlToMarkdown(html)`.
   - Extract `data:image/*` `<img>` sources, upload them, replace with `/api/images/...`.
   - Keep `http(s)` image URLs as-is.
   - In Write mode, insert `markdownToHTML(md)` nodes; in Markdown mode, insert raw md.
3. Else insert `text/plain` verbatim (normalised line endings).
4. Global paste outside the editor: use `text/plain` if available, else Turndown the HTML;
   create a new note with the cleaned markdown.

**Image normalisation on save**:

- Scan content for `![...](data:image/...)`; upload each, replace with
  `![...](/api/images/<hash>.<ext>)`.
- This guarantees text notes contain only markdown image references and keeps the image
  GC meaningful.
- Whiteboard `canvasData.files` keeps Excalidraw's `dataURL` for rendering, plus
  `hash/ext` for disk dedup (existing behaviour).

**Gallery**:

- Replace `renderContent` with `renderMarkdown`; line-clamp the card body.
- Render tags chips, link count, revision badge (`r3`), type badge.
- Internal link clicks use `@click.stop` so the card does not open the editor.

### 6.4 Immutable threads, notices, conflicts

**What the user sees**

- Saving a text note creates revision N. A toast appears:
  `Saved revision 3 — revision 2 kept. [View history]`.
- The note detail shows `Revision 3` and a history button.
- The history drawer shows a tree: head chain marked, branches on the side, each with
  timestamp, actor (`you`, `mcp:claude`), and source (`ui`, `checkpoint`, `restore`).
- Clicking an old revision opens a read-only preview; actions are **Restore this
  version** (creates a new head revision) and **Promote branch**.
- If a save is stale: banner `This note changed since you opened it. Your edit was kept
  as a branch. [View tree] [Use mine as head]`. No data is lost.
- If an MCP client edits a note currently open in the browser: WS `note-revised` triggers
  a toast `Updated by mcp:claude — revision 4`; the editor buffer is not clobbered. The
  next save becomes a branch unless the user reloads.

**Editing session contract (identity stability)**

- A document is identified by `note.id` for its entire life. `revision_id` is a *version*
  identifier, never the document identifier.
- Opening the editor creates an in-memory session:
  `{ noteId, baseRevisionId, openedAt, dirty }`. The session's `noteId` is never replaced.
  The editor URL, card selection, WebSocket note id, and MCP `note_id` all stay stable.
- Saving commits a new revision but **does not change** `noteId`; the UI may display
  `v3`, but it remains the same document. `editingId` must not be reassigned to
  `revisionId`.
- If autosave is added later, it writes a `note_drafts(note_id, session_id, title,
  content, updated_at)` row, not a revision and not the head. Only an explicit
  Save/Save & Close commits a revision. This prevents revision spam and identity churn.
- Closing without saving discards the draft; the head and history are unchanged.
- A crash-recovery flow may offer to restore a draft on next open; it still targets the
  same `noteId`.
- Whiteboards follow the same rule: the whiteboard's `noteId` is stable; checkpoints
  create revisions under it.

**Thread tree data**

`GET /api/notes/:id/history` returns flat revisions plus a tree:

```json
{
  "noteId": "...",
  "headRevisionId": "r4",
  "revisions": [
    {"id":"r1","parentId":null,"revisionNo":1,"createdAt":"...","actor":"ui","source":"import","onHeadChain":true},
    {"id":"r2","parentId":"r1","revisionNo":2,"createdAt":"...","actor":"ui","source":"ui","onHeadChain":true},
    {"id":"r3","parentId":"r1","revisionNo":3,"createdAt":"...","actor":"mcp:claude","source":"mcp","onHeadChain":false},
    {"id":"r4","parentId":"r2","revisionNo":4,"createdAt":"...","actor":"ui","source":"ui","onHeadChain":true}
  ],
  "tree": {"id":"r1","children":[{"id":"r2","children":[{"id":"r4"}]},{"id":"r3"}]}
}
```

`onHeadChain` is computed by walking `parent_revision_id` from the head; it is not stored.

### 6.5 Whiteboard page rendering (multi-image, reading order)

**Why client-side**

`exportToBlob` needs DOM, canvas, and loaded Excalidraw fonts. The browser already has the
scene and files. The server stores the resulting PNGs and manifest. If no browser is open,
MCP returns the last render with `stale: true` (or a legacy thumbnail tile).

**Page planner** (`src/utils/whiteboardTiles.js`, pure, unit-tested):

Input: non-deleted elements, files, options.

1. **Atomic units**: groups and frames become one unit; bound text stays with its
   container; arrows bound at both ends union their endpoint units.
2. **Spatial clusters**: union-find over expanded bounding boxes (`gap = 48` scene units
   by default; configurable). Expand each bbox by `gap/2`; intersect → union. Use a
   spatial grid/sweep to avoid O(n²) on large boards.
3. **Reading order**:
   - Sort clusters by top (`minY`).
   - Group into bands: a cluster joins the current band if
     `cluster.minY <= band.maxY + rowTolerance` (default `0.5 × median cluster height`,
     clamped to 24–80). Otherwise start a new band.
   - Within each band, sort by left (`minX`).
4. **Pack pages**: greedy left-to-right, top-to-bottom. Default max page
   `1600 × 1600` scene units (configurable). Add clusters to the current page while the
   union bbox fits; otherwise start a new page. A single cluster larger than a page is
   exported alone (scaled down by `maxWidthOrHeight`) or, if it is extreme, split by a
   grid fallback and flagged `clipped: true`.
5. **Output**: ordered `pages[]`:
   ```js
   { pageIndex, bbox:[minX,minY,maxX,maxY], elementIds:[...], clusters:[...], clipped:false }
   ```
   No element is cut when gap-based clustering succeeds; `clipped` is explicit otherwise.

Pseudocode is in Appendix B.

**Export**

In `WhiteboardEditor.vue`:

```js
const elements = api.getSceneElementsIncludingDeleted().filter(el => !el.isDeleted)
const files = api.getFiles()
const pages = planPages(elements, { gap: 48, maxPageW: 1600, maxPageH: 1600 })
for (const page of pages) {
  const blob = await exportToBlob({
    elements: page.elementIds.map(id => elementById.get(id)),
    appState: { exportBackground: true, viewBackgroundColor: appState.viewBackgroundColor || '#ffffff' },
    files,
    mimeType: 'image/png',
    maxWidthOrHeight: 2000,
    exportPadding: 24
  })
  // upload blob to /api/images, get { hash, url }
}
// POST /api/notes/:id/renders with sceneHash + ordered tiles + requestId
```

Use the same `sceneHash` as the server's canonical canvas hash (elements sorted by id,
`_collab_ts` stripped, file hashes included). Sequential exports avoid memory spikes.
Show `Rendering page 2/5…`; cancel if the scene hash changes.

**Triggers**

- Manual **Render pages** button in the whiteboard header.
- On `goBack` (leaving the whiteboard) if the scene changed since the last render.
- Optional idle auto-render (default off; configurable, e.g. 30 s after last change).
- MCP on-demand `render-request` when a client is connected to the note.

**Storage**

- Upload PNGs through the existing `/api/images` endpoint (content-addressed).
- `POST /api/notes/:id/renders` inserts a `whiteboard_renders` row and ordered
  `whiteboard_tiles`, marks older renders `is_current=0`, adds image refs, emits
  `render.updated` and a WS `render-updated`.
- `GET /api/notes/:id/renders/latest` returns:
  ```json
  {
    "renderId": "...", "sceneHash": "...", "renderedAt": "...",
    "stale": false, "tileCount": 3,
    "tiles": [
      {"pageIndex":0,"url":"/api/images/ab12.png","width":1600,"height":900,"bbox":[...]},
      ...
    ]
  }
  ```
- `stale` is computed by comparing `render.scene_hash` to `notes.canvas_hash`.
- Keep render history (useful for revision views); prune old renders only by explicit
  policy (default keep 10 per note).

**UI**

- Header **Pages** button opens a drawer with ordered thumbnails, page numbers,
  `renderedAt`, stale badge, **Render now**, **Copy markdown**, **Download all**.
- Card shows the first tile or existing thumbnail, plus a `3 pages` badge.
- "Copy markdown" produces:
  ```markdown
  ![Whiteboard page 1](/api/images/ab12.png)
  ![Whiteboard page 2](/api/images/cd34.png)
  ```

### 6.6 Embedded MCP server

**Packages (MCP SDK v2, current 2026 spec)**

```json
{
  "@modelcontextprotocol/server": "^2.3.1",
  "@modelcontextprotocol/express": "^2.0.2",
  "@modelcontextprotocol/node": "^2.1.1",
  "zod": "^4"
}
```

Use `createMcpHandler`, `toNodeHandler`, and the high-level `McpServer.registerTool`.
The factory runs once per HTTP request and creates a fresh server instance bound to the
caller's `authInfo` (token name/scopes). Services and the DB live at module scope.

**Mounting**

```js
const handler = createMcpHandler(({ authInfo }) =>
  createMcpServer({ services, actor: authInfo?.clientId || 'mcp:anonymous' })
)

app.all('/mcp', mcpAuth, (req, res) => nodeHandler(req, res, req.body))
```

- Mount before the production `app.get('*')` fallback.
- Existing `express.json()` is used; raise its limit to ~10 MB for large notes.
- Add `/mcp` to the Vite proxy so `:5174/mcp` also works in development.
- `cors()` is already permissive; bearer tokens are the security boundary.
- If exposed on a LAN, set `LOCAL_KEEP_ALLOWED_HOSTS` / `LOCAL_KEEP_ALLOWED_ORIGINS` and
  validate `Host`/`Origin`; browser-based MCP hosts need an allowed origin.

**Auth**

- `api_tokens` stores SHA-256 hashes of `lk_mcp_<random>` tokens. The raw token is shown
  once on creation.
- Create tokens via `POST /api/mcp/tokens` (session auth) or
  `npm run mcp:token -- create "<name>"`; list/revoke via the same API and a Settings
  modal.
- `checkAuth` (REST) and `mcpAuth` (MCP) accept, in order:
  1. `Authorization: Bearer lk_mcp_...` → actor `mcp:<name>`, scopes checked;
  2. valid session cookie → actor `ui`;
  3. `X-Auth-Token: <sessionId>` → actor `ui` (legacy/WS parity).
- `last_used_at` is updated lazily (at most once per minute).
- No anonymous MCP. If no password is set, MCP returns a setup error.

**Actor and collaboration**

- Revisions record `actor` (`ui`, `mcp:claude`, `system`) and `source`.
- Every write emits `note.created` / `note.revised` / `note.archived` / `render.updated`
  on the shared event bus.
- WS broadcasts to browsers; MCP resource notifications go to subscribed clients.
- Concurrent stale edits branch (D8), so multiple MCP clients and the browser never lose
  data.
- `list_changes` provides a polling alternative for clients without subscriptions.

**Tools** (detailed table in §7.3)

Core set:

- `search_notes` — full-text + tag/type/date filters; returns timestamps, snippets,
  revision info, tags, tile count/staleness.
- `list_notes` — browse/sort/paginate without a query.
- `get_note` — markdown + metadata + optionally history, links, backlinks, whiteboard
  summary.
- `create_note` — markdown, tags, related note IDs; creates revision 1.
- `edit_note` — creates a revision; `base_revision_id`; modes append/branch/take_head;
  returns `notice`, `previous_revision`, `conflict`.
- `append_to_note` — convenience: append a section as a new revision.
- `get_thread` — revision tree/head chain, JSON or ASCII text.
- `get_links` / `get_backlinks` — outgoing/incoming relationships with context.
- `get_graph` — nodes/edges, optional neighbourhood and tag filter.
- `list_tags` — tag tree with counts.
- `get_whiteboard` — ordered page images, markdown, URLs, or manifest; `render_if_stale`.
- `request_whiteboard_render` — trigger a browser render and wait (timeout).
- `list_changes` — events since a timestamp.
- Optional: `archive_note`, `restore_note`, `promote_revision`, `purge_note`.

**Resources**

```
local-keep://notes/{noteId}                        text/markdown (head)
local-keep://notes/{noteId}/revisions/{revisionId} text/markdown
local-keep://notes/{noteId}/thread                 application/json
local-keep://notes/{noteId}/backlinks              application/json
local-keep://whiteboards/{noteId}/pages/{page}     image/png
local-keep://tags                                  application/json
```

Register templates with `ResourceTemplate`; enumerate note/tag resources via `list`
callbacks. Image resources return `{ blob: base64 }`.

**Notifications**

- On revision/archive/restore/render, publish resource updates for the note, thread, and
  whiteboard page URIs. For 2026-era clients use the handler's notifier; for 2025-era
  clients, only send when subscribed (the SDK's docs describe the era guard).
- Browser clients continue to use WS; MCP clients can subscribe or call `list_changes`.

**stdio adapter**

- `mcp-stdio.js` builds the same `McpServer` but with `HttpFacade` (REST calls) instead of
  `DirectFacade` (services).
- Env: `LOCAL_KEEP_URL` (default `http://127.0.0.1:5173`),
  `LOCAL_KEEP_MCP_TOKEN` (required).
- This keeps one writer (the HTTP server) and preserves WS broadcasts. Logs go to
  stderr; stdout is the protocol.
- `npm run mcp` starts it.

**Example client config**

```json
{
  "mcpServers": {
    "local-keep": {
      "type": "http",
      "url": "http://localhost:5173/mcp",
      "headers": { "Authorization": "Bearer lk_mcp_REPLACE_ME" }
    }
  }
}
```

For stdio-only hosts:

```json
{
  "mcpServers": {
    "local-keep": {
      "command": "node",
      "args": ["/app/mcp-stdio.js"],
      "env": {
        "LOCAL_KEEP_URL": "http://localhost:5173",
        "LOCAL_KEEP_MCP_TOKEN": "lk_mcp_REPLACE_ME"
      }
    }
  }
}
```

**Security notes**

- Tokens are hashed at rest; never log raw tokens.
- Bind MCP to the same port as the app; if the app is on a LAN, require a token and
  document the exposure.
- Rate-limit token verification failures and cap MCP request body size.
- `get_whiteboard` caps tile count and bytes; `max_tiles` default 4, max 20.
- Image paths are resolved from DB hashes, never client-supplied paths.

---

## 7. API contracts

### 7.1 REST

Existing endpoints keep working unless noted.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/notes` | list heads | `?tag=&type=&includeArchived=&limit=&offset=`; returns tags/revision info |
| POST | `/api/notes` | create note | body may include `tags`, `relatedNoteIds`; creates revision 1 |
| GET | `/api/notes/:id` | get head | `?include=history,links,backlinks,render` |
| PUT | `/api/notes/:id` | edit | body `{title, content, baseRevisionId, mode, message}`; returns `{note, revision, notice, conflict}` |
| DELETE | `/api/notes/:id` | archive | `?purge=1` for permanent delete |
| POST | `/api/notes/:id/restore` | unarchive | |
| GET | `/api/notes/:id/history` | revisions/tree | `?limit=&offset=` |
| GET | `/api/notes/:id/history/:revisionId` | revision snapshot | content + lean canvas |
| POST | `/api/notes/:id/history/:revisionId/restore` | restore as new head revision | |
| POST | `/api/notes/:id/history/:revisionId/promote` | promote branch as new head revision | |
| GET | `/api/notes/:id/links` | outgoing links | |
| GET | `/api/notes/:id/backlinks` | incoming links + context | |
| GET | `/api/notes/:id/renders/latest` | latest whiteboard manifest | includes `stale` |
| PUT | `/api/notes/:id/renders` | save render manifest | tiles reference uploaded image hashes |
| POST | `/api/notes/:id/renders/request` | ask a connected browser to render | returns 202 + requestId |
| GET | `/api/graph` | graph nodes/edges | `?noteId=&depth=&tag=&includeUnresolved=` |
| GET | `/api/tags` | tag tree/counts | `?prefix=` |
| GET | `/api/search` | search objects | `?q=&tag=&type=&includeArchived=&limit=&offset=`; replaces the old ID array |
| GET | `/api/notes/:id/whiteboard` | whiteboard as JSON/markdown/images | facade for stdio/export |
| GET/POST/DELETE | `/api/mcp/tokens` | list/create/revoke tokens | session auth only |
| POST | `/mcp` | MCP Streamable HTTP | bearer/session auth |

Representative note shape:

```json
{
  "id": "1785652483902-7avcmlwy0",
  "revisionId": "3f2c...",
  "revisionNo": 3,
  "title": "Design notes",
  "displayTitle": "Design notes",
  "content": "# Design\n\nSee [[API plan]] and #project/local-keep",
  "type": "text",
  "canvasData": null,
  "thumbnail": null,
  "tags": ["project/local-keep"],
  "linkCount": 1,
  "backlinkCount": 2,
  "createdAt": "2026-10-01T10:00:00.000Z",
  "updatedAt": "2026-10-21T09:00:00.000Z",
  "archivedAt": null
}
```

### 7.2 WebSocket events

Client → server (existing + new):

| Type | Payload | Purpose |
|---|---|---|
| `join` | `{noteId}` | join whiteboard |
| `leave` | `{noteId}` | leave whiteboard |
| `delta` | `{noteId, elements, files?, thumbnail?}` | whiteboard delta |
| `checkpoint` | `{noteId, reason}` | force a canvas revision |
| `render-complete` | `{noteId, requestId, renderId}` | resolve an MCP render request |

Server → client:

| Type | Payload | Purpose |
|---|---|---|
| `notes` | `{notes}` | bulk list (kept for compatibility) |
| `note-deleted` | `{noteId, deletedAt}` | archive notification (existing) |
| `note-created` | `{noteId, revisionId, actor}` | new note |
| `note-revised` | `{noteId, revisionId, revisionNo, actor, source, conflict, notice}` | revision created |
| `note-archived` | `{noteId}` | archived |
| `note-restored` | `{noteId}` | restored |
| `note-gone` | `{noteId}` | delta rejected (existing) |
| `render-request` | `{noteId, requestId, revisionId}` | browser should render pages |
| `render-updated` | `{noteId, renderId, tileCount, sceneHash, stale}` | render manifest saved |

### 7.3 MCP tools

All tools return `structuredContent` (validated by `outputSchema`) plus a readable text
block. Timestamps are ISO-8601 strings; `epoch_ms` is included where useful.

| Tool | Input (summary) | Output (summary) |
|---|---|---|
| `search_notes` | `query?`, `tags?`, `tag_mode?`, `type?`, `created_after?`, `created_before?`, `updated_after?`, `updated_before?`, `include_archived?`, `limit?`, `offset?` | `results[]` with `note_id`, `revision_id`, `title`, `display_title`, `type`, `snippet`, `tags`, `created_at`, `updated_at`, `revision_created_at`, `revision_no`, `score`, `tile_count?`, `rendered_at?`, `stale?`; `total` |
| `list_notes` | `tag?`, `type?`, `include_archived?`, `sort?`, `order?`, `limit?`, `offset?` | same summary shape |
| `get_note` | `note_id`, `revision_id?`, `include_history?`, `include_links?`, `include_backlinks?` | `note` + optional history/links/backlinks/render summary |
| `create_note` | `title?`, `content`, `tags?`, `related_note_ids?` | `{note, revision, notice}` |
| `edit_note` | `note_id`, `base_revision_id?`, `title?`, `content?`, `tags?`, `related_note_ids?`, `mode?`, `message?` | `{note, revision, previous_revision, conflict, notice, history_url}` |
| `append_to_note` | `note_id`, `content`, `title?`, `base_revision_id?` | same as `edit_note`, content appended as a new section |
| `get_thread` | `note_id`, `include_content?`, `max_revisions?`, `format?` (`json`\|`text`) | flat revisions + tree + head chain; ASCII tree for `text` |
| `get_links` | `note_id`, `include_archived?` | outgoing links with status/context |
| `get_backlinks` | `note_id`, `include_archived?` | incoming links with source metadata/context |
| `get_graph` | `note_id?`, `depth?`, `tag?`, `limit?`, `include_unresolved?` | `{nodes, edges}` |
| `list_tags` | `prefix?`, `include_empty?` | tag tree with direct/subtree counts |
| `get_whiteboard` | `note_id`, `revision_id?`, `format?` (`images`\|`markdown`\|`urls`\|`manifest`), `max_tiles?`, `render_if_stale?` | text manifest + ordered image blocks and/or markdown image refs |
| `request_whiteboard_render` | `note_id`, `timeout_ms?` | manifest or `{requested:false, reason}` |
| `list_changes` | `since?`, `limit?` | events with note/revision/actor/type/timestamps |
| `archive_note` | `note_id` | head with `archived_at` |
| `restore_note` | `note_id` | head with `archived_at:null` |
| `promote_revision` | `note_id`, `revision_id` | new head revision + notice |

`get_whiteboard` example result blocks:

```
[ text ]  {"note_id":"...","tile_count":3,"rendered_at":"...","stale":false,
           "pages":[{"page":1,"url":"/api/images/ab12.png"}, ...]}
[ image ] data=<base64 png>, mimeType=image/png
[ image ] data=<base64 png>, mimeType=image/png
[ image ] data=<base64 png>, mimeType=image/png
```

The text block for `format=markdown`:

```markdown
# Whiteboard (3 pages)

![Whiteboard page 1](/api/images/ab12.png)
![Whiteboard page 2](/api/images/cd34.png)
![Whiteboard page 3](/api/images/ef56.png)
```

### 7.4 Error and notice semantics

- `404` for missing notes/revisions; `409`-style payload (`conflict: true`) for stale
  edits that were saved as a branch; `400` for invalid tag/link syntax; `413` for
  oversized inputs; `401/403` for auth/scope failures.
- Every revision-creating response includes:
  ```json
  {
    "notice": "Saved revision 3; revision 2 kept.",
    "history_url": "http://localhost:5174/#/note/<id>/history"
  }
  ```
- MCP tool errors use `isError: true` with a readable message; do not throw raw SQL
  errors.

---

## 8. Frontend restructure

`src/App.vue` is ~3,100 lines. Extract incrementally, keeping behaviour:

```
src/App.vue                     auth shell, WS, global paste, toasts
src/views/NotesView.vue         gallery, sort, search, tag sidebar
src/views/GraphView.vue         graph canvas + filters
src/views/TagsView.vue          tag structure browsing (optional)
src/components/
  NoteCard.vue                  card, tags, revision badge, page badge, actions
  NoteEditor.vue                modal/detail editor, modes, save/notice
  MarkdownEditor.vue            Write/Markdown/Preview, paste, image insertion
  MarkdownPreview.vue           sanitised render + internal link handling
  TagSidebar.vue                tree, counts, filters
  BacklinksPanel.vue            incoming links + context
  RevisionTree.vue              history tree, preview/restore/promote
  GraphCanvas.vue               d3-force SVG, zoom/pan, click
  WhiteboardPages.vue           page drawer, render now, copy markdown
  SettingsModal.vue             MCP token management
  ToastHost.vue                 revision/conflict/MCP notices
src/composables/
  useAuth.js, useNotes.js, useRealtime.js, useTags.js, useGraph.js, useToasts.js
src/api/client.js               fetch wrapper with token/cookie handling
```

Routing: keep the existing single-view shell for the first delivery; add `vue-router`
(hash history) when note detail/graph deep links are implemented:

```
#/                    gallery
#/note/:id            note detail/editor
#/note/:id/history    revision tree
#/graph               graph
#/tags/:tag?          tag structure
#/whiteboard/:id      whiteboard
```

Hash routing avoids server rewrites and works in both dev and production. Back/forward
and MCP `history_url`/`web_url` links then work.

UX details:

- Header: search, tag toggle, graph, new note/whiteboard, MCP settings.
- Card badges: type, revision number, tags, link/backlink counts, page count.
- Note detail: title, tags, mode toggle, save (with base revision), history, backlinks,
  related notes.
- Toasts: revision saved, branch created, MCP update, render complete/failed.
- Empty states: no notes, no tags, no links, no render yet.
- Keyboard: `Ctrl/Cmd+Enter` save, `Ctrl/Cmd+I` search, `Ctrl/Cmd+Shift+M` preview,
  `Esc` close, existing whiteboard shortcuts unchanged.

---

## 9. Delivery plan

Rough estimate: one developer, ~26–34 focused days (5–7 weeks). Phases are independently
testable; do not start MCP before the service layer and revisions exist.

### Phase 0 — Foundation and safety (2–3 days)

- Verify/archive the completed OpenSpec changes so the baseline is clean.
- Extract `db.js`, `events.js`, `services/*`, `http/*`, `realtime/*` from `server.js`
  without behaviour changes. `server.js` becomes the composition root.
- Add `createApp()` / `createServices()` factories for tests.
- Enable WAL, `busy_timeout`, foreign keys; add `schema_migrations`; add backup helper.
- Add test harness with a temp data dir; baseline tests for notes CRUD, search, WS join,
  image refs, and auth.
- **Acceptance**: existing app behaviour unchanged; `npm run dev` works; baseline tests
  pass; MCP not yet exposed.

### Phase 1 — Threads and immutable revisions (4–5 days)

- Migration 001 + backfill + backup + idempotence test on a copy of the real DB.
- Revision service: create/edit/branch/restore/promote; head update; snapshot hashes;
  `note_events`.
- REST changes: note shape, `history`, `restore`, `promote`; archive semantics.
- WS `note-created` / `note-revised` / `note-archived` / `note-restored`.
- Minimal UI: revision badge, toast, history drawer, read-only revision preview,
  restore/promote; update delete copy to "Archive (history kept)" and add an explicit
  "Delete permanently" action.
- **Acceptance**: edit creates revision N; revision N−1 readable; stale edit branches;
  archive retains history; migration on the 89-note DB is byte-for-byte content-safe.

### Phase 2 — Markdown-first editor and paste (3–4 days)

- Add `marked`, `dompurify`, `turndown`, `turndown-plugin-gfm`.
- Implement `src/shared/markdown.js` and `notesText.js`; replace `renderContent`;
  sanitise all rendered HTML.
- `MarkdownEditor.vue` modes (Write/Markdown/Preview); `Ctrl/Cmd+Shift+M`.
- Paste pipeline: HTML→markdown, strip rich context, upload data-URL images, normalise
  text-note image refs on save.
- **Acceptance**: paste from a web page/office doc yields clean markdown; images become
  `/api/images/...`; mode toggle round-trips; gallery preview matches detail preview.

### Phase 3 — Tags, links, backlinks, graph (5–6 days)

- Shared tag/link tokenizers (code-aware); tables; sync on save; backfill existing
  notes (expect almost no tags/links due to code blocks).
- Tag tree API + filtering; link resolution + backlinks; graph API.
- UI: `TagSidebar`, chips/filter, clickable internal links (including gallery),
  `BacklinksPanel`, `GraphCanvas` (`d3-force`), tag structure view.
- **Acceptance**: `[[Other]]` opens the target; target shows backlink; `#area/project`
  filters including descendants; graph renders and navigates; unresolved links visible.

### Phase 4 — Whiteboard pages (5–6 days)

- `whiteboardTiles.js` pure planner + unit tests (rows, columns, arrows, frames, huge
  clusters, empty).
- Client renderer in `WhiteboardEditor`: plan, export, upload, manifest; progress/cancel.
- Server render tables/endpoints; stale detection against `canvas_hash`; image refs.
- UI page drawer, render triggers (manual/leave/optional idle), legacy thumbnail tile,
  card page badge, copy markdown.
- **Acceptance**: large board yields ordered pages L→R/T→B; small board yields one;
  no element cut in normal cases; manifest survives reload; MCP can read it.

### Phase 5 — Embedded MCP (5–7 days)

- Add MCP v2 packages; token table/service/CLI/UI.
- `createMcpServer` with `DirectFacade`; tools/resources; output schemas.
- Mount `/mcp`, bearer auth, Vite proxy, body limits, host/origin config.
- Event bus → MCP resource notifications; actor tracking; conflict/branch notices.
- `mcp-stdio.js` + `HttpFacade` (REST) for stdio-only hosts.
- Docs: `docs/mcp.md`, client config examples, token setup.
- **Acceptance**: `tools/list` and `tools/call` work via curl/MCP Inspector; search
  returns timestamps; `get_thread` shows a tree; `get_whiteboard` returns ordered
  images; `edit_note` creates a revision and the browser shows a toast; two clients
  editing concurrently get a branch, not data loss.

### Phase 6 — Hardening and migration (2–3 days)

- Dry-run migration on a copy of `data/local-keep.db`; verify counts/content/images.
- Performance: FTS joins, tag/link indexes, graph limits, render caps.
- Security review: token storage, scopes, body limits, path validation, Host/Origin.
- Update `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/mcp.md`,
  `docs/relationships-and-tags.md`, `docs/whiteboard-pages.md`.
- Archive OpenSpec change(s); record ADR decisions.
- **Acceptance**: full manual acceptance checklist passes; backup/restore documented;
  no regressions in whiteboard collab, deletion mask, or cookie auth.

### Definition of done

- Existing 89 notes migrate with identical title/content/canvas data and stable IDs.
- Every text save creates a revision; the previous version is readable and restorable.
- Links/tags/backlinks/graph work from UI and MCP.
- Markdown modes and paste sanitisation work without data loss.
- Whiteboard pages render in reading order and are retrievable by MCP.
- MCP search returns timestamps; thread tree and whiteboard images work.
- Concurrent edits branch and notify; no silent overwrite.
- Tests, docs, CHANGELOG, AGENTS, and OpenSpec state are updated.

---

## 10. Testing strategy

### Unit (no DOM)

- `tests/tags.test.js`: tokenizer rules (code fences, URLs, CSS colours, Unicode,
  hierarchy, duplicates, limits).
- `tests/links.test.js`: wiki-link parsing, labels, explicit IDs, code exclusion,
  ambiguity/unresolved statuses.
- `tests/notesText.test.js`: display title, clean content, markdown-to-text.
- `tests/whiteboardTiles.test.js`: clustering, reading order, page packing, arrow/frame
  unions, huge-cluster fallback, empty input.
- `tests/revisions.test.js`: snapshot hash, head chain, branch detection, restore/promote.
- `tests/search.test.js`: FTS query sanitisation, tags/date filters, snippets/timestamps.
- `tests/migrations.test.js`: fresh DB + copied real DB, idempotent second run, counts and
  content hashes.

### Integration (temp DB + ephemeral server)

- `POST/PUT/GET/DELETE /api/notes` with revision assertions.
- Archive/restore; search excludes archived by default.
- Tags/links/backlinks/graph endpoints.
- Render manifest insert + stale computation + image refs.
- WS: join/delta/checkpoint, `note-revised`, `note-deleted`, `note-gone`.
- Auth: cookie, `X-Auth-Token`, bearer token scopes, revoked token.
- MCP: `tools/list` and `tools/call` over HTTP; search timestamps; `get_thread`;
  `get_whiteboard` image blocks; `edit_note` notice and branch.
- Run two clients: one browser-like WS, one MCP; edit concurrently; assert branch.

### Frontend/manual

- Add Vitest + happy-dom only if needed for `renderMarkdown`/DOMPurify; otherwise test
  pure helpers with `node:test` and verify rendering manually.
- Manual checklist:
  1. Paste a styled web page: no colours/fonts; lists/links/code preserved.
  2. Paste an image: uploads once, markdown ref, renders after reload.
  3. Toggle Write/Markdown/Preview three times: content identical.
  4. Create `[[Other]]`, click it, check backlinks; create a broken link and see it
     styled as broken.
  5. Create `#project/local-keep/design`; filter by `#project`; child appears.
  6. Edit a note twice; history shows r1/r2; restore r1; r3 is created, r1/r2 remain.
  7. Open the same note in two tabs; edit in both; second save becomes a branch and both
     are visible.
  8. Whiteboard with three separated clusters: pages ordered L→R/T→B; copy markdown.
  9. MCP Inspector: search, get_note, get_thread, get_whiteboard, edit_note.
  10. Delete/archive a note: history/revisions still readable; restore works.
  11. Legacy canvas: thumbnail appears as a one-page legacy render until re-rendered.
  12. Existing cookie login/deletion mask/whiteboard image sync still work.

### Migration rehearsal

- Copy `data/local-keep.db` to `/tmp/opencode/local-keep-migration-test.db`.
- Run migrations; assert 89 notes, 89+ revisions, 3 canvas legacy renders, content hashes.
- Open the app against the copy; inspect 5 text notes and all 3 canvases.
- Run migrations again; assert no changes.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Migration corrupts data | Data loss | `VACUUM INTO` backup, single transaction, dry run on a copy, verification queries, fail closed |
| `App.vue` refactor regresses UI | Broken editing | Phase 0 extraction without behaviour changes; keep modal flow until routes are ready; manual checklist |
| Excalidraw page export is slow/janky | Bad whiteboard UX | Sequential exports, idle/manual triggers, progress + cancel, page caps, stale metadata |
| MCP sees stale whiteboard images | Wrong context | `stale` flag, `render_if_stale`, on-demand render request, `rendered_at` |
| Revision storage growth | DB bloat | Lean canvas snapshots, snapshot hashes, dedupe unchanged saves, configurable retention for auto-checkpoints |
| Link ambiguity / broken links | Confusing graph | Explicit `[[note:<id>]]`, unresolved/ambiguous statuses, UI warning, optional disambiguation picker |
| Rich-paste edge cases | Messy notes | Turndown config + tests, plain-text fallback, normalise images on save |
| MCP token exposure | Unauthorised access | Hashed tokens, scopes, revoke UI, no anonymous, Host/Origin guidance, body limits |
| SQLite multi-process (stdio) | Locked DB | Primary HTTP MCP; stdio uses REST facade; WAL + busy_timeout as a fallback |
| FTS query errors | Empty search | Existing sanitizer + try/catch fallback; tests for quotes/operators |
| DOMPurify/marked differences | XSS or broken render | Strict allow-list, raw HTML disabled, sanitize tests, no server-side HTML rendering |
| Concurrent edits | Lost work | Immutable revisions + `base_revision_id` + branch-by-default, notice in UI/MCP |
| Old clients | Breakage | Keep `notes`/`note-deleted` bulk events; add fields rather than rename; update in-repo client together |

---

## 12. Non-goals and decisions to confirm

### Non-goals (v1)

- Real-time collaborative text editing (CRDT/OT). Revisions + branching only.
- Automatic 3-way merge of branches.
- Server-side/headless whiteboard rendering (no Playwright/Chromium dependency).
- Multi-user accounts, per-note permissions, sharing links.
- Full Obsidian-style plugin ecosystem, aliases, block references, transclusion.
- Search over historical revisions (head search only; history is reachable via threads).

### Decisions to confirm before implementation

1. **Revision UX**: keep one card per note with a revision badge/history drawer
   (recommended), rather than showing every revision as a separate gallery card.
2. **Link syntax**: `[[Title]]` + explicit `[[note:<id>|label]]` (recommended). Do you
   want `[[Title#heading]]`/block references in v1? (Recommended: no.)
3. **Whiteboard page size**: default max 1600×1600 scene units, gap 48, export at 2000 px
   (recommended). Prefer A4 ratio or a fixed pixel size?
4. **MCP auth**: bearer tokens required, managed in Settings/CLI (recommended). Allow an
   anonymous localhost mode? (Recommended: no.)
5. **Retention**: keep all text revisions and manual canvas checkpoints; allow a cap for
   automatic canvas checkpoints (recommended default: keep all, cap configurable).
6. **Archive default**: deleting archives and retains history (recommended); permanent
   purge is a separate, explicit action.

---

## Appendix A — Syntax reference

```markdown
# Heading

A link to [[Another note]] and [[Another note|shown text]].
A stable link: [[note:1785652483902-7avcmlwy0|shown text]].

Tags: #project #project/local-keep #项目/设计

![alt text](/api/images/ab12cd34ef56gh78.png)
![alt text](/api/images/ab12cd34ef56gh78.png){width=600}

- [ ] task
- [x] done
```

Parsing rules:

- Fenced code blocks and inline code are ignored for tags/links.
- `#` is a tag only when not immediately preceded by an ASCII word character
  (`[A-Za-z0-9_/]`); `# Heading` (with a space) is a heading, not a tag.
- `#e2ece4` (pure hex colour) is not a tag.
- Links longer than 200 chars are ignored; max 200 links/tags per note.
- `{width=N}` is a Local Keep extension; standard markdown remains valid.

## Appendix B — Whiteboard page planner pseudocode

```js
function planPages(elements, opts = {}) {
  const gap = opts.gap ?? 48
  const maxW = opts.maxPageW ?? 1600
  const maxH = opts.maxPageH ?? 1600
  const rowTolerance = opts.rowTolerance ?? 40

  // 1. Atomic units: groups, frames, bound text, bound arrows.
  const units = buildAtomicUnits(elements) // { ids, bbox, bindings }

  // 2. Spatial clustering (union-find over expanded bboxes + bindings).
  const clusters = unionFindClusters(units, gap)

  // 3. Reading order: top-to-bottom bands, left-to-right inside a band.
  const bands = groupIntoBands(clusters, rowTolerance)
  const ordered = bands.flatMap(band => band.sort((a, b) => a.bbox.minX - b.bbox.minX))

  // 4. Greedy packing into pages.
  const pages = []
  let page = null
  for (const cluster of ordered) {
    if (!page || !fits(page, cluster, maxW, maxH)) {
      page = { clusters: [], bbox: null }
      pages.push(page)
    }
    page.clusters.push(cluster)
    page.bbox = union(page.bbox, cluster.bbox)
  }

  // 5. Huge single cluster: export alone, or grid fallback with clipped=true.
  return pages.map((page, index) => finalisePage(page, index, maxW, maxH))
}
```

Export each page with `exportToBlob` using only that page's elements (bound text/arrows
included by construction), `files`, `exportPadding`, `maxWidthOrHeight`.

## Appendix C — Migration checklist

```
[ ] Stop writes / accept node --watch restart
[ ] Backup: VACUUM INTO data/backups/pre-revisions-<ts>.db
[ ] Copy DB to /tmp/opencode/local-keep-migration-test.db
[ ] Run migration on the copy; check logs
[ ] SELECT COUNT(*) FROM notes;                    -- unchanged (89)
[ ] SELECT COUNT(*) FROM notes WHERE head_revision_id IS NULL;  -- 0
[ ] SELECT COUNT(*) FROM note_revisions;           -- >= notes
[ ] Compare md5(title||content) for each note before/after
[ ] Check 3 canvas notes have a legacy render + tile
[ ] SELECT COUNT(*) FROM notes_fts;                -- = notes
[ ] Spot-check search for a known term
[ ] Run migration again; no changes (idempotent)
[ ] Open the app on the copy; inspect 5 text notes + 3 canvases
[ ] Run the real migration; start app; run manual acceptance
[ ] Keep the backup until satisfied; document restore command
```

## Appendix D — MCP configuration examples

HTTP (recommended):

```json
{
  "mcpServers": {
    "local-keep": {
      "type": "http",
      "url": "http://localhost:5173/mcp",
      "headers": { "Authorization": "Bearer lk_mcp_REPLACE_ME" }
    }
  }
}
```

stdio (for hosts that only launch subprocesses):

```json
{
  "mcpServers": {
    "local-keep": {
      "command": "node",
      "args": ["/app/mcp-stdio.js"],
      "env": {
        "LOCAL_KEEP_URL": "http://localhost:5173",
        "LOCAL_KEEP_MCP_TOKEN": "lk_mcp_REPLACE_ME"
      }
    }
  }
}
```

Token creation:

```bash
npm run mcp:token -- create "Claude Desktop"
# prints lk_mcp_... once; store it in the client config
npm run mcp:token -- list
npm run mcp:token -- revoke <id>
```

Smoke test:

```bash
curl -s -X POST http://localhost:5173/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer lk_mcp_...' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
