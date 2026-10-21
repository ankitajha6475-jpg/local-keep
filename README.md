# Local Keep

A Google Keep-like notes app with text notes and Excalidraw whiteboard canvas. Vue 3 frontend, Express+SQLite backend, WebSocket real-time sync.

## Features

- Text notes with title and content
- Immutable revision history: every committed edit is a new version under the same note id
- Stable document identity while editing; stale concurrent edits are kept as branches
- Revision history drawer with view, restore, and promote; archive by default with restore
- Wiki-link relationships (`[[Note]]`), backlinks, and an interactive relationship graph
- Hierarchical tags (`#area/project/topic`) with a tag tree, counts, and filtering
- Markdown Write / Markdown / Preview modes; rich-paste sanitisation and markdown image refs
- Whiteboard page rendering: ordered page images (left→right, top→bottom) with a Pages drawer
- Embedded MCP server: search with timestamps, revision threads, links/tags/graph, and whiteboard recall as multiple images
- MCP token management via the 🔌 header dialog or `npm run mcp:token`
- Excalidraw whiteboard canvas with stylus/finger touch support
- Real-time sync across multiple tabs/devices via WebSocket
- Full-text search (FTS5) across notes and canvas text
- Password protection with first-time setup
- Auto-save with debounced persistence
- Whiteboard checkpoints (leave/manual/interval) create canvas revisions

## Quick Start

```bash
docker compose up -d
```

Access at `http://localhost:5174` (Vite dev server with HMR).

## Development

Both frontend and backend auto-reload:
- **Frontend**: Vite HMR (instant on save)
- **Backend**: `node --watch` (auto-restart on `server.js` changes)

```bash
docker compose up -d          # start
docker logs -f local-keep     # watch logs
docker restart local-keep     # full restart (dependency changes only)
npm test                      # node:test suite (migration, revisions, API, WS)
npm run build                 # production build
```

## Architecture

```
Docker "local-keep" (node:22-alpine)
├── node --watch server.js    → Express + WS on :5173
└── npx vite --host 0.0.0.0   → Vite dev server on :5174
```

Vite proxies `/api/*` and `/ws` to the Express backend. Browser connects to `:5174`.

## Data Storage

SQLite database in `data/local-keep.db` with tables:
- `notes` — head note content, canvas data, thumbnails, revision pointer
- `note_revisions` — immutable history snapshots (text and lean canvas scenes)
- `note_events` — lifecycle events (created/revised/branched/checkpoint/archived)
- `notes_fts` — FTS5 index for full-text search
- `image_refs` / `revision_image_refs` — image usage by heads and old versions
- `whiteboard_renders` / `whiteboard_tiles` — legacy thumbnail page and future page renders

Pre-migration backups live in `data/backups/`. Deletion archives by default; use
`?purge=1` for permanent deletion.

## Tech Stack

- Vue 3, React 18 (Excalidraw only), @excalidraw/excalidraw 0.18
- Express, ws, node:sqlite
- Vite 5

See [AGENTS.md](AGENTS.md) for detailed architecture, patterns, and conventions.
