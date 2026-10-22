## 1. Color metadata

- [x] 1.1 Add the shared note-color palette and normalization
- [x] 1.2 Add migration 13 for `notes.color`
- [x] 1.3 Add `notes.setNoteColor` without creating revisions or bumping `updatedAt`
- [x] 1.4 Add `PUT /api/notes/:id/color` and the `note-color` WebSocket event
- [x] 1.5 Add migration and API coverage

## 2. Dashboard tint UI

- [x] 2.1 Render card tints through shared CSS variables for text, whiteboard, hover, and archived states
- [x] 2.2 Add the palette button immediately right of the card checkbox
- [x] 2.3 Add the Default plus six-color menu with accessible labels and selected state
- [x] 2.4 Apply colors optimistically, reconcile with the API, revert on failure, and sync `note-color` events
- [x] 2.5 Close the picker on outside click and Escape

## 3. Quick Shortcuts card

- [x] 3.1 Replace the bespoke card with a read-only virtual note in `dashboardNotes`
- [x] 3.2 Hide selection, color, copy, and delete/restore controls for the virtual note
- [x] 3.3 Prevent selection and editing; keep it out of note counts and Select All
- [x] 3.4 Render the shortcut body through `MarkdownView` / `.note-preview` for the standard scrollbar
- [x] 3.5 Remove the bespoke shortcut list and amber card styles

## 4. Verification and docs

- [x] 4.1 Run `npm run build`
- [x] 4.2 Run the full `npm test` suite
- [x] 4.3 Verify the card, picker, tint persistence, and read-only behavior in a browser
- [x] 4.4 Update `CHANGELOG.md` and `AGENTS.md`
- [ ] 4.5 Run `openspec validate --strict` and archive the change after review
