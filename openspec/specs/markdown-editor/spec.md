# Markdown Editor

## Purpose

Makes markdown the explicit, sanitised, round-trippable format for text notes, with source and preview modes, rich-paste stripping, and canonical image references.

## Requirements

### Requirement: Sanitised markdown rendering

The system SHALL render note markdown through a single renderer used by the gallery, preview mode, and the rich editor. Rendered HTML MUST be sanitised: scripts, styles, iframes, embedded objects, event-handler attributes, and unsafe URL schemes MUST be removed. GFM tables, task lists, strikethrough, fenced code, and line breaks SHALL be supported.

#### Scenario: Render common markdown

- **WHEN** a note contains a heading, paragraphs, lists, a fenced code block, a table, bold/italic text, and a link
- **THEN** the gallery and preview render the corresponding semantic HTML
- **AND** the content is not escaped as literal markdown

#### Scenario: Strip unsafe HTML

- **WHEN** markdown contains a `<script>`, an inline `style`, an `onerror` handler, or an `iframe`
- **THEN** the rendered output contains none of them
- **AND** the note content itself is unchanged until the user edits it

### Requirement: Editor mode switch

The text-note editor SHALL provide Write, Markdown, and Preview modes, selectable from the editor toolbar and by `Ctrl/Cmd+Shift+M` cycling. Switching modes MUST preserve the canonical markdown without data loss.

#### Scenario: Round-trip through all modes

- **WHEN** a user edits content in Write, switches to Markdown, edits the source, switches to Preview, and returns to Write
- **THEN** the canonical markdown contains every edit
- **AND** no formatting is silently dropped

#### Scenario: Preview is read-only

- **WHEN** the editor is in Preview mode
- **THEN** the rendered content is visible
- **AND** it cannot be edited until the user switches back to Write or Markdown

### Requirement: Markdown source editing

In Markdown mode the canonical source SHALL be editable in a monospace textarea, including image references such as `![alt](/api/images/<hash>.<ext>)`. Image insertion from the toolbar SHALL insert a markdown reference at the cursor.

#### Scenario: Insert an image in Markdown mode

- **WHEN** the user inserts an image while in Markdown mode
- **THEN** a markdown image reference is inserted at the cursor
- **AND** the uploaded file is served from `/api/images/<hash>.<ext>`

### Requirement: Rich-paste normalisation

Pasting into the editor SHALL remove rich context. HTML clipboard content MUST be converted to markdown; inline colours, fonts, classes, scripts, styles, and office-specific markup MUST be discarded. Plain text MUST be preserved. Image clipboard items and `data:image/*` sources MUST be uploaded and converted to markdown image references. The same normalisation SHALL apply to global paste that creates a new note.

#### Scenario: Paste styled HTML

- **WHEN** the user pastes rich HTML from a web page or office document
- **THEN** the inserted content is markdown with no inline styles or classes
- **AND** headings, lists, links, code, and images retain their semantic structure where representable

#### Scenario: Paste an image

- **WHEN** the clipboard contains an image file
- **THEN** the image is uploaded once to content-addressed storage
- **AND** a markdown image reference is inserted

#### Scenario: Paste plain text

- **WHEN** the clipboard contains only plain text
- **THEN** the text is inserted unchanged apart from line-ending normalisation

### Requirement: Canonical markdown image references

Text-note content MUST store images as markdown references, never as base64 data URLs. On save, any remaining `data:image/*` reference in markdown SHALL be uploaded and rewritten to `/api/images/<hash>.<ext>`. The existing `{width=N}` extension SHALL remain supported.

#### Scenario: Normalise a legacy data URL

- **WHEN** a note is saved with `![x](data:image/png;base64,...)`
- **THEN** the saved content contains `![x](/api/images/<hash>.png)`
- **AND** the image is retrievable from that URL

#### Scenario: Preserve image width

- **WHEN** content contains `![x](/api/images/abc.png){width=320}`
- **THEN** the rendered image uses width 320
- **AND** the markdown source still contains the width extension

### Requirement: Serializer fidelity

Serialising the rich editor SHALL preserve headings, paragraphs, ordered and unordered lists, blockquotes, fenced code, inline code, horizontal rules, links, images, bold/italic text, and line breaks in canonical markdown.

#### Scenario: Serialize headings and lists

- **WHEN** the rich editor contains an `h2`, a bullet list, and an ordered list
- **THEN** the saved markdown contains `## `, `- ` items, and `1. ` items respectively

#### Scenario: Serialize code

- **WHEN** the rich editor contains a fenced code block and inline code
- **THEN** the saved markdown contains a fenced block and backtick-delimited inline code

### Requirement: Renderer compatibility

Existing markdown notes SHALL continue to render without migration. The `{width=N}` image extension and relative `/api/images/...` URLs SHALL work in gallery and preview. Internal-link placeholders (`[[...]]`) MAY be rendered as links when a resolver is supplied, but plain text otherwise.

#### Scenario: Existing note renders

- **WHEN** a pre-existing note containing headings, fenced code, images, and links is opened
- **THEN** it renders in the gallery and preview without changing the stored content
