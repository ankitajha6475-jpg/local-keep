# whiteboard-metadata Specification

## Purpose
Keeps a whiteboard's title and gallery cover as durable note metadata, independent of transient canvas checkpoints and client state.

## Requirements

### Requirement: Whiteboard title persistence

A whiteboard title edit SHALL be sent to the server and committed through the same note/revision service as other edits. The commit MUST use the current head as its base and MUST update the head title, gallery card, and other open whiteboard editors.

The title field SHALL NOT swallow a keystroke that belongs to an IME. Enter SHALL stand down during a composition so the IME can confirm its candidate.

#### Scenario: Edit and leave the title

- **WHEN** the user edits the whiteboard title and blurs the field, presses Enter, or leaves the whiteboard
- **THEN** the server commits the title as a revision
- **AND** the gallery and other open editors show the new title

#### Scenario: Another editor changes the title

- **WHEN** another client changes the title of the open whiteboard
- **THEN** this editor receives `title-updated`
- **AND** the local title field reflects the new value

#### Scenario: Reopen the whiteboard

- **WHEN** a whiteboard with a saved title is reopened
- **THEN** the initial snapshot contains the saved title
- **AND** the editor does not fall back to an empty title

#### Scenario: Enter confirms the IME candidate

- **WHEN** the user presses Enter while an IME is composing the whiteboard title
- **THEN** the IME confirms the candidate instead of the keypress being swallowed
- **AND** the committed title contains the confirmed characters

### Requirement: Cover preservation across checkpoints

A canvas persist or checkpoint that has no newly generated thumbnail MUST preserve the last stored cover. A missing thumbnail MAY be recovered from the latest whiteboard render's first tile. A fresh scene thumbnail SHALL replace the cover only when it was actually generated from the current scene.

#### Scenario: Leave without a new thumbnail

- **WHEN** a checkpoint runs after a delta but the client does not send a new thumbnail
- **THEN** the existing gallery cover remains
- **AND** the card does not show the default placeholder

#### Scenario: Recover a missing cover

- **WHEN** a whiteboard has no thumbnail but has a rendered page
- **THEN** a later persist uses the first rendered tile as the cover
- **AND** the card shows an image instead of the placeholder

#### Scenario: New drawing generates a cover

- **WHEN** the scene changes and the client generates a new thumbnail
- **THEN** the new cover replaces the previous one
- **AND** subsequent checkpoints keep it until another thumbnail is generated

### Requirement: Title and cover events

Whiteboard title changes SHALL use a WebSocket `title` message from the client and `title-updated` from the server. The server SHALL broadcast the normal notes list after a title commit so gallery metadata stays current. Title revisions SHALL NOT trigger the generic external-revision warning for the editing client.

#### Scenario: Title change does not show a false conflict

- **WHEN** the editing client commits a whiteboard title
- **THEN** the gallery updates
- **AND** the editor is not shown an "another client saved" notice

#### Scenario: Snapshot includes title

- **WHEN** a client joins a whiteboard
- **THEN** the snapshot includes the current title
- **AND** the client can render the header without a separate request
