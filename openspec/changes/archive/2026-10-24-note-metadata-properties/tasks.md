# Tasks — Note Metadata Properties

## 1. Shared fence module

- [x] 1.1 Decide the fence parser approach and verify it needs no new dependency (delivered as a hand-rolled strict subset in `src/shared/noteMeta.js`, per design D1)
- [x] 1.2 Create `src/shared/noteMeta.js` with `parseMeta`/`serializeMeta`/`splitFence`/`joinFence` implementing the strict subset (one scalar per line, flow lists, quoting for bool/number/date/colour-like values, key order preserved, unknown keys preserved) and verify `tests/noteMeta.test.js` covers round-trip byte-exactness for `no`, `2026-11-01`, `3.0`, `#e2ece4`
- [x] 1.3 Verify invalid fences (anchor, block scalar, nested mapping) are rejected with a line-numbered error in `tests/noteMeta.test.js`

## 2. Server storage and sync

- [x] 2.1 Add `note_meta` table in `src/server/migrations/015-note-metadata.js` and verify `tests/migration.test.js` runs it idempotently with a backup
- [x] 2.2 Implement `src/server/services/noteMeta.js` sync (rebuild `note_meta` and `note_tags` from the fence) wired into the head-move path and verify branch revisions do not change the index
- [x] 2.3 Strip the fence in `noteText()` (`src/server/services/embeddings.js`) and `indexNote()`/`rebuildFts()` (`src/server/fts.js`) and verify fence keys never appear in chunk or FTS text
- [x] 2.4 Add tags to the embedding chunk input and to `noteHash()` and verify a tag-only edit re-enqueues the note
- [x] 2.5 Write `source: 'property'` and a shared message for metadata edits in `src/server/services/revisions.js` and verify `tests/revisions.test.js` records them
- [x] 2.6 Keep `notes.title` head-only: verify restore/promote do not move the title and renames create no revision

## 3. Migration normalization

- [x] 3.1 In migration 015, append one normalization revision per note (strip inline `#tag` markers from the head body, fold `display_title` into `aliases`) and verify history length grows by exactly one per note
- [x] 3.2 Verify old revisions render without a fence and show no properties (legacy path)

## 4. Editor and renderer contract

- [x] 4.1 Strip one leading fence in `src/utils/markdown.js` render path and verify body `#` renders as a heading
- [x] 4.2 Make `src/utils/editorSerialize.js` return body-only and verify save reassembles fence + body
- [x] 4.3 Verify Visual/Source switching and clean saves do not rewrite the fence

## 5. Properties panel and tag chips

- [x] 5.1 Add a properties panel in `src/App.vue` (tags chips, aliases, typed user fields, title row, separate Presentation heading for color) and verify it edits the fence without touching the body editor
- [x] 5.2 Wire chip editing to the shared tag helpers and verify adding/removing a tag updates `note_tags` and the tree

## 6. Operable tag tree

- [x] 6.1 Add `rename`/`move`/`deleteSubtree` to `src/server/services/tags.js` with exact-path semantics and verify `area/project` renames do not touch `area/projector`
- [x] 6.2 Expose `PATCH /api/tags` and `DELETE /api/tags` and verify archived notes are skipped and reported
- [x] 6.3 Add rename/move/delete controls to `src/components/TagSidebar.vue` and verify the tree re-derives after each operation

## 7. MCP surface

- [x] 7.1 Make `add_tags`/`remove_tags` property mutations with `dry_run` and verify one `source: property` revision per changed note
- [x] 7.2 Add property mutation and `meta` in `get_note` (`src/mcp/createServer.js`) and verify `include_frontmatter` returns the raw file
- [x] 7.3 Verify `tests/mcp.test.js` and `tests/mcpEditing.test.js` cover property semantics

## 8. Collab contract

- [x] 8.1 Keep properties out of the shared `Y.Text` (ride `meta`) and verify two clients editing body and tags concurrently converge with no fence corruption
- [x] 8.2 Verify `/api/drafts` reports a draft changed when only properties differ and clean when both match

## 9. Validation

- [x] 9.1 Run `npm test` and verify all tests pass
- [x] 9.2 Run `openspec validate --all --strict --no-interactive --report findings` and verify a clean result
- [x] 9.3 Add `CHANGELOG.md` entries under `[Unreleased]` and verify format
- [x] 9.4 Update `AGENTS.md` gotchas (38, 41, 44, 45 amended; `noteHash` and title-outside-fence added) and verify the doc matches behavior
