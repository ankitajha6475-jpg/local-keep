## Why

Local Keep currently overwrites notes in place, so an edit destroys the previous state and concurrent edits can silently lose work. The next features (relationships, tags, whiteboard pages, MCP) all need a stable document identity plus an auditable history. This change introduces that foundation without changing the note IDs users already have.

## What Changes

- Add a **thread/head + immutable revision** model:
  - `notes` remains the head (latest state) with a stable `id`.
  - `note_revisions` stores append-only snapshots with `parent_revision_id`, actor, source, and timestamp.
  - Creating a note and every committed text edit create a revision.
- Add **session-stable document identity**: while a document is open, its `noteId` never changes. Revisions are version identities (`v1`, `v2`, ...), never the document identity. The editor may display a revision badge, but URLs, cards, WebSocket sessions, and MCP note IDs stay on the same `noteId`.
- Add **optimistic concurrency**:
  - The editor captures `baseRevisionId` when opening a note.
  - Saving with a stale base creates a **branch revision** and leaves the head unchanged; the response reports `conflict: true` and a notice.
  - `mode: "take_head"` is the explicit override.
- Add **history APIs**:
  - `GET /api/notes/:id/history` (flat revisions + tree + head chain).
  - `GET /api/notes/:id/history/:revisionId` (snapshot).
  - `POST /api/notes/:id/history/:revisionId/restore` (copy an old version into a new head revision).
  - `POST /api/notes/:id/history/:revisionId/promote` (promote a branch into a new head revision).
- Add **archive-by-default deletion**:
  - `DELETE /api/notes/:id` sets `archived_at` and retains revisions/images.
  - `POST /api/notes/:id/restore` unarchives.
  - `DELETE /api/notes/:id?purge=1` permanently deletes.
  - Archived notes are excluded from lists/search by default.
- Add **revision image references** so image cleanup does not delete images used only by old versions.
- Add a **schema migration** with a pre-migration backup. Existing 89 notes become revision 1 of their own thread; note IDs are unchanged.
- Keep the existing REST/WS contract working: note responses keep `id`, and add `revisionId`, `revisionNo`, `archivedAt`, and a `notice` on writes.

**BREAKING**: `DELETE /api/notes/:id` now archives instead of hard-deleting; permanent deletion requires `?purge=1`. Search results additionally exclude archived notes.

## Capabilities

### New Capabilities

- `note-threads`: Stable note identity, immutable revisions, session-stable editing, optimistic branching, history/restore/promote, and archive retention.

### Modified Capabilities

<!-- No existing spec covers note identity, edits, deletion, or search. Image-storage specs are
     unaffected: this change only adds per-revision references so cleanup remains correct. -->

## Impact

- **Affected code**:
  - `server.js`: notes routes, search, delete/batch-delete, FTS updates, startup migration hook.
  - New `src/server/db.js`, `src/server/migrations/001-note-threads.js`,
    `src/server/services/notes.js`, `src/server/services/revisions.js`,
    `src/server/services/imageRefs.js` (or equivalent).
  - `src/App.vue`: capture/send `baseRevisionId`; keep `editingId` stable; show revision
    notice and history entry point; update delete copy.
  - `src/components/WhiteboardEditor.vue` / collab persistence: canvas checkpoints create
    revisions under the same note ID (minimal integration in this change; full page
    rendering is a later change).
  - `src/utils/notes.js` / shared display-title helper for server-side `display_title`.
- **Database**: add `head_revision_id`, `revision_no`, `display_title`, `content_hash`,
  `canvas_hash`, `archived_at`, `last_checkpoint_at` to `notes`; add `note_revisions`,
  `note_drafts`, `revision_image_refs`, `note_events`, `schema_migrations`.
- **APIs**: new history/restore/promote/restore endpoints; `PUT /api/notes/:id` accepts
  `baseRevisionId`/`mode`; note shape gains revision/archive fields.
- **No new runtime dependencies** for this change.
- **Migration**: transactional, backed up, idempotent; tested on a copy of
  `data/local-keep.db` before touching the real database.
