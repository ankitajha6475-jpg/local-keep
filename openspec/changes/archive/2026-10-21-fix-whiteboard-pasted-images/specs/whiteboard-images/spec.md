## MODIFIED Requirements

### Requirement: Server extracts whiteboard images to file store
When a whiteboard delta arrives with `files` entries containing base64 `dataURL` data, the server SHALL extract each image's bytes to the shared `data/images/` store using content-hash filenames (for deduplication and serving), while **preserving the Excalidraw-required fields** (`id`, `mimeType`, `dataURL`, `created`) on the stored file entry. The persisted `canvasData.files` entry SHALL be `{ id, mimeType, dataURL, created, hash, ext }` so the image renders on reload without a fetch round-trip.

#### Scenario: Image extracted and Excalidraw fields preserved
- **WHEN** a delta arrives with `files: { "abc": { id: "abc", mimeType: "image/png", dataURL: "data:image/png;base64,...", created: 1234567890 } }`
- **THEN** the server decodes the base64, computes the SHA-256 hash, writes to `data/images/<hash>.png`
- **AND** the in-memory and persisted `canvasData.files["abc"]` is `{ id: "abc", mimeType: "image/png", dataURL: "data:image/png;base64,...", created: 1234567890, hash: "<hash>", ext: "png" }` (dataURL and Excalidraw fields retainOriginal values)

#### Scenario: Duplicate image deduplication
- **WHEN** a whiteboard delta contains a file whose content hash already exists in `data/images/`
- **THEN** the server SHALL NOT overwrite the existing file on disk
- **AND** the file entry still retains `id`, `mimeType`, `dataURL`, `created`, `hash`, `ext`

#### Scenario: Older persisted entry lacking dataURL is hydrated on load
- **WHEN** the server loads `canvasData.files` whose entries carry `hash`/`ext`/`mimeType`/`url` but no `dataURL`
- **THEN** the server SHALL fetch the stored image at `<hash>.<ext>` from disk, reconstitute the `dataURL`, and re-persist the full entry (one-time migration)

## ADDED Requirements

### Requirement: Delta broadcast excludes the originating sender
When the server broadcasts a whiteboard delta to all sessions on a note, it SHALL exclude the WebSocket that sent the delta. The originator's local Excalidraw state already contains the live `dataURL` for pasted/inserted images and SHALL NOT be overwritten by a server-echoed file entry.

#### Scenario: Originator does not receive its own delta
- **WHEN** session A pastes an image and the server broadcasts the rewritten delta to all sessions on the note
- **THEN** session A does NOT receive the broadcast
- **AND** session A's local image continues to render using its still-valid `dataURL`

### Requirement: Client does not clobber a live dataURL with a URL-only entry
The collaboration manager SHALL merge incoming `files` entries into local state such that an entry currently having a non-empty `dataURL` is never overwritten by an incoming entry that lacks a non-empty `dataURL`. This guards against out-of-order or in-flight messages reducing a renderable image to a non-renderable one.

#### Scenario: Remote delta carries URL-only entry while local has dataURL
- **WHEN** the local `currentFiles[id]` has `{ dataURL: "data:...", ... }` and an incoming `msg.files[id]` has `{ hash, ext, mimeType, url }` but no `dataURL`
- **THEN** the local entry is preserved unchanged (incoming entry ignored for that id)

#### Scenario: Remote delta carries full entry replaces URL-only local
- **WHEN** the local `currentFiles[id]` has only `{ hash, ext, mimeType, url }` and an incoming `msg.files[id]` has `{ dataURL, id, mimeType, created, ... }`
- **THEN** the incoming entry replaces the local entry, restoring renderability

### Requirement: Snapshot includes renderable file data
When a client joins a note, the server SHALL send `files` entries that contain a valid `dataURL` (plus `id`, `mimeType`, `created`, `hash`, `ext`, `url`) so the client can render images in Excalidraw without an additional fetch.

#### Scenario: Join note with images
- **WHEN** a client sends `{ type: 'join', noteId }` for a note that has images
- **THEN** the snapshot response includes `files` where each entry has a non-empty `dataURL`, an `id`, a `mimeType`, a `created`, a `hash`, an `ext`, and a `url` (`/api/images/<hash>.<ext>`)

#### Scenario: Reload renders pasted image immediately
- **WHEN** a client reloads after a paste and joins the note
- **THEN** the image renders on the canvas using the snapshot-provided `dataURL` without requiring any image fetch by the client
