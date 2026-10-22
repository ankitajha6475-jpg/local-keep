## Why

The MCP interface can read and edit notes, but browser users and agents cannot add or remove tags directly, and archived notes cannot be permanently deleted at all. The experiment also exposed avoidable friction: archived rows are not distinguishable in list/search summaries, archived write attempts masquerade as `note_not_found`, mutation results return full note bodies (and whiteboard base64), and `append_to_note` drops `message` and accumulates blank lines.

## What Changes

- Add `add_tags` / `remove_tags` MCP tools for one or more notes, with `dry_run`, exact hierarchical removal, code-block safety, compact per-note results, and archived-note rejection.
- Add `purge_note` / `purge_archived` MCP tools for permanent deletion of archived notes. Both preview by default; confirmation, title/count guards, and archived-only enforcement are required.
- Include `archived_at` and `is_archived` in `search_notes` / `list_notes` summaries when archived rows are requested.
- Return `note_archived` (not `note_not_found`) when opening a session on an archived note.
- Return compact note/revision metadata from `edit_note` / `append_to_note` by default, with `include_content: true` as an opt-in; omit whiteboard `canvasData`/`thumbnail` from `get_note` unless `include_canvas: true`.
- Accept `tags` on `edit_note` / `append_to_note`; accept `message` on `append_to_note`; normalize append blank lines.
- Report `note_session close` `draft_kept` from the persisted draft state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: tag administration, archived-note purge, archived visibility, compact payloads, and clearer archived/append/session behavior.

## Impact

- **Affected code**:
  - `src/shared/tags.js` — code-safe add/remove helpers and tag validation.
  - `src/mcp/createServer.js` — tag/purge tools, compact responses, `get_note` canvas omission.
  - `src/server/services/notes.js` — lightweight archived-note listing.
  - `src/server/services/search.js` — archived flags in summaries.
  - `src/server/services/mcpEditing.js`, `server.js` — `note_archived` error and real `draft_kept`.
  - `tests/parsers.test.js`, `tests/mcp*.test.js`.
  - `docs/mcp.md`, `AGENTS.md`, `CHANGELOG.md`.
- **No schema changes.**
- **Destructive behavior is opt-in**: `archive_note` remains reversible; purge tools require confirmation and only touch archived notes.
- **Tags remain inline markdown**: each changed note gets one revision. A true metadata-only tag store is out of scope.
