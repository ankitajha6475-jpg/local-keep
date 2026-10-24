# Note Threads — Delta

## MODIFIED Requirements

### Requirement: Immutable revision creation

The system SHALL create an immutable revision whenever a note is created or a text note commit is saved. A revision MUST record at least the note id, revision id, parent revision id, monotonically increasing revision number, title, content, type, actor, source, and creation timestamp. The stored content SHALL be the complete file — properties section plus body — so every revision is a whole-file snapshot. The head note row SHALL continue to hold the latest committed state for fast listing and search. Every change to the file's bytes, including property-only changes, SHALL create a revision; property edits use `source: property`.

#### Scenario: Create a note

- **WHEN** a user creates a text note
- **THEN** the note is stored with revision number 1
- **AND** a revision with a null parent is stored
- **AND** the head points to that revision

#### Scenario: Save an edit

- **WHEN** a user saves new content for note `N` whose head is revision `R2`
- **THEN** a revision `R3` is stored with parent `R2` and revision number 3
- **AND** the head of `N` points to `R3`
- **AND** revision `R2` remains readable and unchanged

#### Scenario: Save without changes

- **WHEN** a commit has the same title, content, and canvas snapshot as the current head
- **THEN** no new revision is created
- **AND** the response reports that no changes were saved

#### Scenario: Property-only change is a revision

- **WHEN** a commit changes only the fence
- **THEN** a new revision is appended
- **AND** its source is `property`

### Requirement: Restore and promote revisions

The system SHALL allow restoring an old revision into the head and promoting a branch into the head. Both operations MUST append a new revision; they MUST NOT rewrite or delete existing history. Both operations SHALL copy the revision's file snapshot (properties and body) but MUST NOT move the note's title, which is head metadata outside the file. The revision row's recorded title SHALL continue to describe the name in force at that revision.

#### Scenario: Restore an old version

- **WHEN** a user restores revision `R1` while the head is `R4`
- **THEN** a new revision `R5` is appended with content copied from `R1` and parent `R4`
- **AND** the head moves to `R5`
- **AND** `R1` through `R4` remain unchanged

#### Scenario: Restore does not change the title

- **WHEN** a note was renamed after `R1` was created and the user restores `R1`
- **THEN** the restored content and properties are `R1`'s
- **AND** the note keeps its current title

#### Scenario: Promote a branch

- **WHEN** a user promotes branch revision `B` while the head is `R4`
- **THEN** a new revision is appended with content copied from `B` and parent `R4`
- **AND** the head moves to the new revision
- **AND** `B` remains in the tree

## ADDED Requirements

### Requirement: Title is head metadata

The note title SHALL live outside the file snapshot. Renaming a note MUST NOT create a revision and MUST NOT modify any revision row. Renaming SHALL update the head title and its updated timestamp. Version-pinned references SHALL keep rendering the title recorded on the pinned revision.

#### Scenario: Rename creates no revision

- **WHEN** a user renames a note at revision 4
- **THEN** the revision count stays at 4
- **AND** the note's title is the new name

#### Scenario: Pinned reference keeps its frozen title

- **WHEN** a note is pinned at revision 2 with title `Beta` and later renamed `Gamma`
- **THEN** the pinned reference still renders `Beta`
- **AND** an unpinned reference renders `Gamma`

### Requirement: Property revision provenance

Revisions created by property edits SHALL record `source: property` and a message identifying the edit, and batch property operations (such as a tag rename) SHALL record the same message on every affected note so the history can present them as one grouped entry.

#### Scenario: Batch rename provenance

- **WHEN** a tag rename rewrites ten notes
- **THEN** each note's new revision has `source: property`
- **AND** all ten share the operation message
