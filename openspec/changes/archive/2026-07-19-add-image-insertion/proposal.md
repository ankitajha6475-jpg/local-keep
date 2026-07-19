## Why

Local Keep currently has no image support — the Excalidraw image tool is explicitly disabled, image paste is blocked, and text notes are plain text only. Users need to insert images into both whiteboard canvases (diagrams, sketches with photos) and text notes (reference images, screenshots). A shared content-addressed image store avoids duplication when the same image appears in both contexts.

## What Changes

- **Enable Excalidraw image tool**: Remove `UIOptions.tools.image = false` and the `blockImagePaste` interceptor in `WhiteboardEditor.vue`
- **Sync Excalidraw files via WebSocket**: Include the `files` object in delta messages so images added to the whiteboard are persisted and broadcast to other sessions
- **Server-side image storage**: Add `data/images/` directory with content-hash filenames (SHA-256); add `POST /api/images` upload endpoint and `GET /api/images/:hash` serving endpoint
- **Image-to-file extraction on server**: When whiteboard deltas arrive containing base64 `files`, extract image data to `data/images/` with content-hash filenames, replacing inline base64 with hash references in `state.files`
- **Text note image insertion**: Add image upload UI in the text note editor (paste or button), storing images via the same `/api/images` endpoint and inserting `![alt](/api/images/<hash>)` markdown references into note content
- **Text note image rendering**: Parse markdown image syntax in note content and render `<img>` tags pointing to the shared image store

## Capabilities

### New Capabilities
- `image-storage`: Content-addressed image file store with SHA-256 hashed filenames, upload/serve API, shared between whiteboard and text notes
- `whiteboard-images`: Excalidraw image tool enabled with file sync over WebSocket and server-side extraction to shared store
- `text-note-images`: Image insertion in text notes via upload/paste, markdown references, and rendered display

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **`server.js`**: New `/api/images` routes, image file extraction in `applyDelta`/`persistNoteState`, new `data/images/` directory
- **`src/components/WhiteboardEditor.vue`**: Remove image tool block and paste interceptor
- **`src/collab/collabManager.js`**: Include `files` in delta messages, handle `files` in snapshots/deltas
- **`src/App.vue`**: Image upload UI for text notes, markdown image rendering
- **Storage**: `data/images/` directory grows with uploaded images; `canvasData` column shrinks as images are extracted to files
- **Dependencies**: No new npm packages needed (Node `crypto` for SHA-256, Excalidraw image tool is built-in)
