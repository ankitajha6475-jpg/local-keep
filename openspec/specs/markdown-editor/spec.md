# Markdown Editor

## Purpose

Makes markdown the explicit, sanitised, round-trippable format for text notes, with Visual and Source editing, Mermaid diagrams, rich-paste stripping, and canonical image references.

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

### Requirement: Markdown source editing

In Source mode the canonical source SHALL be editable in a monospace textarea, including image references such as `![alt](/api/images/<hash>.<ext>)`. Source mode SHALL show image URLs rather than rendered images. Image insertion from the toolbar SHALL insert a markdown reference at the cursor in Source and a rendered image in Visual.

#### Scenario: Insert an image in Markdown mode

- **WHEN** the user inserts an image while in Source mode
- **THEN** a markdown image reference is inserted at the cursor
- **AND** the uploaded file is served from `/api/images/<hash>.<ext>`

#### Scenario: Switch modes with images

- **WHEN** a note containing images is switched between Visual and Source
- **THEN** Visual displays the images
- **AND** Source shows the markdown references
- **AND** neither mode rewrites the image URLs

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

### Requirement: Visual and Source editor modes

The text-note editor SHALL provide exactly two editable modes: **Visual** (rendered markdown in a contentEditable surface, with images displayed) and **Source** (the canonical markdown in a monospace textarea). The user SHALL switch modes from the toolbar and with `Ctrl/Cmd+Shift+M`. Switching modes MUST preserve the canonical markdown without data loss. The editor SHALL serialise the Visual surface only when it is dirty; merely opening a note or toggling modes MUST NOT rewrite content or trigger the unsaved-changes prompt.

#### Scenario: Round-trip through all modes

- **WHEN** a user edits content in Visual, switches to Source, edits the source, and returns to Visual
- **THEN** the canonical markdown contains every edit
- **AND** no formatting is silently dropped

#### Scenario: Preview is read-only

- **WHEN** the user views a note in the gallery
- **THEN** the rendered content is visible
- **AND** it cannot be edited there; editing happens in Visual or Source

#### Scenario: Clean mode switch

- **WHEN** a user opens a note and toggles Visual/Source without editing
- **THEN** the note is not marked dirty
- **AND** no save prompt appears
- **AND** the stored markdown is unchanged

### Requirement: Mermaid diagram rendering

Fenced ` ```mermaid ` blocks SHALL render as SVG in Visual and gallery views. The renderer SHALL emit a skeleton and hydrate it after insertion by lazy-loading Mermaid. Source mode SHALL keep the fenced source visible. Invalid Mermaid MUST show an inline error and keep the source visible without breaking the note.

#### Scenario: Render a diagram in Visual mode

- **WHEN** a note contains a valid fenced mermaid block
- **THEN** Visual and gallery views show an SVG diagram
- **AND** Source mode shows the original fence

#### Scenario: Invalid diagram

- **WHEN** a mermaid block cannot be parsed
- **THEN** the block shows an inline error
- **AND** the mermaid source remains visible
- **AND** the rest of the note still renders

### Requirement: Dirty-state and save discipline

`newNoteContent` SHALL be the single canonical markdown string for an open note. The editor MUST serialise the Visual surface only after real edits. Save SHALL normalise `data:image` references and upload them before persisting; an upload failure MUST abort the save with a visible notice rather than silently storing base64.

#### Scenario: Real edit marks dirty

- **WHEN** the user changes text or inserts an image in Visual mode
- **THEN** the note becomes dirty
- **AND** switching modes serialises the current Visual content

#### Scenario: Image upload fails on save

- **WHEN** saving a note requires uploading a pasted image and the upload fails
- **THEN** the save is aborted
- **AND** the user sees an error instead of a base64-persisted note
