# Tasks: Editor toolbar header layout

## 1. Template changes (src/App.vue)

- [x] 1.1 Modal header: replace `{{ editingId ? 'Editing Note' : 'New Note' }}` with `Editor`, remove the `v{{ editingRevisionNo }}` revision badge span and the `Ctrl+Enter to save` hint, keep the `● Live` badge
- [x] 1.2 Bottom action row: add an `editor-footer-controls` group before `action-buttons` containing the `editor-mode-switch` (Visual/Source buttons) and the `paste-mode-select`
- [x] 1.3 Note editor toolbar: remove the mode-switch block, the paste-mode select, and the `toolbar-spacer`; keep `MarkdownToolbar` and place the image button directly after it

## 2. Styles (src/App.vue)

- [x] 2.1 Add `.editor-footer-controls` styles (flex row, gap, wrap)
- [x] 2.2 Remove the now-unused editor-toolbar `.toolbar-divider`/`.toolbar-spacer` markup and their App.vue CSS rules if no other usage remains (the global `.toolbar-spacer` is kept — DashboardNoteCard has no style block and relies on it)
- [x] 2.3 Give the in-toolbar image button the markdown-tool tooltip (name on hover, shortcut while Alt is held) and keep it out of the generic button shortcut-badge rule

## 3. Validation

- [x] 3.1 `openspec validate editor-toolbar-header-layout --strict` passes
- [x] 3.2 `npm test` passes (no server behavior changed; UI-only diff)
- [x] 3.3 Verify in the browser: header shows `Editor`; bottom-left shows mode switch + paste select with Save/Draft/Discard at the right; toolbar shows tools + inline image button; shortcuts `Ctrl+Alt+V/S/I` still work
- [x] 3.4 Record the change in `CHANGELOG.md` under `[Unreleased]`
