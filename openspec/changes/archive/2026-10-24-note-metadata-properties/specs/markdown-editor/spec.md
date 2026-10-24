# Markdown Editor — Delta

## MODIFIED Requirements

### Requirement: Sanitised markdown rendering

Rendering SHALL sanitise markdown and MUST strip exactly one leading properties fence before parsing. The renderer MUST NOT parse metadata from body text: `#` in the body is always a heading character or literal text, never a tag marker. Raw HTML in note markdown SHALL be escaped, not interpreted.

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

### Requirement: Serializer fidelity

Serialising the editor SHALL produce body-only markdown; the properties fence SHALL be written by a separate serializer and re-attached on save. The body editor MUST NEVER contain the fence. Switching between Visual and Source MUST NOT rewrite the fence or the body when the DOM is clean.

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

## ADDED Requirements

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
