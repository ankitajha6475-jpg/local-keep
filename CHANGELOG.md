# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Image insertion in whiteboard: Excalidraw image tool enabled, paste support, real-time sync via WebSocket
- Image insertion in text notes: upload button, clipboard paste, markdown image rendering
- Content-addressed image storage (`data/images/`) with SHA-256 hashed filenames for deduplication
- `POST /api/images` upload endpoint and `GET /api/images/:filename` serve endpoint
- Server-side extraction of base64 image data to disk during whiteboard persist
- Shared image store between whiteboard and text notes
- Image garbage collection: 🧹 button in header to clean orphaned images not referenced by any note
- `image_refs` database table tracking which images are used by which notes
- `POST /api/images/cleanup` endpoint for garbage collection
- Startup migration to populate `image_refs` for existing notes
- Broken image handling: non-existent images hidden in gallery, converted to markdown text in editor
- Persistent signed-cookie login (~30 days): sessions stored server-side and validated via cookie for REST and via session token for WebSocket
- Multiuser human accounts with `admin`/`member` roles, display names, and shared-workspace notes
- scrypt password hashing with one-time upgrade of the legacy single-password hash on first login
- Admin People UI: add accounts, change roles, disable/enable, and reset passwords with one-time temporary passwords
- `npm run auth:reset -- <username>` CLI recovery path; resets revoke live sessions immediately
- Session cookies are now bound to users; the database is authoritative for validation/revocation
- HTTPS Vite dev server using the shared mkcert certificate (`https://192.168.3.222:5174`), with REST/WS/MCP proxied same-origin
- Polished setup/login screens, account menu, account settings, forced password change, and user-management dialogs
- `GET /api/auth/status` and `POST /api/auth/logout` endpoints; `sessions` table for session persistence across server restarts
- Cross-client deletion detection: targeted `{type:'note-deleted'}` broadcast on note deletion; clients editing/viewing the deleted note get an inline overlay (no alert/confirm) offering Save-as / Discard; server rejects further deltas for deleted notes with `{type:'note-gone'}`
- Architecture plan for note relationships/tags, immutable revisions/threads, markdown-first editing, whiteboard page rendering, and an embedded MCP server (`docs/plan-docs/2026-10-21-relationships-tags-history-mcp-plan.md`)
- Immutable note threads: `notes` is the head and `note_revisions` stores append-only snapshots with parent links, actor/source, and timestamps
- Stable document identity while editing: `editingId`/`notes.id` never changes; `baseRevisionId` drives optimistic concurrency
- Branch-by-default conflict handling: stale saves create a branch revision and leave the head unchanged; `take_head` is the explicit override
- Revision history API/UI: `GET /api/notes/:id/history`, snapshot read, restore, promote, and a History drawer with revision previews
- Archive-by-default deletion with `POST /api/notes/:id/restore` and explicit `?purge=1`; archived filter and restore action in the UI
- Whiteboard checkpoints on back/leave/manual/interval create canvas revisions under the same note id
- Revision-aware image retention (`revision_image_refs`) so old-version images survive cleanup
- Versioned schema migrations with a `VACUUM INTO` backup under `data/backups/` before migrating existing notes
- `npm test` suite covering migration, revisions, branches, restore/promote, archive/purge, images, HTTP API, and whiteboard checkpoint WebSocket flow
- Sanitised markdown rendering shared by the gallery, rich editor, and preview (`marked` + `DOMPurify`)
- Write / Markdown / Preview editor modes with `Ctrl/Cmd+Shift+M` cycling
- Rich-paste normalisation (`Turndown` + GFM): styled HTML becomes clean markdown; plain text and image clipboard items are preserved
- Canonical markdown image references: pasted/saved `data:image` sources are uploaded and rewritten to `/api/images/<hash>.<ext>`
- Extended rich-editor serialisation for headings, paragraphs, ordered/unordered lists, blockquotes, fenced/inline code, tables, horizontal rules, links, and wiki-link spans
- Internal-link renderer hook (`[[...]]`) with broken-link styling, ready for the relationships change
- Renderer/serialiser tests using `jsdom`
- Wiki links (`[[Title]]`, `[[Title|label]]`, `[[note:<id>|label]]`) with code-aware parsing and stable explicit ids
- `note_links` storage with title resolution, unresolved/ambiguous/archived statuses, and global re-resolution on title changes
- Outgoing links and backlinks APIs with context snippets; backlinks drawer in the editor
- Relationship graph API and an interactive `d3-force` graph view with click-to-open, depth, and unresolved toggle
- Hierarchical tags (`#area/project/topic`) with NFKC normalisation, code-aware parsing, hex-colour rejection, and per-note limits
- `note_tags` storage and a tag tree with unique-note direct/subtree counts, untagged count, and prefix filtering
- Tag chips on cards, tag sidebar filtering (descendants by default), tag breadcrumb, and tag-aware search
- Migration 002 backfilling tags/links for existing notes; real DB migrated with a pre-migration backup
- Tag/link parser, service, migration, and API tests
- Reading-order whiteboard page planner (groups/frames/bindings, spatial clusters, bands, greedy packing)
- Browser page export/upload with progress, scene-change cancellation, and ordered manifests
- Whiteboard Pages drawer with thumbnails, stale badge, Render now, Copy markdown, Download all
- Render manifest API (`GET latest`, `PUT renders`, `POST renders/request`) with staleness against the head canvas hash
- WS `render-request` / `render-complete` / `render-updated` and on-demand browser rendering
- Render/planner API and unit tests
- Embedded MCP Streamable HTTP endpoint at `/mcp` (SDK v2) with bearer tokens and session auth
- `api_tokens` storage, token create/list/revoke REST/CLI/UI, named MCP actors (`mcp:<name>`), and REST bearer auth
- MCP tools for search/list/get/create/edit/append, thread trees, links/backlinks/graph, tags, whiteboard pages, render requests, change feed, archive/restore/promote
- MCP search results include created/updated/revision timestamps, tags, link counts, and whiteboard render/staleness info
- MCP whiteboard recall as ordered image content blocks or markdown image refs, with stale/offline notices
- MCP resources for notes, revisions, threads, backlinks, tags, and whiteboard page images
- Optional `mcp-stdio.js` adapter and `npm run mcp` script
- MCP end-to-end/token tests (`@modelcontextprotocol/client`) and `docs/mcp.md`

### Changed
- Existing single-password installs migrate to `admin` / `Administrator` using the old password; the hash is upgraded on first login
- Human revision actors are now `user:<username>` instead of the generic `ui`
- Vite serves HTTPS; direct `:5173` remains an internal HTTP API for MCP/stdio clients
- Login uses username + password; sessions remain valid for 30 days
- Whiteboard delta sync now includes `files` alongside `elements` for image synchronization
- `canvasData` stores file hash references instead of inline base64 after persist
- `DELETE /api/notes/:id` now archives instead of hard-deleting; use `?purge=1` for permanent deletion
- Lists and search exclude archived notes by default (`includeArchived=1` / 📥 Archived toggle to show them)
- `PUT /api/notes/:id` accepts `baseRevisionId` and `mode`; note responses add `revisionId`, `revisionNo`, `displayTitle`, `archivedAt`, and revision notices
- `notes.display_title` and plain-text FTS content are maintained server-side; the shared display-title helper is used by both client and server
- Whiteboard leaving triggers a checkpoint and the last WS session leaving forces one
- Pre-revision canvas thumbnails become a one-tile legacy render until whiteboard page rendering is implemented
- Text-note gallery previews and the editor now use the sanitised markdown renderer; headings, lists, tables, and code render semantically
- Rich paste now converts HTML to markdown instead of inserting browser/office markup
- Unknown/literal HTML in notes is escaped rather than interpreted, preserving technical notes
- Note cards show current tag chips; the gallery can be filtered by tag (descendants included)
- Note list responses include `tags`, `linkCount`, and `backlinkCount`; search accepts `tag`/`exactTag`
- The gallery keeps archived notes in memory and filters them client-side, so link resolution and instant archive toggling work
- New dependency `d3-force` for the relationship graph
- Whiteboard leaving triggers a page render when the scene changed; the legacy thumbnail remains as a one-tile render until re-rendered
- Whiteboard page images are content-addressed and protected from cleanup by tile references
- REST auth now also accepts `Authorization: Bearer lk_mcp_...` tokens and sets an actor (`ui` or `mcp:<name>`)
- Vite proxies `/mcp` to the Express backend so MCP clients can use either :5173 or :5174 in development
- `express.json` limit raised to 10 MB for MCP note payloads
- Moved text-note image insertion button out of the Save/Cancel action row into an editor toolbar above the body
- Text-note editor toolbar now also includes Bold / Italic / Link / Checkbox formatting actions; bold/italic/link/checkbox markdown is rendered in the gallery preview as well
- Notes can be saved with title only (no body required); gallery/list/headers now derive a display title from leading content when a note has no explicit title
- Whiteboard file storage now preserves Excalidraw's required `dataURL`/`id`/`created` alongside the content hash (was discarding them, leaving images unable to render)
- Whiteboard touch handling now allows single-finger pan in drawing tools while keeping stylus input free, instead of requiring a two-finger gesture to switch to hand mode

### Fixed
- Pasted/inserted whiteboard images now render correctly on all clients and on reload (server no longer strips Excalidraw's required dataURL; sender excluded from its own delta echo)
- Legacy whiteboard entries stored without `dataURL` are hydrated from disk on next load
- Image cleanup no longer deletes images referenced only by an old revision or a whiteboard tile
- FTS indexing now stores readable plain text (`markdownToText`) and excludes archived notes from search joins
- Migration verifies every note has a head revision and rolls back on failure instead of leaving partial state
- Rich pastes no longer leak inline styles, classes, scripts, or office markup into notes
- Rendered markdown is sanitised; script/style/iframe/event-handler payloads cannot execute

### Removed
- Image paste blocker (`blockImagePaste`) in whiteboard editor
- `UIOptions.tools.image = false` — image tool now enabled

### Added (earlier)
- Research docs on Excalidraw internals (pointer/touch/eraser/fullscreen)
- Practical guide for porting stylus features to another project

## [0.2.0] — 2026-06-20

### Added
- Real-time collaboration via WebSocket (single user, multiple terminals)
- LWW merge with server-assigned `_collab_ts` timestamps
- Custom undo/redo via Excalidraw `registerAction` (per-operation tracking)
- Thumbnail generation alongside delta sync
- Excalidraw whiteboard canvas with manual React mount
- Stylus pen/eraser toggle via side button (`keyup` with `keyCode: 0`)
- Two-finger touch zoom/pan (auto-switches to hand tool, restores on lift)
- Image tool disabled (`UIOptions.tools: { image: false }` + paste interceptor)
- Canvas data persistence to SQLite with debounced server-side save
- FTS5 indexing for canvas text content
- `node --watch` for auto-restart on server code changes
- AGENTS.md for project documentation
- CHANGELOG.md

### Fixed
- `persistNoteState` SQL error: `canvas_text` column only exists in `notes_fts`, not `notes`
- `registerUndoRedo` wrapped in try/catch to prevent blocking `tryJoin`
- `flushChanges` deferred until WS join completes (`needsFlush` flag)

### Changed
- Switched from veaury bridge to manual `createRoot` + `React.createElement` for Excalidraw
- `@vitejs/plugin-react` pinned to v4 (v5+ incompatible with Vite 5)

## [0.1.0] — 2026-06-19

### Added
- Initial release: text notes with CRUD, password protection, WebSocket sync
