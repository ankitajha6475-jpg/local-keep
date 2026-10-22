## Why

Rich clipboard HTML conversion is useful when it preserves structure, but it was the default and it is lossy. The user could see formatting in Visual that Source could not represent. Paste now defaults to exact plain text; HTML conversion should remain available as an explicit, opt-in mode for snippets where markdown semantics clearly exist.

## What Changes

- Paste SHALL default to `text/plain` and insert it literally in Visual or Source. Source remains a faithful record of the pasted text.
- Add an editor toolbar switch **Paste: plain / rich**, persisted per browser in localStorage. Plain is the default; rich is opt-in.
- Rich mode SHALL convert `text/html` through the improved Turndown + GFM converter and insert rendered markdown in Visual or converted markdown in Source.
- Improve `htmlToMarkdown` robustness:
  - double-tilde strikethrough (`~~text~~`);
  - Google Docs/Word normal-weight wrappers and inline `font-weight`/`font-style`/`line-through` styles;
  - tables without a header row are promoted to GFM tables;
  - colspan/rowspan are flattened/padded because GFM tables cannot express spans;
  - `<pre>` without `<code>` becomes a fenced block;
  - image widths become `{width=N}`;
  - task-list and list spacing normalized.
- Keep clipboard image files as the one non-text exception.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-editor`: default plain-text paste plus optional rich HTML conversion.

## Impact

- **Affected code**:
  - `src/App.vue` — `pasteMode`, toolbar switch, plain/rich paste paths, `insertMarkdownAsRich`.
  - `src/utils/markdown.js` — `htmlToMarkdown` normalisation and rules.
  - `tests/markdown.test.js`.
  - `AGENTS.md`, `README.md`, `CHANGELOG.md`.
- **Behaviour**: plain mode is exact and lossless; rich mode is convenient but lossy for underline/highlight/colours/super-subscript and complex merged tables.
- **No schema/API changes.**
