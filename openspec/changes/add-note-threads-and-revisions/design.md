## Context

See `proposal.md` for motivation and `specs/note-threads/spec.md` for the behavior contract.

The current implementation keeps all note state in a single `notes` row and overwrites it on
`PUT /api/notes/:id`. `server.js` is a 969-line composition of schema setup, migrations,
REST routes, WebSocket collaboration, and image storage. The live database contains 89 notes
(86 text, 3 canvas) and about 1.3 MB of data, so a transactional backfill is safe if it is
rehearsed on a copy.

The existing client identifies a note by `notes.id` everywhere (`editingId`,
`editingCanvasId`, WS messages, image refs). That must not change. The new model adds
history beside the existing identity rather than replacing it.

## Goals / Non-Goals

**Goals:**

- Make note identity stable for the life of a document, including while an editor is open.
- Make every committed text edit append-only and readable.
- Preserve concurrent edits as branches; never silently overwrite the head.
- Keep the current REST/WS clients working with an additive note shape.
- Migrate the existing database without changing note ids or content.
- Establish a small, testable service layer so later features (tags, links, whiteboard
  pages, MCP) can share note logic.
- Keep image cleanup correct once old revisions reference images.

**Non-Goals:**

- New note relationships, tags, markdown rendering, whiteboard page images, or MCP in this
  change. Those are separate OpenSpec changes.
- CRDT/OT text collaboration or automatic three-way merges.
- A full rewrite of `App.vue` or `server.js`. This change extracts only what revisions
  need; later changes continue the refactor.
- Autosave UI. The draft table and API shape are introduced so autosave can be added
  later without changing note identity semantics.

## Decisions

### D1: `notes.id` is the document/thread identity; revisions are versions

Keep `notes` as the materialized head and add `note_revisions` for immutable snapshots.
A revision's id is never used as the document id. The editor keeps `editingId = note.id`
before and after save; it may display `v3` but must not navigate to or select a revision id.

**Alternatives considered:**

- *Every edit creates a new `notes` row with a new id.* Rejected: links, open editors,
  WebSocket sessions, and image refs would break or require alias maps. It also causes the
  exact identity churn the user explicitly wants to avoid.
- *Full event sourcing (only revisions, no head row).* Rejected for this increment: every
  list/search/WS path would need a head-materialization view, and migration/rollback become
  riskier. The head row is a cheap, reliable cache.

### D2: An editing session is bound to `noteId` and `baseRevisionId`

Opening an editor creates an in-memory session:

```
{ noteId, baseRevisionId, openedAt, dirty }
```

`noteId` is immutable for the session. `baseRevisionId` is used for optimistic concurrency.
The client sends `baseRevisionId` with the commit. On success, the response returns the new
`revisionId`; the client updates its revision badge/base pointer but keeps `noteId`.

If autosave is enabled later, it writes `note_drafts(note_id, session_id, ...)`. Drafts do
not create revisions and do not move the head. Only an explicit save/commit calls the
revision service. This is the mechanism that prevents revision spam and identity churn.

**Why a draft table instead of treating the head as a draft:** another tab or MCP client
must not observe half-written autosave content as the canonical head. A separate draft also
makes crash recovery explicit and keeps the history clean.

### D3: Stale commits branch by default

A commit reads the current head and compares it with `baseRevisionId`:

- equal → append a revision with `parent = head`, move the head;
- different + default mode → append a revision with `parent = base`, leave the head,
  return `conflict: true`;
- different + `take_head` → append with `parent = head`, move the head (explicit override);
- `branch` mode → always append off the base without moving the head.

A branch is simply a revision whose parent is not the current head. "Head chain" is
computed by walking parents from the head, not stored, so promoting a branch does not
require fixing flags.

### D4: Archive by default, purge explicitly

`DELETE /api/notes/:id` sets `archived_at`, keeps revisions/images/events, clears in-memory
collab state, and emits the existing `note-deleted` event so current clients still mask the
editor. Lists/search filter archived notes by default. `?purge=1` hard-deletes and releases
image refs. This preserves the "original is still there" promise beyond edits.

### D5: Migration is a versioned, backed-up, single transaction

Add `schema_migrations` and a `001-note-threads` migration. Before applying it, create a
consistent backup with `VACUUM INTO data/backups/pre-note-threads-<timestamp>.db`. The
migration adds columns/tables, backfills every note into revision 1, sets head/hash/display
title fields, creates legacy whiteboard thumbnail renders (so no canvas loses its preview),
and rebuilds FTS. It runs inside `BEGIN IMMEDIATE`/`COMMIT`; on error the transaction rolls
back and startup fails with the backup path.

A fresh database creates the same final schema and records version 1 directly.

### D6: Revision snapshots are lean for canvases

Text revisions store full markdown (small). Canvas revisions strip base64 `files[*].dataURL`
and keep `{ id, mimeType, hash, ext, created }`; the head keeps Excalidraw's required
`dataURL` for rendering. Historical canvas scenes can rehydrate images from `data/images`.
This avoids duplicating large base64 payloads in every checkpoint.

Whiteboard checkpointing is integrated minimally here: `persistNoteState` continues to
update the head, and a checkpoint revision is created on leave/manual/interval when the
canvas hash changes. Full page rendering is a later change.

### D7: Service extraction is scoped to revisions

New modules:

- `src/server/db.js` — open DB, PRAGMAs (WAL, foreign keys, busy timeout), backup helper,
  migration runner.
- `src/server/migrations/001-note-threads.js` — schema + backfill.
- `src/server/services/notes.js` — list/get/create/archive/restore and note-shaped output.
- `src/server/services/revisions.js` — commit, branch, history tree, restore, promote.
- `src/server/services/imageRefs.js` — head/revision/tile reference syncing and cleanup
  inputs.

`server.js` keeps the Express/WS wiring and calls these services. A later change can move
tags/links/search/MCP behind the same layer. This keeps the change reviewable while
establishing the seam.

### D8: Revision-aware images

Add `revision_image_refs(image_hash, revision_id)`. On every commit, extract image hashes
from the revision's text/canvas and insert refs. Image cleanup considers the union of
`image_refs` (head/tiles), `revision_image_refs`, and `whiteboard_tiles`. Purging a note
cascades revision refs; archived notes keep them.

### D9: API compatibility

`GET /api/notes` and `GET /api/notes/:id` keep existing fields and add `revisionId`,
`revisionNo`, `displayTitle`, `archivedAt`, `tags` (empty until the tags change), and
counts. `PUT /api/notes/:id` accepts optional `baseRevisionId` and `mode`; if omitted, it
uses the current head as the base (legacy behavior, but still creates a revision).
Writes return `{ ...note, revision, previousRevision?, conflict, notice }`; legacy clients
that only read note fields continue to work. `DELETE` archives; `?purge=1` hard-deletes.

Search returns the same note ids as before but joins `notes` to exclude archived rows. The
existing `/api/search` response shape stays an array of ids in this change; the richer
timestamped result shape is part of the MCP/search change.

### D10: FTS and display titles

`notes_fts.content` continues to index head content. The migration rebuilds it from
`markdownToText(content)` and canvas text so snippets remain readable once a renderer is
added. `display_title` is maintained on create/commit via the shared display-title helper;
the existing view-layer derivation remains the fallback.

## Risks / Trade-offs

- **Migration risk** → `VACUUM INTO` backup, one transaction, dry run on a copy, explicit
  verification queries, fail closed. Keep the backup until manual acceptance passes.
- **Head + revision duplication** → text snapshots are small; canvas snapshots are lean.
  A `snapshot_hash` lets the service skip no-op commits. Future retention policy can prune
  auto-canvas checkpoints only if configured.
- **Forgotten `baseRevisionId`** → default to the head at request time. This preserves
  legacy behavior but cannot detect a concurrent edit that happened before the request; the
  UI always sends `baseRevisionId`, and MCP will do the same in a later change.
- **Archive changes delete semantics** → keep the `note-deleted` event and the existing
  deletion mask; update UI copy and add `?purge=1` for the old behavior. Document the change
  in CHANGELOG.
- **Service extraction regressions** → move code with no behavior change where possible,
  add integration tests before changing semantics, and keep `server.js` as the composition
  root.
- **Canvas checkpoint cost** → checkpoint only on leave/manual/interval, compute a canonical
  hash, and skip when unchanged. Full render work is deferred to the whiteboard-pages change.
- **Old revisions and images** → revision image refs + cleanup union; test with an image
  removed from the head but present in an old revision.

## Migration Plan

1. Add a `VACUUM INTO` backup helper and `schema_migrations`.
2. Create the new tables/columns and indexes (idempotent).
3. In one transaction, for every note without a head revision:
   - compute `display_title`, `snapshot_hash`, `canvas_hash`;
   - extract canvas `dataURL` files to `data/images` and write a lean revision copy;
   - insert revision 1 and set the head fields;
   - copy thumbnail to a legacy single-tile whiteboard render if applicable;
   - record revision image refs.
4. Rebuild `notes_fts` from `markdownToText(content)` and canvas text.
5. Record `schema_migrations.version = 1`.
6. Verify counts, non-null head ids, head/revision hash equality, and FTS count; then commit.
7. On failure, roll back, report the backup path, and do not serve traffic.
8. Rollback strategy: stop the server and restore the pre-migration backup. There is no
   destructive rewrite of existing rows, so restoring is always safe.

## Open Questions

None that block implementation. The later whiteboard-pages change will decide page size and
on-demand render policy; the later MCP change will decide token scopes and transport
details. Neither affects this schema or the editing-session contract.
