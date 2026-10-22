## 1. Dashboard tabs

- [x] 1.1 Replace the archived toggle with Notes / Archived / Drafts tabs and counts
- [x] 1.2 Filter active and archived notes into mutually exclusive views
- [x] 1.3 Keep Quick Shortcuts only in the Notes tab
- [x] 1.4 Clear selection and pickers when switching tabs
- [x] 1.5 Apply search, tags, and sorting to the active view

## 2. Draft listing

- [x] 2.1 Add `textCollab.listDrafts` for persisted, non-clean, non-archived drafts
- [x] 2.2 Add `GET /api/drafts`
- [x] 2.3 Add the Drafts tab cards with a Draft badge and standard preview scrollbar
- [x] 2.4 Open a draft card into the editor with the shared draft loaded
- [x] 2.5 Hide selection, color, copy, and delete controls on draft cards
- [x] 2.6 Add loading, empty, error, and refresh states
- [x] 2.7 Show a Draft badge on normal cards that have a pending draft

## 3. Editor actions

- [x] 3.1 Add Draft beside Save and rename Cancel to Discard
- [x] 3.2 Keep the shared draft on Draft; discard it on Discard when last editor
- [x] 3.3 Add Draft to the unsaved dialog and rename Continue Editing to Continue
- [x] 3.4 Give the four dialog actions equal size and weight
- [x] 3.5 Refresh drafts after save, discard, draft close, and text events

## 4. Verification and docs

- [x] 4.1 Add service and API tests for draft listing and clean-draft omission
- [x] 4.2 Run `npm run build`
- [x] 4.3 Run the full `npm test` suite
- [x] 4.4 Verify tabs, draft cards, editor actions, and the unsaved dialog in a browser
- [x] 4.5 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 4.6 Run `openspec validate --strict`
- [ ] 4.7 Archive the change after review
