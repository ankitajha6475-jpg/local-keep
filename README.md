# Local Keep

A Google Keep-like notes app with text notes and Excalidraw whiteboard canvas. Vue 3 frontend, Express+SQLite backend, WebSocket real-time sync.

## Features

- Text notes with title and content
- Immutable revision history: every committed edit is a new version under the same note id
- Stable document identity while editing; stale concurrent edits are kept as branches
- Revision history drawer with view, restore, and promote; archive by default with restore
- Wiki-link relationships (`[[Note]]`), backlinks, and an interactive relationship graph
- Hierarchical tags (`#area/project/topic`) with a tag tree, counts, and filtering
- Two editor modes: **Visual** (rendered markdown, images and Mermaid diagrams displayed) and **Source** (raw markdown, images shown as URLs); rich-paste sanitisation and markdown image refs
- Whiteboard page rendering: ordered page images (left→right, top→bottom) with a Pages drawer
- Embedded MCP server: search with timestamps, revision threads, links/tags/graph, and whiteboard recall as multiple images
- Persistent MCP sessions: stable `get_note_state`/`note_session` tools, multiple write sessions (default 5, admin-configurable) plus read sessions per token, explicit state/guide on session and mutation results, and `expected_version` conflict detection
- MCP token management via the 🔌 header dialog or `npm run mcp:token`
- Excalidraw whiteboard canvas with stylus/finger touch support
- Real-time sync across multiple tabs/devices via WebSocket, including character-level live text collaboration on a shared draft
- Full-text search (FTS5) across notes and canvas text
- Multi-user accounts with admin/member roles, scrypt passwords, and 30-day signed sessions
- Admin user management and password reset (UI or `npm run auth:reset`)
- HTTPS using the shared local mkcert certificate
- Optional semantic search with OpenAI-compatible embeddings (SiliconFlow/OpenAI), admin-configured and per-model vector tables via `sqlite-vec`
- Hybrid keyword + vector search in MCP, REST (`/api/search/semantic`, `/api/search/hybrid`), and the UI search toggle
- Optional admin-configured rerank (`BAAI/bge-reranker-v2-m3` etc.); vector search works without it
- Mermaid fenced diagrams rendered lazily in Visual/gallery; Source shows the diagram code
- Shared live text drafts with explicit Save-to-revision semantics; Yjs CRDT merge and reconnect recovery
- Presence dots on dashboard cards while a text note, whiteboard, or MCP edit session holds the note open
- Auto-save with debounced persistence
- Whiteboard checkpoints (leave/manual/interval) create canvas revisions

## Quick Start

```bash
docker compose up -d
```

Access at **https://192.168.3.222:5174** (Vite dev server with HMR).
The certificate SAN is the LAN IP, not `localhost`; see [docs/https.md](docs/https.md).

Existing installs keep working: migration 4 creates an `admin` / `Administrator`
account from the old single password. See [docs/auth.md](docs/auth.md).

## Development

Both frontend and backend auto-reload:
- **Frontend**: Vite HMR (instant on save)
- **Backend**: `node --watch` (auto-restart on `server.js` changes)

```bash
docker compose up -d          # start
docker logs -f local-keep     # watch logs
docker restart local-keep     # full restart (dependency changes only)
npm test                      # node:test suite (migration, revisions, auth, API, WS, MCP)
npm run build                 # production build
npm run auth:reset -- <user>  # reset an account password (prints temp password)
```

## Architecture

```
Docker "local-keep" (node:22-slim)
├── node --watch server.js    → Express + WS on :5173
└── npx vite --host 0.0.0.0   → Vite dev server on :5174
```

Vite serves HTTPS on `:5174` and proxies `/api`, `/mcp`, and `/ws` to the HTTP
Express backend on `:5173`. Browser connects to the HTTPS origin.

The image is Debian slim (not Alpine) because `sqlite-vec` ships a glibc loadable
extension; `node:sqlite` loads it with `allowExtension: true`.

## Data Storage

SQLite database in `data/local-keep.db` with tables:
- `notes` — head note content, canvas data, thumbnails, revision pointer
- `note_revisions` — immutable history snapshots (text and lean canvas scenes)
- `note_events` — lifecycle events (created/revised/branched/checkpoint/archived)
- `notes_fts` — FTS5 index for full-text search
- `image_refs` / `revision_image_refs` — image usage by heads and old versions
- `whiteboard_renders` / `whiteboard_tiles` — legacy thumbnail page and future page renders
- `users` — human accounts (username, display name, scrypt hash, role, disabled state)
- `sessions` — signed session IDs mapped to users, with expiry
- `embedding_settings` / `embedding_models` / `embedding_index_state` — admin embedding config and per-model indexing state
- `embedding_chunks_emb_<hash>` / `embedding_vec_emb_<hash>` — per-model chunk metadata and `sqlite-vec` vectors

Pre-migration backups live in `data/backups/`. Deletion archives by default; use
`?purge=1` for permanent deletion.

## Tech Stack

- Vue 3, React 18 (Excalidraw only), @excalidraw/excalidraw 0.18
- Express, ws, node:sqlite
- sqlite-vec for cosine vector indexes
- Vite 5

See [AGENTS.md](AGENTS.md) for detailed architecture, patterns, and conventions.

User guides:

- [docs/https.md](docs/https.md) — certificate and TLS setup
- [docs/auth.md](docs/auth.md) — accounts, roles, and password reset
- [docs/mcp.md](docs/mcp.md) — MCP endpoint, tokens, tools, and whiteboard recall
- [docs/embeddings.md](docs/embeddings.md) — semantic search, embeddings, model partitioning, and indexing
