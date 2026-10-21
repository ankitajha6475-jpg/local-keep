## Context

See `proposal.md` and `specs/mcp-server/spec.md`. The service layer now exposes notes/revisions/tags/links/renders; the REST/WS API and event bus are the collaboration path. MCP SDK v2 (`@modelcontextprotocol/server` 2.x) is the current stable line and replaces the v1 `@modelcontextprotocol/sdk` transport wiring.

## Goals / Non-Goals

**Goals:**

- One embedded `/mcp` endpoint over the existing Express/HTTP server.
- Tool/resource access to all implemented note capabilities, with timestamps and thread trees.
- Token auth with named actors, revocation, and REST parity.
- Whiteboard page recall as ordered images/markdown.
- MCP writes and browser sessions collaborate through the same revision/branch rules.

**Non-Goals:**

- OAuth/authorization-server flows; local bearer tokens are sufficient.
- Per-note permissions or multi-user accounts.
- Server-side whiteboard rendering; MCP asks a connected browser instead.
- Streaming collaborative text editing.

## Decisions

### D1: MCP SDK v2 with Streamable HTTP

Use `createMcpHandler(factory)` + `toNodeHandler(handler)` and mount `app.all('/mcp', mcpAuth, ...)`. The factory runs per request and receives `authInfo`; services are module-scope. Pass the parsed Express body to `toNodeHandler` so it does not re-read the stream. Mount before the production `app.get('*')` fallback. Add `/mcp` to the Vite proxy.

**Alternatives:** v1 `@modelcontextprotocol/sdk` (older spec; not chosen); stdio-only (does not satisfy "anything that can connect").

### D2: Bearer tokens become first-class REST auth

`api_tokens(id,name,token_hash,scopes,created_at,last_used_at,revoked_at)`. Tokens are `lk_mcp_<random>`; only the SHA-256 hash is stored; the raw value is returned once. `checkAuth` and `mcpAuth` accept bearer or cookie/session. A token maps to `req.actor = 'mcp:<name>'` and `req.auth = {clientId, scopes}`. Tokens default to `read,write`; mutation tools check `write`.

### D3: Tool layer calls services, not HTTP

`src/mcp/createServer.js` registers tools over the same `notes/revisions/tags/links/renders` services. REST and MCP therefore share tags/link rebuilds, image refs, events, and revision semantics. The MCP factory receives `{services, authInfo, baseUrl, requestRender}`.

### D4: Search service shared by REST/MCP

Extract search/list queries into `src/server/services/search.js`. It uses FTS5 for text, SQL/JS filters for tags/type/dates/archive, and enriches results with tags, link/backlink counts, and render summary. Timestamps are ISO strings plus `revision_created_at`. If `query` is empty, it delegates to the note list with filters. REST `/api/search` can keep its ID-array contract for the UI, while MCP uses the rich service.

### D5: Revisions/threads are exposed as versions, not new note ids

`get_note` defaults to the head; `revision_id` returns a historical snapshot. `edit_note` returns `notice`, `previous_revision`, `conflict`, `history_url`; the note id remains stable. `get_thread` returns both flat revisions and a tree with `onHeadChain`. This directly encodes the user's identity requirement.

### D6: Whiteboard pages are formatted for agents

`get_whiteboard` reads `renderService.latest`. Formats:

- `images` (default): text manifest + up to `max_tiles` image content blocks (base64 PNG) in page order.
- `markdown`: ordered `![Whiteboard page N](<baseUrl>/api/images/...)` with a header.
- `urls`: JSON URLs/manifest.
- `manifest`: JSON only.

If `render_if_stale` and stale, call `requestRender(noteId, timeout)`; the server sends WS `render-request` to open sessions and resolves on the `render.updated` event carrying the request id. If no browser/timeout, return the stale manifest with `requested:false`. Never synthesize images server-side.

### D7: MCP resources mirror the tool data

Templates: note markdown, revision markdown, thread JSON, backlinks JSON, tags JSON, whiteboard page image blob. Read callbacks use the services; image resources use `imageStore.readImageBuffer`. `list` callbacks for notes/tags are optional; templates are readable without enumeration.

### D8: Change feed from `note_events`

`list_changes(since, limit)` reads `note_events` ordered by `created_at`; returns event type/actor/note/revision/payload. This is the polling fallback for clients without subscriptions. No new event table.

### D9: stdio adapter

`mcp-stdio.js` builds the same MCP server over direct services using `openDatabase` + migrations + WAL, with `authInfo.clientId='mcp:stdio'` and a no-op render requester. Document that the HTTP endpoint is preferred because stdio writes cannot push WS events to a running browser. (If needed later, swap in a REST facade; tools are already service-shaped.)

### D10: Security

- No anonymous MCP; missing/invalid token → 401.
- Hash tokens; never log raw values.
- Cap MCP input size (`express.json({limit:'10mb'})`, `maxToolInputElements`), tile count/bytes.
- Host/Origin: bearer auth is the boundary; document `LOCAL_KEEP_ALLOWED_HOSTS/ORIGINS` for LAN/browser hosts.
- Revocation is immediate (DB check per request).
- `last_used_at` updated at most once per minute.

## Risks / Trade-offs

- **MCP SDK API drift** → pin v2 versions and test `tools/list`/`tools/call` end to end.
- **Large image responses** → `max_tiles` default 4, cap 20; text manifest always included; URLs allow fetching the rest.
- **No browser for stale renders** → return stale with notice; `request_whiteboard_render` documents timeout.
- **Token leakage** → show once, hash at rest, revoke UI/CLI, no logs.
- **Concurrent MCP/browser edits** → existing branch semantics; actor/notice visible.
- **Stdio dual writer** → WAL + busy timeout; document HTTP as preferred.
- **Search performance** → FTS + indexes; cap results; enrich only the page.

## Migration Plan

1. Add `api_tokens` via migration 003 (backup + transaction).
2. Add token service/REST/CLI/UI.
3. Mount `/mcp` and Vite proxy; restart.
4. Create a token, run `tools/list` and a smoke `search_notes`/`get_thread`.
5. Rollback: unmount `/mcp`, revoke tokens; no note data changed.

## Open Questions

None blocking. OAuth and subscriptions can be added later without changing tool semantics.
