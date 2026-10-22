# live-text-collab Specification

## Purpose
Keeps text notes editable by multiple clients at the same time: the browser and MCP see one shared Yjs draft per note, while revisions are created only by explicit saves so live typing never bypasses optimistic concurrency.

## Requirements

### Requirement: Shared live text draft

Each text note SHALL have one shared Yjs document containing the note body and title. Clients SHALL join it over the existing `/ws` connection and exchange only local Yjs updates. The server SHALL persist the live document separately from the head note and revisions; live updates MUST NOT create a revision or move the head.

#### Scenario: Two clients edit the same note

- **WHEN** two clients have the same text note open and both type
- **THEN** both editors converge to the same body and title
- **AND** the head note and revision history remain unchanged until an explicit save

#### Scenario: Reconnect restores the draft

- **WHEN** a client reconnects to a note that has a persisted live draft
- **THEN** it receives the current draft and the server state vector
- **AND** it sends any local-only updates after applying the snapshot

### Requirement: Explicit save commits a revision

A browser Save or `note_session action=save` SHALL commit the shared draft as a normal revision using optimistic concurrency. A clean draft whose title and content match the head SHALL be removed when the last editor leaves. MCP one-shot edits MUST NOT move a live draft's base revision.

#### Scenario: Browser save

- **WHEN** a browser saves a dirty shared draft with the head as its base
- **THEN** a revision is created from the draft
- **AND** the head and every open editor's draft base move to the new revision
- **AND** the save is broadcast as `text-saved`

#### Scenario: Stale save branches

- **WHEN** the draft base is stale because another client moved the head
- **THEN** the save is kept as a branch by default
- **AND** the head is unchanged
- **AND** the user sees a conflict notice

### Requirement: Presence for text and canvas sessions

Text and whiteboard sessions SHALL share the note presence map. Every join or leave SHALL broadcast the note's open-session count and users, and closing a tab or socket MUST remove that session so dashboard presence dots do not stick.

#### Scenario: Open and close a text note

- **WHEN** a user opens a text note in another tab
- **THEN** the note card shows a presence indicator with the user
- **AND** the indicator disappears when that tab closes or leaves the note

### Requirement: Draft reset and discard

The server SHALL support discarding a draft and resetting clients. A discard request SHALL delete the draft only when the sender is the last editor. A reset caused by restore, promote, or discard MUST replace the local Yjs document rather than merging the new head into the old document.

#### Scenario: Restore while a draft is open

- **WHEN** a revision is restored or promoted while clients have the note open
- **THEN** the server broadcasts `text-reset` with the new document
- **AND** clients replace their local document so discarded text does not reappear

#### Scenario: Last editor discards

- **WHEN** the last editor chooses Discard
- **THEN** the shared draft is deleted
- **AND** the committed head remains unchanged

### Requirement: Remote updates preserve local editing

When a remote update re-renders the Visual editor, the client SHALL preserve the text caret. It MUST defer the re-render during IME composition. Source mode SHALL preserve the textarea selection.

#### Scenario: Remote edit while typing

- **WHEN** another client's update arrives while the local user is typing in Visual mode
- **THEN** the rendered content updates
- **AND** the local caret stays at the equivalent text position
- **AND** an in-progress IME composition is not interrupted

### Requirement: Live text protocol

The WebSocket protocol SHALL support `text-join`, `text-leave`, `text-update`, and `text-discard` from clients, and `text-snapshot`, `text-update`, `text-saved`, `text-reset`, and `text-discarded` from the server. Updates SHALL be base64-encoded Yjs updates.

#### Scenario: Join snapshot

- **WHEN** a client sends `text-join` for a note
- **THEN** the server returns the current update, state vector, base revision id, and revision number
- **AND** subsequent local updates are broadcast to the other text sessions
