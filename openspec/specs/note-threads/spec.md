# Note Threads

## Purpose

Gives every note a stable document identity and an append-only revision history, so edits never destroy prior content, open editors keep the same note identity, and concurrent edits are preserved as branches instead of being silently overwritten.

## Requirements

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

### Requirement: Chat room note type and discrete message delta revisions

The system SHALL support notes of type `chat`. The head note row SHALL store the full JSON transcript in `notes.content`. Every message sent in a chat room SHALL append a discrete delta revision in `note_revisions` rather than rewriting the whole file. The delta revision MUST record the message payload (id, sender identity, text content, and timestamp), incrementing the revision number by 1 for each message sent.

#### Scenario: Send message appends delta revision
- **WHEN** a user or client sends a message in chat room `C` currently at revision 3
- **THEN** a new revision 4 is appended with delta payload for the single message
- **AND** the head `notes.content` of `C` is updated with the message in its transcript array
- **AND** the revision number increments to 4

#### Scenario: Chat transcripts are indexed for search
- **WHEN** messages are added to a chat room
- **THEN** FTS and semantic search index the text content of the messages
- **AND** searching for keywords in chat messages returns the chat room note

### Requirement: Kanban board note type and action suite delta revisions

The system SHALL support notes of type `kanban`. The head note row SHALL store the materialized JSON board layout (columns and cards) in `notes.content`. When cards are added, moved, updated, or columns modified, the changes SHALL be committed on idle debounce (1-2s) or via an explicit Save action. The committed revision in `note_revisions` SHALL record the delta action suite describing the changes made since the prior revision.

#### Scenario: Move card between columns records delta action suite
- **WHEN** a user moves a card from column "To Do" to "In Progress" and saves or reaches idle debounce
- **THEN** a new revision is created containing the `card_moved` action delta
- **AND** the head note reflects the updated card positions
- **AND** the revision number increments
