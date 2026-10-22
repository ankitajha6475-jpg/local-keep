## Why

Recent runtime features were implemented directly, without OpenSpec deltas: live text collaboration, semantic search, the Visual/Source editor and Mermaid, stable MCP sessions with multiple write leases, and whiteboard title/cover persistence. The archived OpenSpec set stops at the first MCP release, so the main specs no longer describe the shipped behavior and cannot guide the next changes.

## What Changes

- Retrofit the behavior contracts for the features shipped since the last OpenSpec archive.
- Update `mcp-server` for stable `get_note_state`/`note_session` tools, per-token multiple write sessions (default 5), read sessions, admin-configurable limits, token scopes/expiry, and human-admin token rules.
- Update `markdown-editor` for Visual/Source modes, dirty-only serialisation, Mermaid rendering, and paste/image behavior.
- Add `live-text-collab` for Yjs shared drafts, presence, explicit save, reset/discard, and remote caret handling.
- Add `semantic-search` for admin-configured embeddings, model/dimension partitions, background indexing, hybrid search, and optional reranking.
- Add `whiteboard-metadata` for WebSocket title persistence, gallery/other-editor title sync, and cover preservation.
- No runtime behavior changes; this change aligns specs with code and tests.

## Capabilities

### New Capabilities

- `live-text-collab`: Shared Yjs text drafts, live presence, explicit revision saves, conflict/branch behavior, and draft reset/discard.
- `semantic-search`: Optional admin-configured embeddings, index freshness, model/dimension isolation, hybrid search, and optional reranking.
- `whiteboard-metadata`: Persistent whiteboard titles and stable gallery covers across checkpoints and format changes.

### Modified Capabilities

- `markdown-editor`: Visual/Source editing, Mermaid, paste conversion, image handling, and dirty-state rules.
- `mcp-server`: Stable persistent sessions, multiple write leases, admin tokens, token scopes/expiry, and admin-configurable session limits.

## Impact

- **Specs**: five capability specs under `openspec/specs/`; no schema or runtime changes.
- **Code reference**: `server.js`, `src/App.vue`, `src/components/WhiteboardEditor.vue`, `src/collab/*`, `src/mcp/createServer.js`, `src/server/services/*`, `src/server/migrations/*`.
- **Tests**: existing API, MCP, collaboration, whiteboard, embedding, migration, and admin-token suites are the acceptance evidence.
- **Compatibility**: no API, database, or client changes; behavior is recorded as already shipped.
