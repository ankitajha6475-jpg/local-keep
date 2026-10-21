## Why

The wishlist's endpoint is an embedded MCP server: anything that can connect can search the notes (with timestamps), inspect revision trees, create/edit notes, and recall whiteboards as multiple page images. The app already has stable note ids, immutable revisions, tags/links, and page manifests; this change exposes them over MCP and lets MCP clients collaborate with the browser.

## What Changes

- Embed an MCP **Streamable HTTP** endpoint at `/mcp` in the existing Express server using the MCP SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`).
- Add bearer tokens (`lk_mcp_...`) stored as SHA-256 hashes in `api_tokens`; tokens carry a name/scopes and become the revision actor (`mcp:<name>`). Session cookies are also accepted for browser-based MCP hosts.
- Accept bearer tokens in the existing REST `checkAuth`, so stdio/REST adapters and MCP writes share the same permission model.
- Add MCP tools:
  - `search_notes`, `list_notes`, `get_note`
  - `create_note`, `edit_note`, `append_to_note`
  - `get_thread`, `get_links`, `get_backlinks`, `get_graph`
  - `list_tags`
  - `get_whiteboard`, `request_whiteboard_render`
  - `list_changes`
  - `archive_note`, `restore_note`, `promote_revision`
- Search results include `created_at`, `updated_at`, `revision_created_at`, `revision_no`, tags, score/snippet, and whiteboard tile/staleness info.
- Thread results include the revision tree and head-chain markers.
- Whiteboard results return ordered text manifest + image content blocks and/or markdown image refs; if stale, optionally ask a connected browser to render and wait.
- Add resources for notes, revisions, threads, backlinks, tags, and whiteboard pages.
- Add token management REST/CLI/UI; add a `mcp-stdio.js` adapter for stdio-only hosts (direct DB or REST facade).
- Add MCP/token/search/thread/whiteboard tests and docs.

## Capabilities

### New Capabilities

- `mcp-server`: Embedded MCP transport/auth, tools, resources, token management, collaboration semantics, and whiteboard page recall.

### Modified Capabilities

<!-- No existing spec covers MCP. Search/tags/links/whiteboard APIs already exist; this change
     reuses them and adds a machine-facing facade. -->

## Impact

- **Database**: add `api_tokens`; migration 003.
- **Server**: token service, MCP auth, `/mcp` mount, shared MCP tools/resources, render request waiter; `express.json` limit.
- **Client**: Settings/token UI; Vite `/mcp` proxy; no note-model change.
- **Dependencies**: `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `zod`; dev `@modelcontextprotocol/client`.
- **Security**: bearer tokens hashed at rest; no anonymous MCP; scope checks; host/origin guidance.
- **Compatibility**: REST/WS unchanged; MCP writes emit the same revision/WS events as the UI.
