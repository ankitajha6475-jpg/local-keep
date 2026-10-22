## Context

Paste previously preferred `text/html` and converted it through Turndown. That is useful for meaningfully structured snippets (headings, lists, tables, code, links), but it is lossy and made Visual formatting hard to reconcile with Source. The user asked for exact plain-text paste by default, plus an optional switch for rich conversion if it is robust enough.

## Goals / Non-Goals

**Goals:**
- Plain text is the default and is inserted literally.
- Source shows exactly the pasted plain text.
- Rich HTML conversion is opt-in from the editor toolbar and persisted per browser.
- Improve the converter so common HTML (Google Docs, tables, code, lists, styles) converts meaningfully.
- Keep clipboard image-file upload.

**Non-Goals:**
- Perfect HTML fidelity. Markdown cannot represent underline, highlight, colours, super/subscript, or merged table spans.
- A server-side or account-wide preference. The switch is per browser.
- Converting HTML when the user explicitly chose plain mode.

## Decisions

### Decision 1: Plain is the default; rich is a toolbar switch

`pasteMode` is `plain` or `rich`, initialized from `localStorage['local-keep-paste-mode']` and defaulting to `plain`. The editor toolbar exposes a compact select. Image-file clipboard items are handled before text in both modes.

### Decision 2: Plain mode inserts literally

Plain mode reads only `text/plain`. Visual inserts a text node (`white-space: pre-wrap`); Source inserts at the textarea caret. Only line endings are normalised. No HTML conversion or data-URL upload occurs at paste time; save still normalises images.

### Decision 3: Rich mode uses the improved converter

Rich mode prefers `text/html`, falls back to plain text if conversion is empty, uploads data-image references, and inserts:
- Visual: rendered HTML from `renderMarkdown` (`insertMarkdownAsRich`), then serialises.
- Source: converted markdown at the caret (`insertMarkdownAtCursor`).
- Global/dashboard: opens a note with converted markdown.

### Decision 4: `htmlToMarkdown` normalises problematic markup

- Parse with `DOMParser`; remove scripts/styles/meta/links/iframes/objects/embeds.
- Convert inline `font-weight` (bold), `font-style` (italic), and `line-through` to semantic elements; unwrap Google Docs normal-weight `<b>/<strong>` wrappers.
- Promote a table's first row to `<thead>` when missing; convert header `td` to `th`; flatten colspan into empty cells and pad short rows (rowspan cannot be represented exactly).
- Use `~~` for strikethrough (Turndown's GFM rule uses a single `~`, which our renderer treats literally).
- Fence `<pre>` without `<code>`.
- Preserve image widths as `{width=N}`.
- Normalise list/task spacing after conversion.
- Unsupported presentation (underline, highlight, sup/sub, colours) becomes plain text.

### Decision 5: Document the lossiness

Rich mode is an explicit opt-in. The docs and UI title say it converts HTML; the default plain mode is the exactness guarantee. Complex merged tables are approximated, not reproduced.

## Risks / Trade-offs

- **[Risk] Rich conversion changes source from the pasted HTML** — opt-in and labelled; plain remains default.
- **[Risk] Google Docs/Word markup is inconsistent** — style normalisation covers common bold/italic/strike/normal wrappers; unsupported styling becomes text.
- **[Risk] Merged tables lose exact layout** — flattened/padded approximation; documented.
- **[Risk] localStorage unavailable** — falls back to plain in memory.

## Migration Plan

None.

## Open Questions

None.
