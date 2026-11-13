# Note Threads (Delta)

## ADDED Requirements

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
