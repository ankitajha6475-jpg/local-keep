## REMOVED Requirements

### Requirement: Rich-paste normalisation
**Reason**: Replaced by a default plain-text mode plus an explicit rich HTML conversion mode. HTML conversion is lossy and should not determine canonical content unless the user opts in.
**Migration**: Plain mode reads `text/plain` and inserts literally. Rich mode is selected from the editor toolbar and converts `text/html` through Turndown + GFM. Clipboard image files remain an exception.

## ADDED Requirements

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
