## ADDED Requirements

### Requirement: Per-note color metadata

Notes SHALL support an optional dashboard tint stored as `notes.color`. Valid values SHALL be `blue`, `green`, `amber`, `rose`, `violet`, or `slate`; `NULL` SHALL mean the note-type default (blue text notes, violet whiteboards). Color SHALL be presentation metadata: changing it SHALL NOT create a revision and SHALL NOT change `updatedAt`. The tint SHALL survive normal head edits, archive, restore, and reload. Unknown values SHALL be rejected with a 400 error. Authenticated clients SHALL receive the color in note DTOs and a `note-color` WebSocket event when another client changes it.

#### Scenario: Persist a tint

- **WHEN** a client sets a note to `green`
- **THEN** subsequent note lists and detail reads return `green`
- **AND** editing the note content preserves `green`
- **AND** no new revision is created by the color change

#### Scenario: Reset to the type default

- **WHEN** a client sets the color to `null` or `default`
- **THEN** the note stores `NULL`
- **AND** text notes use the blue default and whiteboards use the violet default

#### Scenario: Reject an unknown color

- **WHEN** a client sends `neon`
- **THEN** the request fails with 400 `invalid_note_color`
- **AND** the previous tint remains

#### Scenario: Sync another dashboard

- **WHEN** one client changes a note color
- **THEN** connected clients update that card without reloading

### Requirement: Dashboard color picker

The dashboard SHALL show a color picker immediately to the right of each normal note's selection checkbox. The picker SHALL offer Default plus the six palette tints, show the current selection, expose accessible labels, and apply changes optimistically with rollback and a notice on failure. The picker SHALL close on outside click and Escape.

#### Scenario: Choose a tint

- **WHEN** the user opens the card palette and selects Amber
- **THEN** the card immediately uses the amber surface, border, and accent
- **AND** the palette icon reflects amber
- **AND** the selection is persisted through the color endpoint

#### Scenario: Dismiss the palette

- **WHEN** the palette is open and the user clicks elsewhere or presses Escape
- **THEN** the palette closes without changing the color

#### Scenario: Failed update

- **WHEN** the color request fails
- **THEN** the card returns to its previous tint
- **AND** a notice explains the failure

### Requirement: Read-only Quick Shortcuts card

The Quick Shortcuts tile SHALL be rendered as a read-only virtual note through the normal note-card path rather than a bespoke card template. It SHALL use the standard note preview scrollbar and card tint/spacing, SHALL remain first in the grid, and SHALL NOT have a selection checkbox, color picker, copy action, or delete/restore action. Clicking it SHALL NOT select it or open an editor, and it SHALL NOT appear in note counts or Select All.

#### Scenario: Normal card appearance

- **WHEN** the dashboard renders
- **THEN** the Quick Shortcuts tile uses the same card tint and `.note-preview` scrollbar as other notes
- **AND** its shortcut keys are shown as inline code

#### Scenario: Read-only controls

- **WHEN** the user inspects the Quick Shortcuts tile
- **THEN** there is no selection checkbox, color picker, copy button, or delete/restore button

#### Scenario: No editing or selection

- **WHEN** the user clicks the Quick Shortcuts tile
- **THEN** no editor opens
- **AND** the note is not added to the selection

#### Scenario: Excluded from note operations

- **WHEN** the user chooses Select All or reads the note count
- **THEN** the Quick Shortcuts virtual note is not included
