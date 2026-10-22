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

## Tokens

Create tokens from the 🔌 button in the header (human admins), `/api/mcp/tokens`, or the CLI:

```bash
npm run mcp:token -- create "Claude Desktop"
npm run mcp:token -- create "Claude Desktop" read,write
npm run mcp:token -- create "Claude Desktop" read,write 30   # optional expiry in days
npm run mcp:token -- create "Admin" read,write,admin
npm run mcp:token -- list
npm run mcp:token -- revoke <id>
```

Tokens are stored as SHA-256 hashes; the raw value is shown once. Token names become
revision actors (`mcp:<name>`), but session state is keyed by the token id, so two tokens
with the same display name never share a session.

Scopes:

- `read`: read/search tools and read-only sessions
- `write`: create/edit/archive and write sessions
- `admin`: admin API access and token management

A token with `write` can read. An admin token normally has `read,write,admin`.

Human admins and admin-scoped tokens can manage client tokens. Only a human admin session
can mint another admin token; an admin token cannot clone itself. Client tokens cannot
list or mint tokens. The CLI is a local trusted path and can create any scope. Tokens may
have an optional expiry date.

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
| `list_notes` | Same summary shape without a query; `include_archived` adds `archived_at` and `is_archived` |
| `get_note` | Markdown, metadata, optional history/links/backlinks, whiteboard summary. Canvas payloads are omitted unless `include_canvas: true` |
| `create_note` | Create revision 1; accepts tags and related note ids |
| `edit_note` | One-shot edit; commits a revision. Accepts `tags`, `message`, and `include_content`. `commit_mode` controls stale-base behavior (`append`, `branch`, `take_head`) |
| `append_to_note` | One-shot append as a new revision. Accepts `tags`, `message`, and `include_content`; normalizes trailing/leading blank lines |
| `add_tags` / `remove_tags` | Add or remove exact inline tags on one or more notes. Supports `dry_run`; returns compact per-note results |
| `purge_note` | Permanently delete one archived note, its revisions, and image refs. Requires `confirm: true`; previews without it |
| `purge_archived` | Preview or permanently delete archived notes. Bulk purge requires `expected_count`; supports an explicit `note_ids` subset |
| `get_note_state` | Always available; return the token's write/read sessions, allowed actions, and next-step guide |
| `note_session` | Always available; open/read/edit/save/close persistent sessions |
| `get_thread` | Revision tree / head-chain markers; `format: "text"` for ASCII |
| `get_links` / `get_backlinks` | Outgoing/incoming relationships with context |
| `get_graph` | Relationship graph; neighbourhood via `note_id` + `depth` |
| `list_tags` | Hierarchical tag tree with unique-note counts |
| `get_whiteboard` | Ordered pages as image blocks, markdown image refs, URLs, or manifest |
| `request_whiteboard_render` | Ask a connected browser to render pages; waits with timeout |
| `list_changes` | Lifecycle events since an ISO timestamp |
| `archive_note` / `restore_note` | Archive retention / restore |
| `promote_revision` | Promote a branch into a new head revision |

The tool list is **stable**: opening or closing a session never adds or removes tools.
State is returned as data, so Code Mode and clients with cached tool catalogs do not need
to rely on `tools/list_changed`.

### Result envelope

Session and mutation results include:

```json
{
  "state": {
    "write": null,
    "writes": [],
    "reads": [],
    "limits": {
      "max_write_sessions": 5,
      "max_read_sessions": 8
    }
  },
  "allowed_actions": ["open_read", "open_write"],
  "guide": "No session is open for this token. Use note_session action=open_write to edit or action=open_read to read."
}
```

A session has this shape:

```json
{
  "session_id": "uuid",
  "mode": "read",
  "note_id": "stable-note-id",
  "base_revision_id": "revision-id",
  "revision_no": 3,
  "version": "sha256-of-title-and-draft",
  "expires_at": "2026-10-21T10:30:00.000Z",
  "dirty": false
}
```

`state.writes` holds up to the configured write-session limit (default **5**);
`state.reads` holds up to the configured read limit (default **8**). `state.write` remains
as the first write session for older clients. `state.limits` reports the active limits.
`get_note_state` returns the full state; session/mutation tools include the same block.
Plain list/text tools keep their native array/text shape so existing clients can still
parse them.

Admins change the limits in **avatar → 🔌 MCP access → Session limits**. Values are stored
in SQLite (`mcp_settings`) and apply to newly opened sessions without a restart.

Errors use the same envelope plus `ok: false` and a structured error:

```json
{
  "ok": false,
  "error": {
    "code": "too_many_writes",
    "message": "This MCP token already has 5 write sessions open"
  },
  "state": {
    "write": { "session_id": "sess_A", "note_id": "note_A", "...": "..." },
    "writes": [{ "session_id": "sess_A", "note_id": "note_A", "...": "..." }],
    "reads": [],
    "limits": { "max_write_sessions": 5, "max_read_sessions": 8 }
  },
  "allowed_actions": ["read", "save", "close"],
  "guide": "Save or close one of the open write sessions with note_session action=close before opening another note."
}
```

Common error codes: `too_many_writes`, `too_many_reads`,
`session_mode_mismatch`, `session_not_found`, `session_id_required`, `stale_version`,
`note_archived`, `ttl_expired`, `forbidden`.

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
  "archived_at": null,
  "is_archived": false,
  "revision_created_at": "2026-10-21T09:00:00.000Z",
  "revision_no": 2,
  "score": -1.2,
  "link_count": 1,
  "backlink_count": 2
}
```

Canvas hits also include `tile_count`, `rendered_at`, and `stale`. When
`include_archived: true` is used, archived rows carry their `archived_at` timestamp
and `is_archived: true`; no separate archived-only query is needed.

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
`edit_note` and `append_to_note` return compact metadata by default:

```json
{
  "note": { "id": "stable-note-id", "revisionNo": 3, "tags": ["project"], "contentLength": 128 },
  "revision": { "id": "new-revision-id", "revisionNo": 3, "message": "..." },
  "previous_revision": { "id": "...", "revisionNo": 2 },
  "conflict": false,
  "notice": "Saved revision 3; revision 2 kept.",
  "history_url": "http://localhost:5173/#/note/<id>/history",
  "state": { "write": null, "reads": [] },
  "allowed_actions": ["open_read", "open_write"],
  "guide": "No session is open for this token. ..."
}
```

Pass `include_content: true` to return the full note and revision bodies. `get_note`
still returns markdown; for canvas notes it omits `canvasData`/`thumbnail` unless
`include_canvas: true` (use `get_whiteboard` for page recall).

If `base_revision_id` is stale, the default is to keep the edit as a **branch** and leave
the head unchanged. Use `commit_mode: "take_head"` only when you intentionally want to
replace the head. The note id never changes.

### Tags

Tags are inline markdown (`#area/project`). `add_tags` and `remove_tags` operate on one
or more notes and create one revision per changed note:

```json
{
  "name": "add_tags",
  "arguments": {
    "note_ids": ["note-a", "note-b"],
    "tags": ["project/local", "#mcp"],
    "dry_run": true
  }
}
```

The result is a compact per-note list with `added`/`removed`, the current `tags`, revision
number, and `conflict`. Use `dry_run: true` first for bulk changes. Archived notes are
skipped with `skipped: "note_archived"`; call `restore_note` first. `edit_note` and
`append_to_note` also accept `tags` for combined edits.

### Archived cleanup and permanent deletion

`purge_note` permanently deletes **one archived note**. Without `confirm: true` it returns
a preview. Optionally pass `expected_title` as a guard:

```json
{ "name": "purge_note", "arguments": { "note_id": "note-a", "expected_title": "Old note" } }
```

`purge_archived` previews/deletes archived notes. Purging all archived notes requires an
`expected_count` from the preview; passing an explicit `note_ids` subset does not:

```json
{ "name": "purge_archived", "arguments": {} }
{ "name": "purge_archived", "arguments": { "confirm": true, "expected_count": 16 } }
```

`archive_note` is reversible; `purge_note`/`purge_archived` are not. Write sessions must be
closed first, and active notes are never purged by these tools. A write session opened on
an archived note fails with `note_archived` (not `note_not_found`).

## Persistent sessions

`get_note_state` is always available and is the authoritative source of session state.
`edit_note` is one-shot only; use `note_session` for persistent work. While a write
session is open, `edit_note`/`append_to_note` return `active_write_session`; use
`note_session` or close the session first.

```json
{ "name": "get_note_state", "arguments": {} }
```

```json
{
  "name": "note_session",
  "arguments": {
    "action": "open_write",
    "note_id": "stable-note-id"
  }
}
```

Open write returns the shared draft plus state:

```json
{
  "session": {
    "session_id": "...",
    "mode": "write",
    "note_id": "...",
    "version": "...",
    "expires_at": "..."
  },
  "snapshot": {
    "title": "Draft",
    "content": "hello",
    "line_count": 1
  },
  "mode": "write",
  "state": {
    "write": { "...": "..." },
    "writes": [{ "...": "..." }],
    "reads": [],
    "limits": { "max_write_sessions": 5, "max_read_sessions": 8 }
  },
  "allowed_actions": ["read", "replace", "insert", "delete", "append", "set_title", "save", "close", "open_read", "open_write"],
  "guide": "Write session ... is open. Use note_session ... then action=save or action=close."
}
```

### Session rules

- A token may hold up to `max_write_sessions` write sessions (default **5**) and up to
  `max_read_sessions` read sessions (default **8**). Admins configure both limits; the
  defaults can be raised for multiple sub-agents sharing one token.
- One session per note per mode. Opening the same write/read note again is idempotent.
- Opening another write note after the write limit is reached returns
  `too_many_writes` with the open sessions and a guide to save/close one first.
- Multiple write sessions on different notes are supported; each operation identifies
  its session with `session_id`.
- Opening write on a note that already has a read session upgrades it
  (`upgraded_from_read: true`).
- Opening read on a note that already has a write session returns the write session with
  `read_included: true`.
- Read sessions can read; only write sessions can replace/insert/delete/append/set_title/save.
  A write session can also read.
- Sessions expire after `LOCAL_KEEP_MCP_EDIT_TTL_MS` (default 30 minutes). Every session
  action refreshes its lease.
- Sessions are advisory and never lock other tokens out. Use `expected_version` to detect
  concurrent browser/other-token edits.

### Actions

| Action | Required session | What it does |
|---|---|---|
| `open_read` | none | Open a read session for `note_id` |
| `open_write` | none | Open a write session for `note_id` (up to the configured limit) |
| `read` | read or write | Return title, content, line count, version, and state |
| `replace` | write | Replace exact `old_text` with `new_text`; unique match unless `replace_all` |
| `insert` | write | Insert at a 1-based line; `line_count + 1` appends |
| `delete` | write | Delete exact text or an inclusive line range |
| `append` | write | Append markdown |
| `set_title` | write | Change the draft title |
| `save` | write | Commit the draft as a revision; the session stays open |
| `close` | read or write | Release the session; reports `draft_kept` from the persisted draft state. For a write session, `discard: true` deletes the draft only when this is the last editor |
| `status` | none | Alias for `get_note_state` |

All mutation actions accept `expected_version`. If the shared draft changed, the tool
returns `stale_version` with the latest content and version. Re-read with the same
`session_id`, then retry; the server does not auto-retry.

Edits go to the same Yjs `note_text_docs` draft used by the browser, so open browsers see
MCP edits live. `note_session action=save` creates a normal revision with source
`mcp-open`; a stale base still creates a branch.

`close` releases the session but keeps a dirty draft by default. `discard: true` removes
it only if no browser or other MCP session is still editing the note. After a `save`, the
clean draft is cleaned up and `close` reports `draft_kept: false` rather than treating
“not explicitly discarded” as a kept draft.

### Example: write-session limit reached

```json
{
  "name": "note_session",
  "arguments": {
    "action": "open_write",
    "note_id": "note_B"
  }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "too_many_writes",
    "message": "This MCP token already has 5 write sessions open"
  },
  "state": {
    "write": { "session_id": "sess_A", "note_id": "note_A" },
    "writes": [{ "session_id": "sess_A", "note_id": "note_A" }],
    "reads": [],
    "limits": { "max_write_sessions": 5, "max_read_sessions": 8 }
  },
  "allowed_actions": ["read", "save", "close"],
  "guide": "Save or close one of the open write sessions with note_session action=close before opening another note."
}
```

## Presence

An open MCP session appears in the browser dashboard presence count. The label includes
the token name and session mode, e.g. `MCP (Claude Desktop · write)` or
`MCP (Claude Desktop · read)`. TTL expiry, `note_session action=close`, archive,
restore, purge, and token revocation all remove it.

## Whiteboard images

`get_whiteboard` default format is `images`:

- a text block with `tile_count`, `rendered_at`, `stale`, page URLs, state, and guide;
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
```
