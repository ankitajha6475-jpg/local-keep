## Why

Text notes are stored as markdown but edited through a contentEditable surface that only understands images and a few inline tags. Pasting rich HTML leaks colours/fonts/office markup, the gallery uses an ad-hoc regex renderer, and there is no way to see or edit the canonical markdown. This change makes markdown the explicit, sanitised, round-trippable format.

## What Changes

- Add a shared client-side markdown renderer (`marked` + `DOMPurify`) used by the gallery, preview mode, and the rich editor. Raw HTML is sanitised; scripts/styles/iframes/event handlers are forbidden.
- Add three editor modes with a toolbar toggle:
  - **Write**: existing contentEditable surface, now rendered from the full markdown renderer and serialised back to markdown.
  - **Markdown**: raw monospace textarea editing the canonical source.
  - **Preview**: read-only sanitised render.
- Extend markdown serialisation to headings, paragraphs, ordered/unordered lists, blockquotes, fenced code, inline code, horizontal rules, links, images, bold/italic, and the existing `{width=N}` image extension.
- Replace the rich-paste fallthrough with an explicit pipeline:
  - image clipboard items are uploaded and inserted as markdown refs;
  - `text/html` is converted with Turndown (+ GFM), stripping styles/classes/scripts;
  - `text/plain` is preserved;
  - `data:image/*` sources are uploaded and rewritten to `/api/images/<hash>.<ext>`.
- Normalise text-note images on save: any remaining `data:image` in markdown is uploaded and replaced with a content-addressed URL.
- Keep the existing image resize/click interaction and broken-image-to-markdown behaviour.
- Add renderer/paste tests using a DOM test environment.

## Capabilities

### New Capabilities

- `markdown-editor`: Canonical markdown storage, sanitised rendering, Write/Markdown/Preview modes, rich-paste normalisation, and markdown image references.

### Modified Capabilities

<!-- No existing spec covers markdown rendering or text-note editing. `text-note-images`
     remains the image-storage contract; this change only makes the markdown refs canonical. -->

## Impact

- **Affected code**:
  - `src/App.vue`: editor mode state/toolbar, renderer usage, paste handlers, image normalisation, serializer extensions, gallery preview, internal link click hook.
  - New `src/utils/markdown.js` (renderer + Turndown + sanitisation) and tests.
  - `src/shared/notesText.js`: may add small helpers used by the renderer.
  - `package.json` / lockfile: `marked`, `dompurify`, `turndown`, `turndown-plugin-gfm`; dev `happy-dom` for renderer tests.
- **No server/database change**; content remains markdown. The server keeps indexing plain text via `markdownToText`.
- **Security**: all rendered HTML is sanitised client-side; raw scripts/styles/iframes are removed before insertion.
- **Compatibility**: existing markdown remains valid; `{width=N}` stays a Local Keep extension.
