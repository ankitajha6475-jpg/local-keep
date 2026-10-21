## 1. Foundation and schema

- [x] 1.1 Add `src/server/db.js` with WAL, foreign keys, busy timeout, `schema_migrations`, backup, and transactional migration runner; verify with fresh/legacy DB tests
- [x] 1.2 Add `src/server/schema.js` for the pre-revision base tables and FTS shape; verify existing schema creation and FTS migration
- [x] 1.3 Add `src/server/images.js`, `src/server/fts.js`, `src/server/canvas.js`, `src/server/events.js`, and shared `src/shared/notesText.js`; verify `npm test`
- [x] 1.4 Add `note_revisions`, `note_drafts`, `note_events`, `revision_image_refs`, `whiteboard_renders`, `whiteboard_tiles` and head columns; verify migration test
- [x] 1.5 Record migration version 1 and prove a second run applies nothing; verify idempotence test

## 2. Migration of existing notes

- [x] 2.1 Create a `VACUUM INTO` backup before a non-empty migration; verify backup exists in the legacy migration test
- [x] 2.2 Backfill every legacy note into revision 1 with unchanged id/title/content/canvas; verify legacy migration test
- [x] 2.3 Extract legacy canvas `dataURL` files to `data/images` and store lean revision scenes; verify hash refs and no `dataURL` in the revision
- [x] 2.4 Turn legacy canvas thumbnails into a one-tile legacy render; verify render/tile rows
- [x] 2.5 Rebuild FTS with plain-text content; verify FTS count equals notes count
- [x] 2.6 Rehearse migration on a copy of `data/local-keep.db` (89 notes, 3 canvases) and verify counts/ids; completed
- [x] 2.7 Run the real migration via container restart; verify 89 notes, 0 null heads, 89 revisions, 3 legacy renders/tiles, and a backup under `data/backups/`

## 3. Revision service

- [x] 3.1 Implement `insertInitialRevision` and head materialization; verify create test
- [x] 3.2 Implement `commitText` with no-op detection, `append`, `branch`, and `take_head`; verify revision/branch tests
- [x] 3.3 Implement history flat list, tree, head-chain marking; verify history assertions
- [x] 3.4 Implement restore and promote as new head revisions; verify history is not rewritten
- [x] 3.5 Implement `checkpointCanvas` with canvas hash and dedupe; verify canvas checkpoint test
- [x] 3.6 Record `note_events` and emit domain events after commit; verify WS `note-revised` test
- [x] 3.7 Sync head and revision image refs on every commit; verify old-revision image retention test

## 4. REST API

- [x] 4.1 Update list/get/create responses with stable `id`, `revisionId`, `revisionNo`, `displayTitle`, `archivedAt`; verify API test
- [x] 4.2 Accept `baseRevisionId` and `mode` on `PUT /api/notes/:id`; verify conflict/branch API test
- [x] 4.3 Add history, revision snapshot, restore, and promote endpoints; verify API/service tests
- [x] 4.4 Make `DELETE /api/notes/:id` archive by default and add `?purge=1`; verify archive/restore/purge API test
- [x] 4.5 Exclude archived notes from lists and search by default, with `includeArchived=1`; verify API test
- [x] 4.6 Rebuild image cleanup around head/revision refs; verify old-revision retention test

## 5. WebSocket and whiteboard

- [x] 5.1 Broadcast `note-created`, `note-revised`, `note-archived`, `note-restored`, `note-purged`; verify whiteboard WS test
- [x] 5.2 Add `checkpoint` WS message and `checkpoint-saved` ack; verify WS test
- [x] 5.3 Force a checkpoint when the last whiteboard session leaves or the socket closes; verify manual/server path
- [x] 5.4 Send a checkpoint on whiteboard back navigation via `collab.checkpoint()`; verify build and test
- [x] 5.5 Keep the whiteboard note id stable across deltas/checkpoints; verify WS test

## 6. Client identity, history, and archive UI

- [x] 6.1 Add `editingBaseRevisionId`/`editingRevisionNo`; keep `editingId` unchanged for the whole edit session; verify build
- [x] 6.2 Send `baseRevisionId` on save and show revision/conflict notices; verify build and API behavior
- [x] 6.3 Add revision badge and history drawer with view/restore/promote actions; verify build
- [x] 6.4 Update delete copy to archive, add an archived filter and restore action; verify build
- [x] 6.5 Ensure a stale save does not reassign the editor to a revision id; verify code review and tests

## 7. Tests

- [x] 7.1 Add `npm test` (`node --test tests/*.test.js`) and keep the existing touch tests; verify command
- [x] 7.2 Add migration tests (fresh, legacy, idempotent, backup); verify pass
- [x] 7.3 Add revision/history/branch/restore/promote/archive/purge/image tests; verify pass
- [x] 7.4 Add HTTP integration tests for notes/history/conflict/archive/restore/purge/search; verify pass
- [x] 7.5 Add WebSocket integration test for delta/checkpoint/note-revised; verify pass
- [x] 7.6 Run `npm run build` after client changes; verify success

## 8. Documentation and rollout

- [x] 8.1 Update `CHANGELOG.md` under `[Unreleased]`
- [x] 8.2 Update `AGENTS.md` with the head+revision model, stable-identity invariant, archive semantics, new modules, tests, and gotchas
- [x] 8.3 Update the architecture plan status to reflect the implemented first slice
- [x] 8.4 Manually verify the browser flows: open/edit/save/reopen, history drawer, branch notice, archived filter/restore, whiteboard checkpoint on back
- [x] 8.5 Keep the real migration backup and document its path in the changelog/rollout notes
