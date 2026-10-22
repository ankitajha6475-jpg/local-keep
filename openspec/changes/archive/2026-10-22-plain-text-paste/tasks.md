## 1. Plain-text paste

- [x] 1.1 Add `insertPlainTextAtCursor` for Visual and Source insertion
- [x] 1.2 Make plain mode read only `text/plain` and insert literally
- [x] 1.3 Make dashboard/global plain paste open a new note with plain text
- [x] 1.4 Keep clipboard image-file upload as the sole non-text exception

## 2. Rich HTML mode

- [x] 2.1 Add `pasteMode` (plain/rich) persisted per browser and a toolbar switch
- [x] 2.2 Rich Visual paste converts HTML and inserts rendered markdown
- [x] 2.3 Rich Source paste converts HTML and inserts converted markdown
- [x] 2.4 Rich global paste opens a note with converted markdown
- [x] 2.5 Preserve image-file upload in both modes

## 3. Converter robustness

- [x] 3.1 Use double-tilde strikethrough
- [x] 3.2 Normalise Google Docs/Word wrappers and inline styles
- [x] 3.3 Promote headerless tables and flatten/pad spans
- [x] 3.4 Fence `<pre>` without `<code>`
- [x] 3.5 Preserve image widths and normalize list/task spacing
- [x] 3.6 Add converter regression tests

## 4. Verification and docs

- [x] 4.1 Verify plain mode ignores `text/html` and preserves `text/plain`
- [x] 4.2 Verify rich mode converts `text/html` and falls back to plain
- [x] 4.3 Run the full test suite and build
- [x] 4.4 Update `AGENTS.md`, `README.md`, and `CHANGELOG.md`
- [x] 4.5 Run `openspec validate --strict`
- [ ] 4.6 Archive after review
