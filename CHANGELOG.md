# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
