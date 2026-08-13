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
- `GET /api/auth/status` and `POST /api/auth/logout` endpoints; `sessions` table for session persistence across server restarts
- Cross-client deletion detection: targeted `{type:'note-deleted'}` broadcast on note deletion; clients editing/viewing the deleted note get an inline overlay (no alert/confirm) offering Save-as / Discard; server rejects further deltas for deleted notes with `{type:'note-gone'}`

### Changed
- Whiteboard delta sync now includes `files` alongside `elements` for image synchronization
- `canvasData` stores file hash references instead of inline base64 after persist
- Moved text-note image insertion button out of the Save/Cancel action row into an editor toolbar above the body
- Text-note editor toolbar now also includes Bold / Italic / Link / Checkbox formatting actions; bold/italic/link/checkbox markdown is rendered in the gallery preview as well
- Notes can be saved with title only (no body required); gallery/list/headers now derive a display title from leading content when a note has no explicit title
- Whiteboard file storage now preserves Excalidraw's required `dataURL`/`id`/`created` alongside the content hash (was discarding them, leaving images unable to render)
- Whiteboard touch handling now allows single-finger pan in drawing tools while keeping stylus input free, instead of requiring a two-finger gesture to switch to hand mode

### Fixed
- Pasted/inserted whiteboard images now render correctly on all clients and on reload (server no longer strips Excalidraw's required dataURL; sender excluded from its own delta echo)
- Legacy whiteboard entries stored without `dataURL` are hydrated from disk on next load

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
