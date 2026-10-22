## 1. Shared definitions

- [x] 1.1 Add `src/shared/editorTools.js` with grouped tools, labels, icons, key codes, modifier flags, and shortcut labels
- [x] 1.2 Add `matchEditorShortcut(event)` using `event.code` plus explicit Shift/Alt flags
- [x] 1.3 Add unit tests for matching, modifier rejection, and tool coverage

## 2. Toolbar UI

- [x] 2.1 Add `MarkdownToolbar.vue` with grouped buttons and accessible labels
- [x] 2.2 Show the tool name on hover and the platform shortcut while Alt/Option is held
- [x] 2.3 Replace the four-button row in `App.vue` while keeping the image action
- [x] 2.4 Prevent `mousedown` so toolbar clicks preserve the editor/textarea selection

## 3. Editor commands

- [x] 3.1 Implement Visual commands: bold, italic, strike, inline code, link, wiki link, headings 1-3, quote, bullet/numbered/task lists, code block, table, horizontal rule
- [x] 3.2 Implement Source-mode selection and line transforms for the same command set
- [x] 3.3 Toggle headings/quotes/lists and replace competing list prefixes
- [x] 3.4 Wire keyboard shortcuts in both modes with `preventDefault`/`stopPropagation`
- [x] 3.5 Track Alt/Option keydown/keyup/blur to reveal shortcut tooltips

## 4. Verification and docs

- [x] 4.1 Run `npm test` and `npm run build`
- [x] 4.2 Manually verify each tool in Visual and Source, including selection preservation and Alt tooltips
- [x] 4.3 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 4.4 Run `openspec validate --strict` and archive the change
