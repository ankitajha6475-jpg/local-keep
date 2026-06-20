# Local Keep

A Google Keep-like notes app with text notes and Excalidraw whiteboard canvas. Vue 3 frontend, Express+SQLite backend, WebSocket real-time sync.

## Features

- Text notes with title and content
- Excalidraw whiteboard canvas with stylus/finger touch support
- Real-time sync across multiple tabs/devices via WebSocket
- Full-text search (FTS5) across notes and canvas text
- Password protection with first-time setup
- Auto-save with debounced persistence

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
- `notes` — note content, canvas data, thumbnails
- `notes_fts` — FTS5 index for full-text search

## Tech Stack

- Vue 3, React 18 (Excalidraw only), @excalidraw/excalidraw 0.18
- Express, ws, node:sqlite
- Vite 5

See [AGENTS.md](AGENTS.md) for detailed architecture, patterns, and conventions.
