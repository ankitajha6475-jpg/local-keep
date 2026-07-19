## ADDED Requirements

### Requirement: Excalidraw image tool enabled
The whiteboard editor SHALL enable the Excalidraw built-in image tool, allowing users to insert images via the toolbar image button and via paste.

#### Scenario: Insert image via toolbar
- **WHEN** the user clicks the image tool in the Excalidraw toolbar and selects an image file
- **THEN** the image appears on the canvas as an Excalidraw image element

#### Scenario: Paste image from clipboard
- **WHEN** the user pastes an image from the clipboard while the whiteboard is focused
- **THEN** the image is inserted onto the canvas (the existing `blockImagePaste` interceptor SHALL be removed)

### Requirement: Whiteboard image sync via WebSocket delta
The collaboration manager SHALL include the Excalidraw `files` object in delta messages sent to the server. The server SHALL merge received files into the note state and broadcast them to other sessions.

#### Scenario: Image added and synced
- **WHEN** a user inserts an image into the whiteboard and the delta is flushed
- **THEN** the delta message sent to the server includes both `elements` and `files` with the image data
- **AND** the server stores the file data and broadcasts it to other connected sessions

#### Scenario: Remote session receives image
- **WHEN** session B receives a delta containing `files` with a new image
- **THEN** session B's Excalidraw instance displays the image correctly

### Requirement: Server extracts whiteboard images to file store
When a whiteboard delta arrives with `files` entries containing base64 `dataURL` data, the server SHALL extract each image to the shared `data/images/` store using content-hash filenames, and replace the inline base64 with a hash reference in the persisted `canvasData`.

#### Scenario: Image extracted on delta persist
- **WHEN** a delta arrives with `files: { "abc": { dataURL: "data:image/png;base64,...", mimeType: "image/png" } }`
- **THEN** the server decodes the base64, computes the SHA-256 hash, writes to `data/images/<hash>.png`
- **AND** the persisted `canvasData.files` stores `{ "abc": { hash: "<hash>", mimeType: "image/png", ext: "png" } }` instead of the full dataURL

#### Scenario: Duplicate image deduplication
- **WHEN** a whiteboard delta contains a file whose content hash already exists in `data/images/`
- **THEN** the server SHALL NOT overwrite the existing file and stores only the hash reference

### Requirement: Snapshot includes resolved file data
When a client joins a note, the server SHALL resolve hash references in `state.files` back to serveable URLs so the client can load images.

#### Scenario: Join note with images
- **WHEN** a client sends `{ type: 'join', noteId }` for a note that has images
- **THEN** the snapshot response includes `files` with URLs (e.g., `/api/images/<hash>.<ext>`) that the client can load
