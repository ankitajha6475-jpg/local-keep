## 1. Shortcut model

- [x] 1.1 Add `src/shared/shortcuts.js` with the canonical action map, label formatting, and event normalization
- [x] 1.2 Add `shortcut(id)` and the topmost-overlay DOM dispatcher in `App.vue`
- [x] 1.3 Prefer the focused form's submit button for `Mod+Enter`

## 2. Coverage

- [x] 2.1 Add shortcuts to dashboard chrome, search, selection, tabs, filters, sorting, and create menu
- [x] 2.2 Add shortcuts to MCP, account, interface, user, and hybrid-search dialogs
- [x] 2.3 Add shortcuts to the note editor, history/confirm layers, graph, selection links, backlinks, and link dialog
- [x] 2.4 Add tag-sidebar close/All/Untagged shortcuts
- [x] 2.5 Keep repeated per-row controls native and avoid unhandled hints

## 3. Reveal and typing behavior

- [x] 3.1 Reveal hints on Alt/Option and Ctrl/Cmd
- [x] 3.2 Ignore plain keys in inputs, textareas, selects, and contenteditable
- [x] 3.3 Allow modifier shortcuts while editing
- [x] 3.4 Close the topmost overlay with Escape

## 4. Tag sidebar icon

- [x] 4.1 Replace leaf indentation with a tag icon
- [x] 4.2 Keep parent expand/collapse arrows and remove depth padding

## 5. Verification

- [x] 5.1 Add shortcut label/event tests
- [x] 5.2 Run the full test suite
- [x] 5.3 Run the production build
- [x] 5.4 Browser-test Ctrl reveal, tabs, selection, create menu, search, editor mode, discard, and tag leaf icons

## 6. Archive

- [ ] 6.1 Archive after review
