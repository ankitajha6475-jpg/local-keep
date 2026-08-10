## ADDED Requirements

### Requirement: Server notifies clients of a specific note deletion
When a note is deleted via `DELETE /api/notes/:id` or `POST /api/notes/batch-delete`, the server SHALL broadcast a `note-deleted` message to all connected WebSocket clients with the deleted note's id and a `deletedAt` timestamp, in addition to the existing bulk `notes` broadcast.

#### Scenario: Single delete broadcasts note-deleted
- **WHEN** the server processes a successful `DELETE /api/notes/:id` returning `{ success: true }`
- **THEN** every connected WebSocket client receives `{ type: 'note-deleted', noteId: <id>, deletedAt: <epochMs> }`
- **AND** the existing bulk `{ type: 'notes', notes: [...] }` broadcast also fires

#### Scenario: Batch delete broadcasts one note-deleted per id
- **WHEN** the server processes a successful `POST /api/notes/batch-delete` with N ids
- **THEN** every connected WebSocket client receives a `note-deleted` message for each of the N deleted ids

### Requirement: Server rejects deltas for deleted notes
When a `delta` message arrives for a `noteId` whose in-memory state has been cleared as a result of deletion (or that no longer exists in the database), the server SHALL reply to the sender only with `{ type: 'note-gone', noteId }`, SHALL NOT apply or broadcast the delta, and SHALL NOT attempt to persist it.

#### Scenario: Delta to a deleted note
- **WHEN** a client sends `{ type: 'delta', noteId: <deletedId>, elements, files }` after the note was deleted
- **THEN** the server responds to the sender with `{ type: 'note-gone', noteId: <deletedId> }`
- **AND** no other client receives any delta broadcast for that noteId
- **AND** no database write occurs

### Requirement: Client masks the editor when the open note is deleted elsewhere
When a client has the editor for note X open (text-note modal OR canvas view) and receives `note-deleted` for X (or receives `note-gone` for X), the client SHALL enter a *"deleted elsewhere"* state for X: the editor surface SHALL be visually masked (a non-blocking overlay that disables further edits) and a prompt SHALL be shown offering **Save as new note** and **Discard**. The client SHALL NOT show a modal `alert()` or `confirm()` dialog.

#### Scenario: Text-note editor open when deletion arrives
- **WHEN** the user has the text-note modal open on note X and a `note-deleted` message arrives for X
- **THEN** the editor surface is masked with an overlay
- **AND** a prompt appears inline offering "Save as new note" and "Discard"
- **AND** no native alert/confirm dialog is shown

#### Scenario: Whiteboard view open when deletion arrives
- **WHEN** the user has the whiteboard canvas open on note X and a `note-deleted` message arrives for X
- **THEN** the canvas surface is masked
- **AND** a prompt appears inline offering "Save as new note" and "Discard"
- **AND** the collaboration manager stops sending further deltas for X

#### Scenario: Deletion message for a note that is not currently open
- **WHEN** the user is browsing the gallery (no editor open) and a `note-deleted` message arrives for note Y
- **THEN** the client does NOT show a mask or prompt; the gallery refreshes via the bulk `notes` broadcast (existing behavior)

### Requirement: Save-as recovers local edits into a new note
When the user chooses **Save as new note** on the masked editor, the client SHALL create a new note via `POST /api/notes` using the current local buffer (text-note: current title + content; canvas: current Excalidraw elements + files), and on success SHALL close the masked editor and switch to the newly-created note.

#### Scenario: Save-as on a deleted text note
- **WHEN** the user is on a masked text-note editor and clicks "Save as new note"
- **THEN** a new note is created via `POST /api/notes` carrying the user's current title and content
- **AND** the masked editor is closed
- **AND** the newly-created note becomes the current selection

#### Scenario: Save-as on a deleted whiteboard
- **WHEN** the user is on a masked whiteboard and clicks "Save as new note"
- **THEN** a new canvas note is created via `POST /api/notes` with `type: 'canvas'`, carrying the current Excalidraw elements and files
- **AND** the collaboration manager is detached from the deleted note's WebSocket and attached to the new note's WebSocket
- **AND** the newly-created note becomes the current selection

### Requirement: Discard closes the editor without saving
When the user chooses **Discard** on the masked editor, the client SHALL close the editor without performing any save, and SHALL clear any local state associated with the deleted note (text: clear local edit buffer; canvas: detach collab manager, discard currentElements).

#### Scenario: Discard on a deleted text note
- **WHEN** the user clicks "Discard" on the masked text-note editor
- **THEN** the modal closes without any `PUT`/`POST` request
- **AND** the local edit buffer is cleared
- **AND** the gallery reflects the note as deleted (via the bulk `notes` broadcast)

#### Scenario: Discard on a deleted whiteboard
- **WHEN** the user clicks "Discard" on the masked whiteboard
- **THEN** the canvas view closes and the user returns to the gallery
- **AND** the collab manager for the deleted note is detached
- **AND** no further deltas are sent for the deleted note

### Requirement: Deletion detection is idempotent
If both a `note-deleted` broadcast and a subsequent `note-gone` response arrive for the same open note, the client SHALL enter the masked state exactly once and SHALL NOT duplicate the prompt.

#### Scenario: Both messages arrive for same note
- **WHEN** a `note-deleted` for X arrives and is handled, then a `note-gone` for X also arrives
- **THEN** the mask remains shown (no duplicate prompt, no error)
