# Local Keep MCP Server

Local Keep embeds an MCP server so any MCP-capable client can search, read, create,
edit, inspect revision threads, and recall whiteboards as ordered page images.

The MCP server shares the same service layer, SQLite data, revision/branch rules, tags,
links, and whiteboard render manifests as the web UI. MCP edits appear in the browser via
the existing WebSocket events.

## Endpoint

- Streamable HTTP: `http://localhost:5173/mcp` (direct backend)
- Browser MCP hosts can use the HTTPS Vite origin: `https://192.168.3.222:5174/mcp`
- Transport: MCP SDK v2, Streamable HTTP (`POST`, `Accept: application/json, text/event-stream`)
- Auth: `Authorization: Bearer lk_mcp_...` or a valid browser session cookie
- No anonymous access

## Create a token

Web UI: click the 🔌 button in the header, enter a name, create, copy the token once.

CLI:

```bash
npm run mcp:token -- create "Claude Desktop"
# prints lk_mcp_... once
npm run mcp:token -- list
npm run mcp:token -- revoke <id>
```

Tokens are stored as SHA-256 hashes; the raw value is never shown again. The token name
becomes the revision actor (`mcp:<name>`). Tokens default to `read,write`; `read`-only
tokens can read but cannot mutate.

## Client configuration

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

If the app is served through Vite, `https://192.168.3.222:5174/mcp` also works (same
certificate as the UI; see `docs/https.md`). Direct `http://localhost:5173/mcp` stays
HTTP for local MCP clients such as OpenCode.

stdio-only hosts:

```json
{
  "mcpServers": {
    "local-keep": {
      "command": "node",
      "args": ["/app/mcp-stdio.js"],
      "env": {
        "LOCAL_KEEP_DATA_DIR": "/app/data",
        "LOCAL_KEEP_PUBLIC_URL": "http://localhost:5173"
      }
    }
  }
}
```

The stdio adapter opens SQLite directly (WAL). Prefer HTTP when the app server is running:
stdio writes cannot push WebSocket events to an open browser. There is no token check for
stdio because it runs as a local process with direct database access.

## Tools

| Tool | What it does |
|---|---|
| `search_notes` | Full-text or semantic/hybrid search (`mode`), tag/type/date filters; returns timestamps, revision, tags, links, whiteboard render info |
| `semantic_search` | Vector similarity search using the admin-configured embedding model |
| `list_notes` | Same summary shape without a query |
| `get_note` | Markdown, metadata, optional history/links/backlinks, whiteboard summary |
| `create_note` | Create revision 1; accepts tags and related note ids |
| `edit_note` | New revision; `base_revision_id`; modes `append` (default), `branch`, `take_head` |
| `append_to_note` | Append markdown as a new revision |
| `get_thread` | Revision tree / head-chain markers; `format: "text"` for ASCII |
| `get_links` / `get_backlinks` | Outgoing/incoming relationships with context |
| `get_graph` | Relationship graph; neighbourhood via `note_id` + `depth` |
| `list_tags` | Hierarchical tag tree with unique-note counts |
| `get_whiteboard` | Ordered pages as image blocks, markdown image refs, URLs, or manifest |
| `request_whiteboard_render` | Ask a connected browser to render pages; waits with timeout |
| `list_changes` | Lifecycle events since an ISO timestamp |
| `archive_note` / `restore_note` | Archive retention / restore |
| `promote_revision` | Promote a branch into a new head revision |

### Search timestamps

Every search hit includes:

```json
{
  "note_id": "...",
  "revision_id": "...",
  "title": "...",
  "display_title": "...",
  "type": "text",
  "snippet": "...",
  "tags": ["project/local-keep"],
  "created_at": "2026-10-01T10:00:00.000Z",
  "updated_at": "2026-10-21T09:00:00.000Z",
  "revision_created_at": "2026-10-21T09:00:00.000Z",
  "revision_no": 2,
  "score": -1.2,
  "link_count": 1,
  "backlink_count": 2
}
```

Canvas hits also include `tile_count`, `rendered_at`, and `stale`.

### Semantic search

Semantic search is optional and configured by an admin (avatar → **✨ Semantic
search**). It uses any OpenAI-compatible `/embeddings` API; see
[`docs/embeddings.md`](embeddings.md).

```json
{ "name": "search_notes", "arguments": { "query": "how did I set up the local proxy", "mode": "hybrid" } }
```

`mode` is `keyword` (default), `semantic`, or `hybrid`. The dedicated
`semantic_search` tool is equivalent to `mode: "semantic"`. Results include
`semantic_score` and `chunk_index` when applicable. If an admin enables the optional
reranker, results also include `rerank_score` and a `rerank` metadata block. Rerank
failure degrades to vector order instead of failing the search. If embeddings are not
configured, semantic tools return a clear error; hybrid falls back to keyword with a
notice.

### Threads and edit notices

`get_thread` returns flat revisions plus a tree; `onHeadChain` marks the current chain.
`edit_note` returns:

```json
{
  "note": { "id": "stable-note-id", "revisionNo": 3, "...": "..." },
  "revision": { "id": "new-revision-id", "revisionNo": 3, "...": "..." },
  "previous_revision": { "id": "...", "revisionNo": 2 },
  "conflict": false,
  "notice": "Saved revision 3; revision 2 kept.",
  "history_url": "http://localhost:5173/#/note/<id>/history"
}
```

If `base_revision_id` is stale, the default is to keep the edit as a **branch** and leave
the head unchanged. Use `mode: "take_head"` only when you intentionally want to replace
the head. The note id never changes.

### Whiteboard images

`get_whiteboard` default format is `images`:

- a text block with `tile_count`, `rendered_at`, `stale`, and page URLs;
- up to `max_tiles` (default 4, max 20) `image` blocks in page order (base64 PNG).

`format: "markdown"` returns ordered markdown image refs under a `# Whiteboard (N pages)`
heading. `format: "urls"`/`"manifest"` return JSON.

If the head canvas changed since the last render, `stale` is true. Pass
`render_if_stale: true` to ask an open browser to render; if no browser is connected, the
tool returns the stale manifest with a notice rather than failing. `request_whiteboard_render`
does the same with an explicit timeout.

## Resources

```
local-keep://notes/{noteId}                         current markdown
local-keep://notes/{noteId}/revisions/{revisionId}  historical markdown
local-keep://notes/{noteId}/thread                  revision tree JSON
local-keep://notes/{noteId}/backlinks               backlinks JSON
local-keep://tags                                   tag tree JSON
local-keep://whiteboards/{noteId}/pages/{page}      image/png (1-based page)
```

## Security

- Tokens are hashed at rest and can be revoked immediately.
- The MCP endpoint is protected by bearer token/session auth; do not expose port 5173 to
  the public internet without a reverse proxy/TLS.
- If binding to a LAN interface, set `LOCAL_KEEP_PUBLIC_URL` for generated markdown URLs
  and consider restricting hosts/origins at the proxy.
- `express.json` accepts up to 10 MB; whiteboard image responses are capped by `max_tiles`.
- MCP write tools require a `write` scope; read-only tokens cannot mutate.

## Troubleshooting

- **401 Unauthorized**: check the `Authorization: Bearer lk_mcp_...` header and that the
  token is not revoked.
- **No tools / connection error**: use `http://localhost:5173/mcp`, not the Vite page URL,
  and include `Accept: application/json, text/event-stream`.
- **Whiteboard has no images**: open the board in the browser and click Pages → Render now,
  or call `get_whiteboard` with `render_if_stale: true` while a browser is open.
- **stdio sees an older state**: it reads SQLite directly; refresh/restart the HTTP server
  or prefer the HTTP endpoint for live collaboration.
