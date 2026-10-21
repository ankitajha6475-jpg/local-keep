## Why

Pasted images in the whiteboard silently break their own rendering. Excalidraw stores image files in the `files` map with the shape `{ id, mimeType, dataURL, created }` and renders them by reading `files[fileId].dataURL`. The server's `mergeFiles()` (server.js:124) **discards** this shape and rewrites each entry to `{ hash, ext, mimeType }` (extracting bytes to `data/images/`), losing `dataURL`, `id`, and `created`. The server then broadcasts and persists only `{ hash, ext, mimeType, url }`. Nothing on the client ever converts that back to Excalidraw's required `dataURL` shape, so `api.updateScene({ files })` is handed files Excalidraw cannot render. The bug affects **all** clients including the originator (because the server echoes the sender's own rewritten delta back with no exclude), and persists across reload (the on-disk `canvasData.files` is also `{ hash, ext, mimeType }`).

## What Changes

- **Server-side fix (primary)**: keep the Excalidraw file shape intact throughout the pipeline while *also* extracting the bytes to disk for dedup and storage. Specifically, `mergeFiles`/broadcast/snapshot/persist store and emit `{ id, mimeType, dataURL, created, hash, ext }` and the server adds a `url` derived from `hash`+`ext` for any client that prefers it.
- **Stop sending a delta back to its originator**: the delta broadcast (`broadcastToNote`) SHALL exclude the sender's WebSocket so the originator's locally-held `dataURL` is never overwritten by a remote echo (this is what currently breaks the image on the originator right after paste).
- **Client-side defense-in-depth**: `handleRemoteDelta` and `handleSnapshot` SHALL merge incoming files such that entries still carrying a valid `dataURL` are never clobbered by URL-only entries from the server. This protects older or racing messages.
- Persisted `canvasData.files` SHALL contain `dataURL` (and the hash/ext for dedup) so the image renders immediately on reload without an extra fetch round-trip.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `whiteboard-images`: Requirements updated so the Excalidraw `files` shape is preserved end-to-end; the server still extracts bytes to disk for dedup but never discards `dataURL`/`id`/`created`; broadcast excludes the sender; clients merge defensively to preserve live `dataURL`s.

## Impact

- **Affected code**:
  - `server.js`:
    - `mergeFiles(state, incomingFiles)` (~line 112-138): preserve Excalidraw fields when extracting dataURL to disk.
    - Delta broadcast (~817-830): pass `excludeWs` to `broadcastToNote`; continue to send a `url` alongside the dataURL.
    - `loadNoteState` (~61-75): when resolving, keep `dataURL` if present.
    - Snapshot handler (~776-785): sends `{ id, mimeType, dataURL, created, hash, ext, url }`.
    - `persistNoteState` (~140-183): writes the full shape (with `dataURL`) — increases `notes.canvasData` size, acceptable for single-user local use.
  - `src/collab/collabManager.js`:
    - `handleRemoteDelta` (~155-163): when merging `msg.files` into `currentFiles`, skip overwriting any entry that already has a non-empty `dataURL` with an entry lacking one.
    - `handleSnapshot` (~176-184): accept the full shape; if a server-side entry lacks `dataURL` but has `url`, optionally fetch+convert to dataURL before `updateScene` (defensive).
  - `src/components/WhiteboardEditor.vue`:
    - `initialData.files` (~376) now sourced from the preserved-on-disk full shape; works on reload.
    - `generateThumbnail` (~166-175) benefits automatically (files now have `dataURL`).
- **Data growth**: `notes.canvasData` will now contain base64 image data again. Trade-off accepted (see design).
- **Backward compat**: existing on-disk data without `dataURL` will be detected; if the server has the `url`/`hash`, the snapshot can still serve it. Old clients receiving the new message will continue to work (extra fields ignored).
