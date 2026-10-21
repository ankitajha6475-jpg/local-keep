## Context

See `proposal.md` and `specs/markdown-editor/spec.md`.

The current editor is a contentEditable div with a hand-written serializer that understands images, bold/italic, links, divs and breaks. The gallery uses an escaped-string regex renderer. This works for simple notes but cannot represent headings, lists, code, tables, or sanitised rich-paste content. Note content is already stored as markdown, so no storage migration is needed.

## Goals / Non-Goals

**Goals:**

- One sanitised renderer for gallery, preview, and rich-editor rendering.
- Three explicit modes with lossless round-tripping to canonical markdown.
- Deterministic rich-paste normalisation and image upload.
- Preserve the existing image click/resize/broken-image behaviour.
- Keep the server and database unchanged.

**Non-Goals:**

- A full WYSIWYG editor with every markdown construct (e.g. nested tables).
- Collaborative text editing or Markdown source syntax highlighting.
- Server-side HTML rendering.
- Changing image storage or cleanup semantics.

## Decisions

### D1: `marked` + `DOMPurify`, not a hand-written renderer

Use a local `new Marked({ gfm: true, breaks: true })` instance and sanitise with DOMPurify. Marked v18 removed `headerIds`/`mangle`/`sanitize`; do not use them. DOMPurify is configured with an allow-list, `FORBID_TAGS` for `script/style/iframe/object/embed`, and `ADD_ATTR` for `data-md`, `data-width`, `data-note-id`, `data-note-label`, `target`, `rel`.

**Alternatives:** keep the regex renderer (rejected: unsafe and incomplete); use markdown-it (viable, but marked is already selected and smaller to wire).

### D2: Renderer module is client-only

`src/utils/markdown.js` imports DOMPurify/Turndown and therefore runs only in the browser bundle. Server-side plain-text extraction stays in `src/shared/notesText.js` (`markdownToText`), which has no DOM dependency.

### D3: Three modes, one canonical string

`newNoteContent` remains the single canonical markdown string. Each mode is a view over it:

- Write: render markdown to HTML into the contentEditable; serialise back on input/blur/mode switch.
- Markdown: `<textarea v-model="newNoteContent">`.
- Preview: `v-html="renderMarkdown(newNoteContent)"`.

Switching from Write first calls the serializer. Switching to Write re-renders from markdown. No mode owns a separate copy.

### D4: Paste pipeline

In Write mode:

1. image files → upload → insert image node with `data-md`;
2. `text/html` → Turndown → markdown → upload data-URL images → render markdown to sanitised HTML → insert at cursor;
3. `text/plain` → insert as text.

In Markdown mode: image files → upload → insert markdown at cursor; HTML → Turndown → insert markdown text at cursor; plain text → insert.

Global paste (outside the editor) uses `text/html` → Turndown or `text/plain`, then creates a note with the cleaned markdown.

Turndown is configured with ATX headings, `-` bullets, fenced code, inline links, and GFM tables; `script/style/meta/link/iframe` are removed.

### D5: Serializer extensions

Extend `serializeEditorToMarkdown` to handle:

- `H1`–`H6` → `#`…`######`
- `P` → block + blank line
- `UL`/`OL`/`LI` → `- ` or `1. ` (ordered index)
- `BLOCKQUOTE` → `> ` on each line
- `PRE` → fenced code block
- `CODE` → backtick inline
- `HR` → `---`
- `A` → markdown link, or `[[note:<id>|label]]` when `data-note-id` exists
- `SPAN.note-link` → `[[target]]`/`[[note:<id>|label]]`
- existing `IMG`, `B/STRONG`, `I/EM`, `DIV`, `BR`

Normalise trailing whitespace and cap blank-line runs at two.

### D6: Width extension

Preprocess `![alt](url){width=N}` outside code fences into the image renderer’s `title` slot (`"local-keep-width=N"`), and have the renderer emit `data-md="![alt](url){width=N}"`, `data-width="N"`, `width="N"`. The serializer reconstructs the same extension. This keeps standard markdown valid while preserving the Local Keep convenience.

### D7: Internal link hook, not a full relationships feature

The renderer accepts an optional `resolveLink(target, label)` and turns `[[...]]` into `<a class="note-link" data-note-id data-note-label href="#">`. Unresolved targets become `.note-link--broken` spans. The relationships change will supply the resolver/UI; this change only provides the hook and preserves round-tripping.

### D8: Image normalisation on save

Before `PUT`, scan markdown outside code for `data:image/*` image sources, upload each with the existing `/api/images` endpoint, and replace with the returned URL. Upload failures leave the original data URL and surface a notice rather than losing content.

## Risks / Trade-offs

- **ContentEditable quirks** → keep Write mode’s existing image handlers; serializer tests cover round-trips; switching modes always re-renders from markdown.
- **Marked/DOMPurify version drift** → pin versions and test sanitisation; do not rely on removed marked options.
- **Table/lists serialisation loss** → support the common constructs; unsupported nodes fall back to their text content, which is still better than losing the note.
- **Large pasted images** → upload before insertion; existing 20 MB multer cap applies.
- **Renderer bundle size** → marked/DOMPurify/Turndown are small relative to Excalidraw; build size is checked.
- **Preview XSS** → DOMPurify allow-list and forbidden tags; tests include script/style/onerror payloads.

## Migration Plan

No data migration. Existing markdown is rendered as-is; unsupported syntax remains text. Deploy as a frontend change; server restart is not required. If a rendering regression is found, revert the client bundle; stored content is unchanged.

## Open Questions

None blocking. The relationships change will define the final wiki-link resolver and click navigation.
