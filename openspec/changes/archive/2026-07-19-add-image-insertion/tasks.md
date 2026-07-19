## 1. Server: Image Storage Infrastructure

- [x] 1.1 Create `data/images/` directory at server startup if it doesn't exist
- [x] 1.2 Add `POST /api/images` endpoint: accept multipart upload, compute SHA-256 hash (first 16 hex chars), save to `data/images/<hash>.<ext>`, return `{ hash, url, mimeType }`
- [x] 1.3 Add `GET /api/images/:filename` endpoint: serve files from `data/images/` with correct Content-Type, return 404 for missing files
- [x] 1.4 Add multer (or busboy) middleware for multipart form parsing on the upload endpoint

## 2. Server: Whiteboard Image Sync

- [x] 2.1 Extend `applyDelta()` to accept and merge `files` entries from delta messages into `state.files`
- [x] 2.2 In `applyDelta()`, extract base64 dataURL from each file entry: decode, compute SHA-256, write to `data/images/<hash>.<ext>`, replace with `{ hash, mimeType, ext }` reference
- [x] 2.3 Include `files` in the broadcast delta message sent to other sessions
- [x] 2.4 In `loadNoteState()`, resolve file hash references to serveable URLs (`/api/images/<hash>.<ext>`) when building the snapshot
- [x] 2.5 In `persistNoteState()`, ensure extracted file references (not base64) are written to `canvasData`

## 3. Client: Enable Whiteboard Images

- [x] 3.1 Remove `UIOptions.tools.image = false` from Excalidraw config in `WhiteboardEditor.vue`
- [x] 3.2 Remove the `blockImagePaste` function and its `paste` event listener in `WhiteboardEditor.vue`
- [x] 3.3 In `collabManager.js`, include `currentFiles` in the delta message sent by `flushChanges()`
- [x] 3.4 In `collabManager.js`, handle `files` from incoming delta and snapshot messages, merging into Excalidraw via `api.updateScene({ files })`

## 4. Text Note: Image Insertion

- [x] 4.1 Add an "insert image" button to the text note editor UI in `App.vue`
- [x] 4.2 Implement image upload handler: create FormData, POST to `/api/images`, insert `![image](/api/images/<hash>.<ext>)` at cursor/append position in note content
- [x] 4.3 Add paste handler for images in the text note editor: intercept clipboard image data, upload, and insert markdown reference
- [x] 4.4 Show brief upload indicator during image upload

## 5. Text Note: Image Rendering

- [x] 5.1 In the note view/list, parse markdown image syntax `![alt](url)` and render as `<img>` tags
- [x] 5.2 Handle broken image references gracefully (show alt text or placeholder on 404)

## 6. Polish & Integration

- [x] 6.1 Add `multer` dependency to `package.json` if not already present
- [x] 6.2 Update CHANGELOG.md with the new image insertion feature
- [x] 6.3 Test end-to-end: insert image in whiteboard, verify sync, verify persistence across reload
- [x] 6.4 Test end-to-end: insert image in text note, verify rendering, verify shared storage
