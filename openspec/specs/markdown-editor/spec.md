# Markdown Editor

## Purpose

Makes markdown the explicit, sanitised, round-trippable format for text notes, with Visual and Source editing, Mermaid diagrams, rich-paste stripping, and canonical image references.

## Requirements

### Requirement: Sanitised markdown rendering

The system SHALL render note markdown through a single renderer used by the gallery, preview mode, and the rich editor. Rendering SHALL sanitise markdown and MUST strip exactly one leading properties fence before parsing. The renderer MUST NOT parse metadata from body text: `#` in the body is always a heading character or literal text, never a tag marker. Raw HTML in note markdown SHALL be escaped, not interpreted. Rendered HTML MUST be sanitised: scripts, styles, iframes, embedded objects, event-handler attributes, and unsafe URL schemes MUST be removed. GFM tables, task lists, strikethrough, fenced code, and line breaks SHALL be supported.

#### Scenario: Fence stripped before render

- **WHEN** content begins with a fence followed by `# Heading`
- **THEN** the output contains the heading markup and no fence text

#### Scenario: Render common markdown

- **WHEN** a note contains a heading, paragraphs, lists, a fenced code block, a table, bold/italic text, and a link
- **THEN** the gallery and preview render the corresponding semantic HTML
- **AND** the content is not escaped as literal markdown

#### Scenario: Strip unsafe HTML

- **WHEN** markdown contains a `<script>`, an inline `style`, an `onerror` handler, or an `iframe`
- **THEN** the rendered output contains none of them
- **AND** the note content itself is unchanged until the user edits it

#### Scenario: Body hash text renders literally

- **WHEN** a body contains `#project/alpha`
- **THEN** it renders as literal text or a heading per markdown rules
- **AND** no tag is created from it

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

Serialising the rich editor SHALL preserve headings, paragraphs, ordered and unordered lists, blockquotes, fenced code, inline code, horizontal rules, links, images, bold/italic text, and line breaks in canonical markdown. Serialising SHALL produce body-only markdown; the properties fence SHALL be written by a separate serializer and re-attached on save. The body editor MUST NEVER contain the fence. Switching between Visual and Source MUST NOT rewrite the fence or the body when the DOM is clean.

#### Scenario: Body editor excludes the fence

- **WHEN** a note with properties is opened
- **THEN** the contentEditable or textarea holds only the body
- **AND** the properties panel holds the fence values

#### Scenario: Serialize headings and lists

- **WHEN** the rich editor contains an `h2`, a bullet list, and an ordered list
- **THEN** the saved markdown contains `## `, `- ` items, and `1. ` items respectively

#### Scenario: Serialize code

- **WHEN** the rich editor contains a fenced code block and inline code
- **THEN** the saved markdown contains a fenced block and backtick-delimited inline code

#### Scenario: Save reassembles the file

- **WHEN** the user saves after editing body and tags
- **THEN** the stored content is fence plus body
- **AND** the fence reflects the panel's current values

### Requirement: Renderer compatibility

Existing markdown notes SHALL continue to render without migration. The `{width=N}` image extension and relative `/api/images/...` URLs SHALL work in gallery and preview. Internal-link placeholders (`[[...]]`) MAY be rendered as links when a resolver is supplied, but plain text otherwise.

#### Scenario: Existing note renders

- **WHEN** a pre-existing note containing headings, fenced code, images, and links is opened
- **THEN** it renders in the gallery and preview without changing the stored content

### Requirement: Editor chrome hosts mode switch, paste mode, and plain title

The note editor modal header SHALL show the title `Editor` for both new notes
and editing sessions, without a revision-number badge. The `● Live` collaboration badge SHALL remain next to the title when live text collaboration is active.
The bottom action row SHALL host the Visual/Source mode switch and the Paste
plain/rich select on the left, with the Save/Draft/Discard buttons on the right.

#### Scenario: Header title is simplified

- **WHEN** the user opens an existing note for editing
- **THEN** the modal header title reads `Editor`
- **AND** no revision number (e.g. `v2`) is displayed next to it

#### Scenario: New note header title

- **WHEN** the user opens the create-note modal
- **THEN** the modal header title also reads `Editor`

#### Scenario: Live badge retained

- **WHEN** a live shared draft is active while editing
- **THEN** the `● Live` badge is still shown next to the `Editor` title

#### Scenario: Editor controls sit at the bottom left

- **WHEN** the user opens the note editor modal
- **THEN** the mode switch and paste-mode select appear at the bottom left of the editor modal
- **AND** all mode-switch and paste-mode keyboard shortcuts continue to work

### Requirement: Visual and Source editor modes

The text-note editor SHALL provide exactly two editable modes: **Visual**
(rendered markdown in a contentEditable surface, with images displayed) and
**Source** (the canonical markdown in a monospace textarea). The user SHALL
switch modes from the bottom-left mode switch and with `Ctrl/Cmd+Shift+M`. Switching
modes MUST preserve the canonical markdown without data loss. The editor SHALL serialise the Visual surface only when it is dirty; merely opening a note or toggling modes MUST NOT rewrite content or trigger the unsaved-changes prompt.

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

### Requirement: Markdown formatting toolbar

The note editor SHALL provide a grouped toolbar with common markdown tools: bold, italic, strikethrough, inline code, link, wiki link, headings 1-3, blockquote, bulleted list, numbered list, task list, code block, table, and horizontal rule. The toolbar SHALL work in both Visual and Source editor modes. Clicking a tool MUST preserve the current editor or textarea selection and MUST update the canonical markdown through the existing serialization path.

Headings, blockquotes, and list formats SHALL toggle off when the current block or every selected line already uses the same format. Unordered, ordered, and task-list prefixes SHALL replace each other rather than stack.

#### Scenario: Format selected text in Visual mode

- **WHEN** the user selects text and presses Bold
- **THEN** the selected text is bolded in the editor
- **AND** saving writes `**selected text**` to the canonical markdown

#### Scenario: Format a source selection

- **WHEN** the user selects text in Source mode and presses Inline code
- **THEN** the selection is wrapped in backticks
- **AND** the textarea selection remains on the wrapped text

#### Scenario: Toggle a heading

- **WHEN** the caret is in a paragraph and the user chooses Heading 2
- **THEN** the block becomes an H2
- **AND** choosing Heading 2 again returns it to a paragraph

#### Scenario: Replace a list prefix

- **WHEN** the current line is a bulleted list item and the user chooses Numbered list
- **THEN** the line becomes an ordered list item without a duplicate bullet

### Requirement: Toolbar keyboard shortcuts

Each toolbar tool SHALL have a keyboard shortcut that performs the same action in Visual and Source modes. Shortcut handling MUST require Ctrl or Cmd, MUST NOT trigger during IME composition, and MUST call `preventDefault` so the browser does not apply a conflicting native action. Focused toolbar buttons and editor keydown handlers SHALL use one shared shortcut definition.

#### Scenario: Shortcut applies formatting

- **WHEN** the editor has focus and the user presses the Bold shortcut
- **THEN** the current selection is bolded
- **AND** no browser-native action runs

#### Scenario: IME composition is not interrupted

- **WHEN** text composition is active
- **THEN** toolbar shortcut handling does not run

### Requirement: Shortcut tooltips revealed by Alt

Toolbar buttons SHALL normally show the tool name on hover. While Alt/Option is held, hovering or focusing a toolbar button SHALL show its platform-appropriate shortcut instead (Cmd on macOS, Ctrl elsewhere, Option for Alt). The reveal state SHALL reset on keyup or window blur.

#### Scenario: Reveal shortcuts

- **WHEN** the user holds Alt and hovers a toolbar button
- **THEN** the tooltip shows that button's keyboard shortcut

#### Scenario: Normal tooltip

- **WHEN** Alt is not held and the user hovers a toolbar button
- **THEN** the tooltip shows the tool name

### Requirement: Modal link insertion

The editor SHALL use a modal dialog for both regular links and wiki links instead of a native browser prompt. The dialog SHALL support Visual and Source modes and MUST capture the editor or textarea selection before opening. Inserting a link MUST place it at that captured selection and use the canonical serialization path.

A regular link dialog SHALL provide Text and URL fields, prefilled from the current selection where available. Submitting SHALL insert `[text](url)`. Escape SHALL close the dialog without closing the note editor.

#### Scenario: Add a regular link

- **WHEN** the user selects text and chooses Link, edits the URL, and submits
- **THEN** the selected text becomes the link label and the URL is stored in the markdown
- **AND** the editor selection is replaced by the new link

#### Scenario: Cancel link insertion

- **WHEN** the link dialog is open and the user presses Escape
- **THEN** only the dialog closes
- **AND** the note editor remains open with its content unchanged

### Requirement: Wiki-link note suggestions

The wiki-link dialog SHALL search notes as the user types, using the same search endpoint as the gallery search bar, with debounced requests. It SHALL show matching note titles and types, support arrow-key navigation, and allow inserting a link to a typed title that does not match an existing note. Archived notes and the note currently being edited SHALL be excluded from suggestions.

Choosing an existing note SHALL insert a stable `[[note:<id>|label]]` link. A typed unmatched title SHALL insert `[[title]]` or `[[title|label]]`. When no label is provided, the note title SHALL be used.

#### Scenario: Link to an existing note

- **WHEN** the user types part of a note title and selects the result
- **THEN** the editor inserts a wiki link targeting that note id
- **AND** any text selected before opening the dialog becomes the display label

#### Scenario: Link to a new title

- **WHEN** the user types a title that matches no note and chooses the new-title option
- **THEN** a title-based wiki link is inserted
- **AND** it can be resolved later when that note is created

### Requirement: Wiki-link alias round-trip

Rendered wiki links SHALL expose both the link target and the display label to the editor serializer. Unresolved links with aliases SHALL serialize back to `[[target|label]]` instead of losing the target.

#### Scenario: Edit an unresolved aliased link

- **WHEN** a note contains `[[Missing note|alias]]` and the editor re-renders and saves
- **THEN** the canonical markdown still contains `[[Missing note|alias]]`

### Requirement: Plain-text paste default

Every text paste path SHALL default to `clipboardData.getData('text/plain')` and SHALL NOT read or convert `text/html` in plain mode. Line endings SHALL be normalised from `\r\n`/`\r` to `\n`; the text SHALL otherwise be inserted literally. Visual mode SHALL insert a text node at the selection and serialise it without rendering markdown syntax at paste time. Source mode SHALL insert the text at the textarea caret without reformatting. Dashboard/global plain paste SHALL open a new note with the plain text as canonical content. A clipboard image file MAY still be uploaded and inserted as a markdown image; it is the only non-text paste exception.

#### Scenario: Clipboard has HTML and plain text

- **WHEN** the clipboard contains both `text/html` and `text/plain` in plain mode
- **THEN** only the `text/plain` value is inserted
- **AND** the HTML is not converted to markdown
- **AND** Source shows exactly the plain text

#### Scenario: Paste into Visual

- **WHEN** the user pastes plain text into Visual mode
- **THEN** the text is inserted literally at the caret
- **AND** indentation and markdown characters are preserved
- **AND** the canonical markdown matches the pasted text

#### Scenario: Paste into Source

- **WHEN** the user pastes plain text into Source mode
- **THEN** the text is inserted at the textarea caret without reformatting
- **AND** the source keeps the exact pasted characters

#### Scenario: Global paste

- **WHEN** the user pastes while no editor is focused in plain mode
- **THEN** a new note opens with the plain text as its canonical content
- **AND** no HTML-derived formatting is added

#### Scenario: Paste an image file

- **WHEN** the clipboard contains an image file
- **THEN** the image is uploaded and a markdown image reference is inserted
- **AND** this is the only non-text paste path

### Requirement: Opt-in rich HTML paste

The editor toolbar SHALL expose a **Paste: plain / rich** switch, persisted per browser. Rich mode SHALL prefer `text/html`, convert it to markdown with `htmlToMarkdown`, and fall back to `text/plain` when conversion is empty. In Visual mode rich paste SHALL render the converted markdown; in Source mode it SHALL insert the converted markdown at the caret; dashboard/global rich paste SHALL open a note with converted markdown. Data-image references SHALL be uploaded before insertion.

`htmlToMarkdown` SHALL use double-tilde strikethrough, normalise common Google Docs/Word inline styles and normal-weight wrappers, promote headerless tables to GFM tables, flatten/pad merged table spans, fence `<pre>` without `<code>`, preserve image widths, and normalise list/task spacing. Formatting without a markdown equivalent (underline, highlight, colours, super/subscript) MAY become plain text.

#### Scenario: Rich mode converts HTML

- **WHEN** rich mode is selected and the clipboard contains HTML
- **THEN** the HTML is converted to markdown
- **AND** Visual shows the rendered result
- **AND** Source shows the converted markdown

#### Scenario: Rich mode falls back

- **WHEN** rich mode is selected but HTML conversion produces no text
- **THEN** the plain-text clipboard value is inserted instead

#### Scenario: Google Docs snippet

- **WHEN** HTML contains a normal-weight Google Docs `<b>` wrapper and inline bold spans
- **THEN** the wrapper is removed
- **AND** the bold span becomes `**...**`
- **AND** no stray empty bold markers remain

#### Scenario: Headerless and merged tables

- **WHEN** HTML contains a table without `<thead>`
- **THEN** the first row becomes the GFM header
- **AND** a table with colspan/rowspan is flattened/padded into aligned cells

#### Scenario: Strikethrough

- **WHEN** HTML contains `<s>gone</s>`
- **THEN** the converted markdown contains `~~gone~~`

#### Scenario: Preformatted text

- **WHEN** HTML contains `<pre>` without `<code>`
- **THEN** the converted markdown is a fenced code block
- **AND** indentation is preserved

### Requirement: Paste handling of whole files

When content pasted into the body editor begins with a valid properties fence, the system SHALL offer to split it into properties and body. Accepting SHALL populate the properties panel and keep only the body in the editor; declining SHALL paste the text literally into the body.

#### Scenario: Paste an Obsidian file

- **WHEN** a pasted payload starts with `---`, property lines, and `---`
- **THEN** the system offers to split the fence
- **AND** accepting moves the properties into the panel and the body into the editor

#### Scenario: Decline the split

- **WHEN** the user declines the split offer
- **THEN** the whole pasted text lands in the body
- **AND** no properties change

### Requirement: Literal single tildes

Rendered markdown SHALL treat a single `~` as literal text. Only the GFM `~~text~~` form SHALL produce strikethrough (`<del>`). Single tildes in paths such as `~/.config`, in prose, and in link destinations MUST NOT open or close a strikethrough span, and MUST survive a render→serialize round-trip unchanged.

#### Scenario: Paths with tildes

- **WHEN** a note contains `"~/.claude/settings.json": false` and `"~/.github/hooks": true`
- **THEN** Visual mode shows both paths as literal text
- **AND** no `<del>` spans the two lines
- **AND** Source mode still shows the original single tildes

#### Scenario: Real strikethrough

- **WHEN** a note contains `~~done~~`
- **THEN** Visual mode renders a `<del>done</del>`
- **AND** Source mode shows `~~done~~`

#### Scenario: Single-tilde pairs

- **WHEN** a note contains `~not struck~`
- **THEN** Visual mode shows the literal text `~not struck~`
- **AND** no `<del>` is produced

### Requirement: Clean mode and draft switching

Opening a note or switching between Visual and Source SHALL NOT rewrite canonical markdown. The Visual surface SHALL be serialised immediately after real edits and cleared from the "needs serialisation" state. Applying a shared draft snapshot SHALL render from canonical markdown and clear that state, because the surface is already in sync. `editorDirty` MUST represent only un-serialised DOM edits; unsaved-change detection SHALL compare the canonical note against its head separately.

#### Scenario: Clean switch

- **WHEN** a user opens a note and toggles Visual/Source without editing
- **THEN** the source text is byte-identical to the stored markdown
- **AND** no save prompt appears

#### Scenario: Switch a note with a shared draft

- **WHEN** a note has a shared draft and the user opens it, then switches to Source without editing
- **THEN** Source shows the draft markdown exactly
- **AND** single tildes are not rewritten as `~~`
- **AND** no content is duplicated

#### Scenario: Real edit then switch

- **WHEN** the user edits in Visual and switches to Source
- **THEN** the source contains the serialised edit
- **AND** paths retain single tildes
- **AND** the body is not duplicated
