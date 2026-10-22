## 1. Service

- [x] 1.1 Add `links.summary(noteIds, { includeArchived })` returning deduplicated `outgoing` and `incoming` groups with context snippets
- [x] 1.2 Chunk id lookups and ignore invalid/duplicate ids
- [x] 1.3 Add service tests for grouping, archived filtering, and unresolved entries

## 2. REST API

- [x] 2.1 Add `POST /api/notes/links/summary` with `{ ids, includeArchived }` validation
- [x] 2.2 Add API coverage for the batch endpoint

## 3. UI

- [x] 3.1 Add `SelectionLinksPanel.vue` with Both / Links to / Linked from modes, status chips, and click-to-open rows
- [x] 3.2 Add the 🔗 Links action to the selection bar and fetch the summary on open
- [x] 3.3 Wire open-note navigation, archived notices, and unsaved-change confirmation
- [x] 3.4 Close the panel on deselect-all and Escape

## 4. Verification and docs

- [x] 4.1 Run `npm test` and `npm run build`
- [x] 4.2 Update `CHANGELOG.md`
- [x] 4.3 Run `openspec validate --strict` and sync the delta spec
