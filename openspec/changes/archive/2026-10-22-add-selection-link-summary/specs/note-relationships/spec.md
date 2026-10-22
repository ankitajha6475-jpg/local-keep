## ADDED Requirements

### Requirement: Bulk link summary for selected notes

The system SHALL expose a read-only bulk relationship summary for a set of note ids. The summary MUST group outgoing links by resolved target note (or by status + target label when unresolved/ambiguous) and backlinks by source note. Each group MUST include the linked note's id (when resolved), title/display title, type, archived state, link status, and at least one context snippet. Duplicate note ids MUST NOT duplicate groups. A request with no valid ids SHALL return empty groups.

Archived source notes SHALL be excluded from backlinks unless `includeArchived` is requested. Archived targets SHALL still appear in outgoing groups and be marked archived.

#### Scenario: Summarise several selected notes

- **WHEN** notes A and B are selected, A links to C and D links to both A and B
- **THEN** the outgoing groups contain C once with A as its source
- **AND** the incoming groups contain D once with links to A and B
- **AND** each group includes a context snippet

#### Scenario: Unresolved target

- **WHEN** a selected note contains `[[Missing note]]`
- **THEN** the outgoing summary includes an `unresolved` entry labelled `Missing note`
- **AND** the entry has no target note id

#### Scenario: Archived relationships

- **WHEN** a selected note links to an archived note
- **THEN** the outgoing group is marked archived
- **AND** backlinks from archived sources appear only when `includeArchived` is true

### Requirement: Selection links UI

The gallery's multi-note selection bar SHALL offer a link-summary action. The resulting panel SHALL show both directions by default and SHALL allow switching between both, outgoing only, and incoming only. Rows SHALL open the related note, SHALL show archived/unresolved/ambiguous status, and SHALL NOT open archived or unresolved entries. Opening a related note while the editor has unsaved changes SHALL require confirmation.

#### Scenario: List links for a selection

- **WHEN** the user selects notes and chooses the link-summary action
- **THEN** the panel lists the notes they link to and the notes linking to them
- **AND** clicking a resolved active row opens that note

#### Scenario: Filter direction

- **WHEN** the user switches the panel to "Linked from"
- **THEN** only incoming sources are listed
