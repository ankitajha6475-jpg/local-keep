## 1. Default editor mode

- [x] 1.1 Add `DEFAULT_EDITOR_MODE = 'plain'` and initialise `editorMode` from it
- [x] 1.2 Reset to Source in new-note, global-paste, edit-start, and close paths
- [x] 1.3 Keep Visual rendering, the mode switch, and `Ctrl/Cmd+Shift+M` working

## 2. Isolated new-note properties

- [x] 2.1 Add `resetNoteProps()` for `noteProps`, tag/property drafts, and suggestions
- [x] 2.2 Call it from every new-note and close path
- [x] 2.3 Keep existing notes loading their parsed fence

## 3. Tag autocomplete

- [x] 3.1 Add `matchTags()` with exact/prefix/segment/substring/subsequence ranking
- [x] 3.2 Flatten the known tag tree and exclude tags already on the note
- [x] 3.3 Render the suggestion list under the tag input
- [x] 3.4 Support click, ArrowUp/ArrowDown, Enter, and Escape
- [x] 3.5 Keep manually typed new tags possible

## 4. Verification and docs

- [x] 4.1 Add `matchTags` unit tests
- [x] 4.2 Run the tags tests and the frontend build
- [x] 4.3 Run the full test suite
- [x] 4.4 Update `CHANGELOG.md` and the affected specs
- [x] 4.5 Run `openspec validate --strict`
