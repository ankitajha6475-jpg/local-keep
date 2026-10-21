## Purpose

Gives every note a stable document identity and an append-only revision history, so edits never destroy prior content, open editors keep the same note identity, and concurrent edits are preserved as branches instead of being silently overwritten.

## ADDED Requirements

### Requirement: Stable document identity

A note SHALL have a stable `id` that identifies the document for its entire lifetime. A revision identifier SHALL identify a version, never the document. Links, cards, WebSocket sessions, URLs, and MCP-facing note identifiers MUST continue to use the same note `id` across edits.

#### Scenario: Editing does not change the note id

- **WHEN** a user opens note `N` and saves an edit
- **THEN** the saved note still has id `N`
- **AND** the response exposes a new `revisionId` distinct from `N`

#### Scenario: Editor stays on the same document

- **WHEN** the editor is open on note `N` and a save completes
- **THEN** the editor's document identity remains `N`
- **AND** it is not reassigned to the new revision id

### Requirement: Immutable revision creation

The system SHALL create an immutable revision whenever a note is created or a text note commit is saved. A revision MUST record at least the note id, revision id, parent revision id, monotonically increasing revision number, title, content, type, actor, source, and creation timestamp. The head note row SHALL continue to hold the latest committed state for fast listing and search.

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

### Requirement: Session-stable editing

While a document is open, the system SHALL NOT change its document identity. The editor MUST capture the head revision as `baseRevisionId` when opening and MUST send it when saving. Autosave, if present, MUST write a draft rather than a revision or the head; only an explicit save/commit SHALL create a revision. Drafts MUST target the same note `id`.

#### Scenario: Autosave is a draft

- **WHEN** autosave writes intermediate editor content for note `N`
- **THEN** no revision is created
- **AND** the head of `N` is unchanged
- **AND** the draft is associated with note `N` and the editing session

#### Scenario: Closing without saving

- **WHEN** the editor closes without an explicit save
- **THEN** the head and revision history are unchanged
- **AND** the draft, if any, is discarded or retained only for recovery under the same note `id`

### Requirement: Optimistic concurrency and branching

A commit SHALL compare its `baseRevisionId` with the current head revision. If they differ, the system MUST NOT silently overwrite the head. By default it SHALL store the submitted content as a branch revision whose parent is the base revision, keep the head unchanged, and report `conflict: true` with a human-readable notice. An explicit `take_head` mode SHALL be available to move the head to the submitted content.

#### Scenario: Stale save creates a branch

- **WHEN** the editor opened at revision `R2`, another client moved the head to `R3`, and the editor saves
- **THEN** the new revision's parent is `R2`
- **AND** the head remains `R3`
- **AND** the response has `conflict: true` and a notice explaining that the edit was preserved as a branch

#### Scenario: Explicit head takeover

- **WHEN** a stale save is submitted with mode `take_head`
- **THEN** a new revision is created with parent equal to the current head
- **AND** the head moves to the new revision
- **AND** the previous head remains readable

### Requirement: Thread history and tree

The system SHALL expose a note's revision history as both a flat ordered list and a tree. The response MUST identify the head revision and mark which revisions are on the head chain. Historical revision content MUST be readable without changing the head.

#### Scenario: Read history

- **WHEN** a client requests the history of note `N`
- **THEN** the response contains the head revision id, all revisions with parent ids, and a tree
- **AND** revisions reachable from the head are marked as on the head chain
- **AND** branch revisions are included and marked off the head chain

#### Scenario: Read an old revision

- **WHEN** a client requests revision `R1` of note `N`
- **THEN** the stored title/content/canvas of `R1` is returned
- **AND** the head of `N` is unchanged

### Requirement: Restore and promote revisions

The system SHALL allow restoring an old revision into the head and promoting a branch into the head. Both operations MUST append a new revision; they MUST NOT rewrite or delete existing history.

#### Scenario: Restore an old version

- **WHEN** a user restores revision `R1` while the head is `R4`
- **THEN** a new revision `R5` is appended with content copied from `R1` and parent `R4`
- **AND** the head moves to `R5`
- **AND** `R1` through `R4` remain unchanged

#### Scenario: Promote a branch

- **WHEN** a user promotes branch revision `B` while the head is `R4`
- **THEN** a new revision is appended with content copied from `B` and parent `R4`
- **AND** the head moves to the new revision
- **AND** `B` remains in the tree

### Requirement: Archive retention and explicit purge

Deleting a note SHALL archive it by default, retaining its revisions, tags, links, render metadata, and image references. Archived notes MUST be excluded from lists and search by default and MUST be restorable. Permanent deletion SHALL require an explicit purge request and MUST remove the note and its dependent revision data.

#### Scenario: Delete archives

- **WHEN** a user deletes note `N`
- **THEN** `N` receives an `archivedAt` timestamp
- **AND** `N` is excluded from the default note list and search results
- **AND** its revisions remain readable

#### Scenario: Restore archived note

- **WHEN** a user restores an archived note `N`
- **THEN** `archivedAt` is cleared
- **AND** `N` appears in lists and search again

#### Scenario: Purge

- **WHEN** a user permanently deletes note `N` with an explicit purge request
- **THEN** the note, its revisions, and dependent revision data are removed
- **AND** image references are released for garbage collection

### Requirement: Revision-aware image retention

The system SHALL record image references for each revision. Image cleanup MUST consider head references, revision references, and whiteboard tile references together, so an image used only by an old revision or a rendered page is not deleted.

#### Scenario: Old revision image survives cleanup

- **WHEN** revision `R1` references image `I`, the current head no longer references `I`, and image cleanup runs
- **THEN** `I` is retained because `R1` still references it

### Requirement: Migration of existing notes

On first startup with the new schema, the system SHALL migrate existing notes in a single transaction after creating a backup. Each existing note MUST become revision 1 of its own note identity with its current title, content, canvas data, and timestamps preserved. Migration MUST be idempotent and MUST fail closed without partially applying.

#### Scenario: Migrate an existing database

- **WHEN** the server starts against a database whose `notes` table has no `head_revision_id`
- **THEN** a backup is created
- **AND** every existing note gets a revision 1 and a head pointer
- **AND** note ids and content are unchanged
- **AND** the schema version is recorded

#### Scenario: Re-run migration

- **WHEN** the server starts against an already migrated database
- **THEN** no duplicate revisions are created
- **AND** no note content changes

#### Scenario: Migration failure

- **WHEN** any step of the migration throws
- **THEN** the transaction rolls back
- **AND** the server reports the backup path and does not start with a partially migrated database

### Requirement: API compatibility and notices

Existing note consumers SHALL continue to receive `id`, `title`, `content`, `type`, `canvasData`, `thumbnail`, `createdAt`, and `updatedAt`. Responses for revision-creating writes SHALL additionally include `revisionId`, `revisionNo`, `conflict`, and a human-readable `notice`.

#### Scenario: Legacy note shape remains

- **WHEN** a client lists or fetches notes
- **THEN** every note still includes its stable `id` and existing content fields
- **AND** revision and archive fields are additive

#### Scenario: Save notice

- **WHEN** a text save creates revision 3
- **THEN** the response includes a notice stating that revision 3 was saved and the previous version was kept
