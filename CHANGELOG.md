# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Notes now have an Obsidian-style **properties section**: a typed metadata block at the top of the canonical file (title, tags, aliases, and free-form keys) with a properties panel in the editor. The body is pure markdown again — `#` always means a heading, never a tag
- The tag tree is now operable: rename, move, or delete a tag subtree from the sidebar, rewriting that path across every affected note in one batch (archived notes are skipped and reported)
- Tags are edited through chips in the note's properties panel instead of typed into the body
- A `note_meta` shadow index supports filtering notes by property key and value (equality and numeric/date comparison)
- MCP gains `set_properties`, and `get_note` returns structured `meta` plus body-only content (`include_frontmatter: true` returns the raw file)
- The History button now shows the current version number as a bubble (e.g. `v2`) beside its label, reflecting the note's revision number
- Wiki links are now version-pinned (frozen references): a link records and keeps a reference to the immutable revision it targets, resolving to that frozen version's title/revision even after the target note is edited. Explicit `[[note:<id>@<rev>]]` pins a named revision; bare links auto-pin the target's version at link time
- Notes expose automatic old→new version-chain links between each revision and its predecessor, surfaced as a version chain (e.g. `v1 → v2 → v3`) in the History panel

### Changed
- Tags moved out of the note body into the properties section; inline `#tag` markers are stripped once by migration 015 and no longer parse from body text
- Every change to the file (body **or** properties) now creates a revision; metadata edits record `source: property`, and batch tag operations share one message so the history can group them
- `add_tags` / `remove_tags` / the `tags` argument on MCP note tools are now property mutations that rewrite the tags list instead of appending `#tag` text to the body
- The note title is head metadata outside the file: renaming creates no revision, and restore/promote no longer move the title (they copy content and properties only)
- Semantic search indexes title + tags + body with the fence stripped from retrieval text, and the index identity hash now covers tags so tag-only edits re-index
- Dev ports are no longer published on `0.0.0.0` (the host has a public IPv6 prefix): `5173` publishes on `127.0.0.1` for host MCP/API clients and `5174` on `${LOCAL_KEEP_BIND:-192.168.3.222}` for the LAN UI, with LAN clients reaching the API/MCP through the Vite proxy on `:5174`
- The Create-new floating button is now smaller (46px desktop / 42px mobile with a 22px icon) and no longer appears over the whiteboard view; it is dashboard-only and returns when leaving the canvas
- The note editor header now reads simply **Editor** (no revision badge or Ctrl+Enter hint); the Visual/Source mode switch and the Paste plain/rich select moved to the bottom-left of the editor, and the content toolbar holds only the markdown tools with the image button flowing inline after them
- Shortcut hints now reveal on **Alt/Option only** (Ctrl/Cmd alone no longer reveals them) and bare Alt keydown/keyup is intercepted so Chrome does not focus its menu bar; `Ctrl/Cmd+Alt+…` combos keep working
- The editor toolbar image button now uses the same tooltip and Alt-reveal behavior as the markdown tool buttons
- The markdown Source view now uses the same font and size as the Visual editor instead of a monospace stack
- The Visual editor now applies live markdown block shortcuts: typing `- `, `* `, `+ `, `1. `, `# `…`###### `, or `> ` at the start of a line converts it into a bulleted/numbered list, heading, or blockquote instead of showing the literal marker

### Fixed
- **Data corruption — duplicated properties fences**: the shared live draft held the whole file (fence + body) while the editor held body-only, so every save through the draft path prepended a second fence. Notes that went through several saves accumulated stacked fences (one note reached four). The draft now holds the body only with properties riding `meta.props`, and the fence is reassembled at commit. Affected notes are repaired by `scripts/repair-fences.js`, which appends a repair revision rather than rewriting history
- The phantom "save draft?" prompt: opening a note with a shared draft compared fence-inclusive draft text against body-only editor text, so untouched notes looked modified and prompted on close
- MCP sessions no longer report permanently dirty: the draft-versus-base comparison is body-only on both sides and includes property changes
- Repair/migration scripts are now import-safe — `scripts/repair-fences.js` wrapped its database writes in a guarded `main()` so importing it can never mutate data (it had bypassed its own `--dry-run` gate)
- The editor modal now tints with the note's colour: the modal's fallback `--card-surface-*` defaults were declared at the same specificity as `.note-color-*` and won by source order, silently keeping the surface white
- The tag sidebar no longer shows a horizontal scrollbar; long tag names truncate with an ellipsis inside the fixed 230px column
- Dashboard hybrid search now calls `/api/search/hybrid`, defaults on when embeddings are configured, and preserves RRF/vector/keyword result order via a **Relevance** sort instead of re-sorting every result by last-modified time
- Qwen3-Embedding queries now include the model's retrieval instruction, fixing compressed/irrelevant rankings for short Chinese queries such as `云存储` without reindexing
- Dashboard search, tab, sort, and tag changes now reset the viewport to the top of the note list below the sticky header and controls
- Note color changes now unwrap the card's `{ note, color }` payload instead of sending `PUT /api/notes/undefined/color` and showing "Note not found"
- Single tildes in paths such as `~/.config` no longer render as false strikethrough or turn into `~~` when Visual mode is serialised; only GFM `~~text~~` is struck through
- Switching Visual/Source or opening a note with a shared draft no longer re-serialises the rendered DOM, so clean mode switches keep the source unchanged
- MCP sessions opened on archived notes now return `note_archived` with a restore guide instead of `note_not_found`
- `note_session close` now reports `draft_kept` from the persisted draft row, so a saved clean draft reports `false`
- The dashboard header and the sort/selection action bar now stay pinned while the note list scrolls, with the bar offset following the measured header height
- Header branding and controls now use the same centered 1200px container as the workspace, aligning the Local Keep logo with the tags sidebar and note grid
- Long note titles now wrap to two lines and truncate with an ellipsis instead of overflowing the card
- Bullet and numbered lists in the Visual editor no longer overspill past the editor's left edge; the global `* { padding: 0 }` reset was zeroing the default list indent, so the editor now gets the same list padding as the rendered preview
- The markdown Source view now soft-wraps long lines instead of overflowing horizontally
- Visual↔Source round-trips no longer introduce or lose newlines: insignificant whitespace `marked` emits between blocks is dropped and CommonMark tight/loose list separation is preserved, so switching views keeps the markdown byte-identical
- The Visual editor no longer shows phantom blank lines between list items (rendered markdown uses `white-space: normal` so block separators collapse instead of rendering as gaps)
- The Visual editor now renders markdown faithfully like the preview: loose lists (blank line between items) show paragraph spacing and tight lists stay compact, so the visual matches the source
- Clicking the Link or Wiki link toolbar button no longer crashes the app: `LinkDialog.vue` (and `SelectionLinksPanel.vue`, which would have crashed the gallery's 🔗 Links panel) had two `methods` blocks in their options objects, so the second silently dropped the `shortcut()` method used by shortcut labels and the render threw `shortcut is not a function`
- Whiteboard images pasted or cropped from another client now appear live on other open clients instead of showing a placeholder until refresh: remote image binaries are registered with Excalidraw's `addFiles()` API, because `updateScene()` silently ignores the `files` field and an image element rendered before its file arrives gets a permanent error placeholder
- Responsive breakpoints are now coordinated: the tag sidebar collapsed to full width at 720px while the workspace only stacked at 600px, so between 601–720px a full-width sidebar landed in a row layout and crushed/overflowed the notes area. Both now share the 600px stacked-layout breakpoint (cross-referenced in comments), the stacked workspace stretches its children to full width, the tab strip wraps instead of forcing horizontal overflow on very narrow viewports, and the sidebar's sticky offset tracks the measured `--app-header-height` instead of a hardcoded 80px

### Changed
- Shortcut hints now reveal while holding Ctrl/Cmd as well as Alt/Option, and every unique workspace action button has a shortcut; a central shortcut map and topmost-overlay dispatcher handle tabs, filters, selection, dialogs, editor modes, and admin actions
- Tag sidebar leaf rows now use a tag icon instead of depth indentation; parent rows keep their expand/collapse arrow
- The in-field search clear action now uses a broom icon, leaving the X icon for closing the search bar
- The dashboard now loads a lightweight note index and renders responsive `vue-virtual-scroller` rows; card bodies hydrate in 30-note batches with a bounded 120-note cache as you scroll, while search, tags, counts, link resolution, and Select All stay complete from the index
- Pasting defaults to clipboard `text/plain` and inserts it literally in Visual or Source, so Source shows exactly what was pasted; an editor toolbar **Paste: plain/rich** switch enables opt-in HTML-to-markdown conversion (per browser), and clipboard image files remain the non-text exception
- MCP `edit_note` and `append_to_note` return compact note/revision metadata by default (`include_content: true` for full bodies), accept `tags`, and normalize append blank lines; `get_note` omits canvas payloads unless `include_canvas: true`
- MCP `list_notes` and `search_notes` summaries now include `archived_at` and `is_archived` when archived rows are included
- Dashboard views are now split into Notes, Archived, and Drafts tabs; archived notes no longer mix with active notes
- The editor's bottom Cancel action is now Discard, and the unsaved-changes dialog offers Save, Draft, Discard, and equal-sized Continue
- Dashboard note cards now use shared tint variables; the Quick Shortcuts tile is a read-only virtual note with the standard card styling and scrollbar
- Dashboard header chrome refreshed with a gradient brand mark, glassy sticky bar, SVG icon actions, a dot-based sync pill, a compact account menu, and a matching create button
- Dashboard cards now fill their grid columns and use a soft tint (blue for text notes, purple for whiteboards) with an accent stripe and stronger hover elevation

### Added
- `/api/config` now exposes non-secret hybrid-search availability and model/rerank state so the dashboard can default its toggle correctly
- `GET /api/notes/index` and `POST /api/notes/window` for the virtualized dashboard; the WebSocket `notes` broadcast now carries index summaries instead of full note bodies and canvas scenes
- `DashboardNoteCard.vue` renders the dashboard card from an index summary plus a hydrated detail, with skeleton previews while a card body arrives
- MCP `add_tags`/`remove_tags` for one or more notes with `dry_run`, exact hierarchical removal, code-safe content edits, and compact per-note results
- MCP `purge_note` and `purge_archived` for permanent deletion of archived notes with previews, `expected_title`/`expected_count` guards, and archived-only enforcement
- Drafts tab and `GET /api/drafts`: browser users can list, open, and retain the shared Yjs drafts already used by MCP sessions; editor Draft keeps changes without committing, and normal cards show a Draft badge
- Per-note color tints with a palette picker next to the card checkbox; migration 13 adds `notes.color`, and `PUT /api/notes/:id/color` persists and broadcasts changes without creating revisions
- Dashboard shortcut hints: holding Alt/Option immediately reveals the Search and Create shortcuts without hovering, while other actions keep their labels; pointer events recover the state when a browser misses the Alt keydown
- `config.json` and `LOCAL_KEEP_CONFIG` set interface dimensions; admin **🎛 Interface** overrides persist in `app_settings`, apply live over the WebSocket, and can reset to file defaults
- Note editor modal now defaults to 960×760 (was 620px wide); link dialog, graph, and selection-links panel dimensions are configurable too
- Link and wiki-link tools now open a modal instead of a native prompt; regular links edit Text + URL, while wiki links search notes live and support arrow-key selection, recent suggestions, and new titles
- Wiki links now preserve aliases through render → edit → save using `data-note-target`, so `[[Missing note|alias]]` no longer collapses to `[[alias]]`
- Markdown editor toolbar now covers headings, lists, blockquotes, inline/code blocks, links, wiki links, tables, and horizontal rules in both Visual and Source modes, with platform-aware shortcuts and Alt/Option-revealed shortcut tooltips
- Multi-select link summary: the selection bar's 🔗 Links action lists what the selected notes link to and what links to them, with Both / Links to / Linked from modes and click-to-open rows
- `POST /api/notes/links/summary` returns deduplicated outgoing targets and incoming sources with context snippets for up to 2000 selected note ids
- Embedding batch tuning is stored in `embedding_settings` and edited under Advanced indexing in the admin dialog; defaults for Qwen3-Embedding-8B are 64/2/1/80000 and apply to the next note without restart
- Embedding variants: table partitions are keyed by model **and** dimensions, so `Qwen/Qwen3-Embedding-8B` at 4096 and 1024 dims use independent tables; Qwen3 defaults to 4096
- Admin embedding dimensions field and `Reset index` action/API to drop all embedding tables and reindex cleanly
- Migration 8 resets the embedding index for the variant-aware table scheme and queues a rebuild
- Embedding indexing now sends chunk arrays in batches and runs bounded parallel requests/notes; tuning lives in `embedding_settings` and `429`/`5xx` retries honor `Retry-After`
- Persistent MCP sessions with a stable tool list: `get_note_state` plus `note_session` actions for open/read/replace/insert/delete/append/title/save/close; session and mutation results include `state`, `allowed_actions`, and `guide`
- Per-token session state: multiple write sessions (default 5) and read sessions (default 8), read-to-write upgrade, TTL, and structured `too_many_writes`/`session_mode_mismatch` errors with recovery guides
- Admin-editable MCP session limits in the MCP access dialog; limits live in `mcp_settings` and apply to new opens without restart
- Migration 11 creates `mcp_settings` with 5 write / 8 read session defaults
- `expected_version` conflict detection for MCP edits and `source: mcp-open` revision saves that update the live draft base
- MCP read/write sessions appear in dashboard presence as `MCP (<token name> · read|write>)`
- Admin MCP tokens with `admin` scope can manage client tokens and use `/api/admin/*`; only a human admin session can mint another admin token
- Migration 10 adds token expiry (`expires_at`) and `created_by`; token state is keyed by token id, not display name
- Live text collaboration: Yjs CRDT shared drafts over the existing WebSocket, character-level merge, reconnect recovery, and Visual/Source caret restoration
- `note_text_docs` table and migration 7 for persisted live text drafts with a base revision
- Presence tracking for text and whiteboard sessions; dashboard cards show a green dot and tooltip while the note is open elsewhere
- `text-snapshot`, `text-update`, `text-saved`, `text-reset`, `text-discard`, and `presence` WebSocket messages
- Explicit shared-draft discard when the last editor chooses Discard; Save commits a revision and updates every open editor's base
- Tests for Yjs merge/persistence/reset and two-client WebSocket text sync/presence
- Mermaid fenced diagrams render lazily in Visual/gallery; Source shows the diagram source and serialization round-trips the fence
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
- Admin-configurable semantic search using any OpenAI-compatible `/embeddings` API (SiliconFlow default)
- AES-256-GCM encrypted embedding API keys; admin UI/API never returns the raw key
- `sqlite-vec` cosine vector tables partitioned by embedding model name; same model reuses its table, new models get new tables, switching back reuses the old table
- Paragraph-aware note/canvas chunking (default 1200 chars, 180 overlap) with background indexing on note edits, checkpoints, archive/restore, and config changes
- `semantic_search` MCP tool plus `search_notes` `mode: keyword|semantic|hybrid`; REST `/api/search/semantic` and `/api/search/hybrid`
- Hybrid keyword + vector search using reciprocal rank fusion (RRF)
- ✨ semantic search toggle in the UI search bar with keyword fallback
- Admin Semantic Search settings dialog: test connection, enable, model/dimensions, chunk settings, status, model list, and rebuild index
- Optional rerank: separate model, optional base URL/API key (falls back to embedding config), test button, and graceful vector-order fallback on rerank failure
- `rerank_score` / `rerank` metadata in semantic and hybrid results
- Migration 5 for `embedding_settings`, `embedding_models`, and `embedding_index_state`
- Migration 6 for optional rerank settings (`rerank_enabled`, base URL, encrypted key, model)
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
- Retrofit OpenSpec specs for live text collaboration, semantic search, MCP sessions/admin limits, whiteboard metadata, and Visual/Source editor behavior
- MCP token management now lives in the account menu only (the header 🔌 button was removed), and the token list shows each token's creation time
- Editor simplified to **Visual** (rendered markdown, images displayed) and **Source** (raw markdown, images shown as URLs); the redundant Preview mode was removed
- Source mode inserts/pastes markdown image references; Visual mode inserts/pastes rendered images
- Editor mode label **Markdown** renamed to **Plain** to avoid confusion with the canonical markdown format
- Runtime image switched from `node:22-alpine` to `node:22-slim` so the glibc `sqlite-vec` loadable extension can be used
- `openDatabase` now opens SQLite with `allowExtension: true` for the vector extension
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
- Whiteboard title edits now persist through the WebSocket session, create a revision, update the gallery, and sync to other open whiteboard editors
- Whiteboard checkpoints/deltas without a freshly generated thumbnail now preserve the last good cover instead of replacing it with the default placeholder
- Opening a note and switching between Visual / Source no longer marks it dirty or prompts to save when nothing was edited; serialisation now runs only after real editor changes
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
