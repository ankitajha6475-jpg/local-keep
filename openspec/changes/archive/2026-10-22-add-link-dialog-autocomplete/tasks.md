## 1. Shared markdown builders

- [x] 1.1 Add `src/shared/linkMarkdown.js` for regular links, stable wiki links, and new-title wiki links
- [x] 1.2 Add tests for escaping, note-id links, and aliases

## 2. Link dialog

- [x] 2.1 Add `LinkDialog.vue` with regular (Text + URL) and wiki (search) modes
- [x] 2.2 Debounce note search and sequence-guard responses
- [x] 2.3 Show matching notes, recent suggestions for an empty query, and a new-title option
- [x] 2.4 Support arrow keys, Enter, Escape, and click selection

## 3. Editor integration

- [x] 3.1 Replace prompt-based link and wiki-link flows in Visual and Source modes
- [x] 3.2 Capture the editor/textarea selection before opening the dialog
- [x] 3.3 Insert regular links and wiki links at the captured selection
- [x] 3.4 Close the dialog on Escape before closing the note editor
- [x] 3.5 Preserve wiki aliases with `data-note-target` in the renderer and serializer

## 4. Verification and docs

- [x] 4.1 Run `npm test` and `npm run build`
- [x] 4.2 Manually verify both modes, search suggestions, new titles, and selection preservation
- [x] 4.3 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 4.4 Run `openspec validate --strict` and archive the change
