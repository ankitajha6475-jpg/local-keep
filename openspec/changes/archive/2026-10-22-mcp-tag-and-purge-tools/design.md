## Context

Tags are inline markdown and `note_tags` is a materialised head-level view. `edit_note` and `append_to_note` exist, but neither accepts tags, so the only way to tag through MCP is to rewrite or append raw content. Permanent deletion exists in the REST API (`DELETE /api/notes/:id?purge=1`) but not in MCP; `archive_note` is the only removal tool. The MCP list/search summary also lacks archived metadata, and mutation tools return full content bodies (whiteboard reads can return base64 blobs).

## Goals / Non-Goals

**Goals:**
- Make tagging existing notes a first-class, batchable MCP operation.
- Make permanent cleanup of archived notes possible with previews and strong guards.
- Expose archived status in list/search summaries.
- Reduce accidental context blow-up from mutation/read responses.
- Keep all writes on the same revision, link, tag, and event-bus path as REST/UI.

**Non-Goals:**
- A separate tag table or metadata-only tag edits.
- Purging active notes through MCP.
- Undo/trash for purged notes.
- Dynamic per-session MCP tools.

## Decisions

### Decision 1: Tag tools edit inline content with shared helpers

`add_tags`/`remove_tags` use `addTagsToContent`/`removeTagsFromContent` from `src/shared/tags.js`. The helpers:
- normalise tags (NFKC, lowercase, hierarchy, reject hex colours/empty values);
- only add missing tags;
- append a trailing tag paragraph, falling back to a leading paragraph if the note ends inside an unclosed code fence;
- remove exact hierarchical matches only (removing `area` leaves `area/project`);
- preserve fenced/inline code.

Each changed note is committed once with `source: 'mcp'` and a message naming the tags. Batch calls are non-atomic: per-note results report `changed`, `skipped`, or an error, and one failed note does not roll back the others.

### Decision 2: Archived notes are rejected, not silently edited

Tag tools skip archived notes with `skipped: "note_archived"` and a restore guide. `edit_note`/`append_to_note` and session open return `note_archived`. This keeps the web rule (archived notes are read-only until restored) and avoids creating revisions on hidden notes.

### Decision 3: Purge previews by default; guards are explicit

`purge_note` only accepts archived notes. Without `confirm: true` it returns a preview; an optional `expected_title` must match. `purge_archived` previews by default. Purging all archived notes requires `expected_count` from the preview; an explicit `note_ids` subset does not, but every id must exist and be archived. Both tools require no open write session and return compact summaries, not content. The service event bus closes sessions and clears drafts on purge.

### Decision 4: Compact responses are the new default

`edit_note`/`append_to_note` return note/revision summaries (ids, revision number, tags, content length, timestamps) and `include_content: true` restores full bodies. `get_note` keeps markdown but omits whiteboard `canvasData`/`thumbnail` unless `include_canvas: true`. `archive_note`/`restore_note` also return summaries. This keeps the common agent path small while preserving opt-in detail.

### Decision 5: Archived visibility and session errors

`search.js` adds `archived_at` and `is_archived` to every summary. Agents can list with `include_archived: true` and filter locally without a second pass. `mcpEditing.open` distinguishes a missing note from an archived one.

### Decision 6: Append/session semantics

`append_to_note` now accepts `message`, normalises blank lines between the existing content and the addition, and can add tags in the same revision. `note_session close` reads `textCollab.hasDraft(noteId)` after clean-draft cleanup, so `draft_kept` reflects the row rather than “not explicitly discarded”.

## Risks / Trade-offs

- **[Risk] Bulk tagging creates many revisions** — tags are content, so each changed note gets a revision. `dry_run` lets callers preview; a metadata-only tag store is intentionally out of scope.
- **[Risk] Purge is irreversible** — previews, `expected_title`, `expected_count`, archived-only enforcement, and write-session exclusion reduce accidents, but there is no undo.
- **[Risk] Compact mutation responses break clients that read `note.content`** — `include_content: true` is the compatibility escape hatch; docs and tests use it explicitly.
- **[Risk] Batch tag calls are non-atomic** — per-note errors are returned; callers can retry failed ids.

## Migration Plan

None. No schema changes. Existing clients that need full bodies pass `include_content: true`.

## Open Questions

None.
