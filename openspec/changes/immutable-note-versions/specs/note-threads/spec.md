## ADDED Requirements

### Requirement: Version display on the History button

The editor's History button SHALL display the current note's revision number as a visible version badge/bubble. The badge MUST update when the head revision changes (save, restore, promote, or a remote revision) and MUST reflect the note's `revision_no`, not a client-side counter.

#### Scenario: Show current version

- **WHEN** a note whose head is revision number 3 is opened in the editor
- **THEN** the History button shows a version badge reading `3`

#### Scenario: Badge advances on save

- **WHEN** the user saves an edit that creates revision 4
- **THEN** the History button badge reads `4`

#### Scenario: Badge reflects restore

- **WHEN** the user restores an old revision and the head becomes a new revision number
- **THEN** the badge shows the new head revision number

### Requirement: Automatic version-chain links

When a revision is appended, the system SHALL automatically create a link between the new revision and its parent revision (the old→new version chain). Version-chain links MUST be derived from `parent_revision_id`, MUST NOT be written into note content, and MUST be surfaced in the note's history/backlinks views. Restores and promotes, which append revisions, MUST also produce these links.

#### Scenario: Save creates a version link

- **WHEN** a save appends revision `R3` with parent `R2`
- **THEN** a version link from `R2` to `R3` exists and is visible in the note's history
- **AND** no text is added to the note body

#### Scenario: Restore creates a version link

- **WHEN** restoring revision `R1` appends revision `R5`
- **THEN** a version link connects the prior head to `R5` in the version chain

### Requirement: Permanent addressable versions

Every revision SHALL be permanently addressable by its revision id for the lifetime of the note. A version referenced by a link MUST remain readable and unchanged even after later revisions are created. Purging a note is the only operation that removes its revisions.

#### Scenario: Referenced version survives new edits

- **WHEN** note A references revision `R2` of note B and B is later edited to revision `R3`
- **THEN** revision `R2` is still readable and its content is unchanged
