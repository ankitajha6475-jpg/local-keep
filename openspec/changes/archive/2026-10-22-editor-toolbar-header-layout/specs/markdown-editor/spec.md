# Markdown Editor (delta)

## ADDED Requirements

### Requirement: Editor chrome hosts mode switch, paste mode, and plain title

The note editor modal header SHALL show the title `Editor` for both new notes
and editing sessions, without a revision-number badge. The `● Live` collaboration
badge SHALL remain next to the title when live text collaboration is active.
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

## MODIFIED Requirements

### Requirement: Visual and Source editor modes

The text-note editor SHALL provide exactly two editable modes: **Visual**
(rendered markdown in a contentEditable surface, with images displayed) and
**Source** (the canonical markdown in a monospace textarea). The user SHALL
switch modes from the bottom-left mode switch and with `Ctrl/Cmd+Shift+M`. Switching
modes MUST preserve the canonical markdown without data loss. The editor SHALL
serialise the Visual surface only when it is dirty; merely opening a note or
toggling modes MUST NOT rewrite content or trigger the unsaved-changes prompt.

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
