## REMOVED Requirements

### Requirement: Editor mode switch
**Reason**: Replaced by the Visual/Source-only editor with dirty-aware serialization.
**Migration**: Use the Visual and Source modes; there is no Preview mode, and the gallery is the read-only surface.

## MODIFIED Requirements

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

## ADDED Requirements

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
