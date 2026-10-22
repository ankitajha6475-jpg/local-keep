## 1. Tag editing

- [x] 1.1 Add code-safe `addTagsToContent` / `removeTagsFromContent` helpers and validation
- [x] 1.2 Add unit coverage for adding, idempotence, exact hierarchical removal, and fenced code
- [x] 1.3 Add `add_tags` / `remove_tags` MCP tools with batch note ids, `dry_run`, and compact results
- [x] 1.4 Accept `tags` on `edit_note` / `append_to_note`

## 2. Archived cleanup

- [x] 2.1 Add `purge_note` with preview, `confirm`, and optional `expected_title`
- [x] 2.2 Add `purge_archived` with preview, `note_ids`, and `expected_count` guard
- [x] 2.3 Reject active notes and open write sessions; close sessions/drafts through the purge event
- [x] 2.4 Add a lightweight archived-note listing to the notes service

## 3. Archived visibility and errors

- [x] 3.1 Add `archived_at` / `is_archived` to search and list summaries
- [x] 3.2 Return `note_archived` with a restore guide when opening a session on an archived note

## 4. Response and append improvements

- [x] 4.1 Compact `edit_note` / `append_to_note` / archive / restore responses with `include_content`
- [x] 4.2 Omit canvas payloads from `get_note` unless `include_canvas: true`
- [x] 4.3 Add `message` to `append_to_note` and normalize blank lines
- [x] 4.4 Report `draft_kept` from the persisted draft row on `note_session close`

## 5. Verification and docs

- [x] 5.1 Add MCP integration tests for tags, archived flags, purge guards, compact responses, and draft status
- [x] 5.2 Run `npm test`
- [x] 5.3 Run `npm run build`
- [x] 5.4 Update `docs/mcp.md`, `AGENTS.md`, and `CHANGELOG.md`
- [x] 5.5 Run `openspec validate --strict`
- [x] 5.6 Run the real MCP tagging and archived-purge workflow
- [ ] 5.7 Archive the change after review
