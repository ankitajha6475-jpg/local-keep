## MODIFIED Requirements

### Requirement: Visual and Source editor modes

The text-note editor SHALL provide exactly two editable modes: **Visual**
(rendered markdown in a contentEditable surface, with images displayed) and
**Source** (the canonical markdown in a textarea). The editor SHALL open every
note in **Source** mode by default; Visual SHALL be one explicit switch away. The
user SHALL switch modes from the bottom-left mode switch and with
`Ctrl/Cmd+Shift+M`. Switching modes MUST preserve the canonical markdown without
data loss. The editor SHALL serialise the Visual surface only when it is dirty;
merely opening a note or toggling modes MUST NOT rewrite content or trigger the
unsaved-changes prompt.

#### Scenario: New note opens in Source

- **WHEN** the user opens a new note editor
- **THEN** the Source textarea is the active editing surface
- **AND** the Source mode button is shown as active

#### Scenario: Existing note opens in Source

- **WHEN** the user opens an existing text note
- **THEN** the canonical markdown is shown in the Source textarea
- **AND** switching to Visual renders the same markdown

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
