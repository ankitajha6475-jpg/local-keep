## 1. Server: preserve Excalidraw fields in `mergeFiles`

- [x] 1.1 Change `mergeFiles(state, incomingFiles)` (server.js ~112-138): when `fileData.dataURL` is present, compute `{ hash, ext, mimeType }` via existing helpers, then set `state.files[fileId] = { ...fileData, hash, ext }` — preserving `id`, `mimeType`, `dataURL`, `created` and augmenting with hash/ext
- [x] 1.2 When `fileData.hash` already present (no dataURL), keep entry as-is (existing branch)

## 2. Server: broadcast excludes sender

- [x] 2.1 In the delta handler (~server.js:817-830), pass the sender's WebSocket as `excludeWs` to `broadcastToNote(...)` so the originator does not receive its own rewritten delta
- [x] 2.2 Verify `broadcastToNote(noteId, message, excludeWs)` honors the exclude (already supports the param per the snapshot/leave flows — confirm or extend if needed)

## 3. Server: keep dataURL in persisted `canvasData`

- [x] 3.1 In `persistNoteState` (~140-183), write `JSON.stringify({ elements, files: state.files })` with full shape (dataURL included). Remove any prior "strip dataURL / store only hash" logic
- [x] 3.2 In `loadNoteState` (~61-75): keep `dataURL` if present; still attach `url` from hash/ext for forward-compat

## 4. Server: snapshot/broadcast attach url on top of full shape

- [x] 4.1 In delta broadcast and snapshot handlers, build `resolvedFiles[id]` by spreading `state.files[id]` and adding `url: \`/api/images/${hash}.${ext}\``. Do NOT drop `dataURL`/`id`/`created` while adding `url`

## 5. Server: hydrate legacy entries lacking dataURL (one-time)

- [x] 5.1 In `loadNoteState`, for any `files[id]` lacking a `dataURL` but having `hash`+`ext`, read the bytes from `data/images/<hash>.<ext>`, reconstitute `dataURL`, and merge into the entry
- [x] 5.2 After hydration, schedule a one-time re-persist of the note so the legacy entry is upgraded to the full shape on disk (avoid re-hydrating every load: gate on a flag like `entry.hydrated !== true` or just `!dataURL`)

## 6. Client: defensive merge in collabManager

- [x] 6.1 In `handleRemoteDelta` (~collabManager.js:155-163), when merging `msg.files[id]` into `currentFiles`, skip if `currentFiles[id]?.dataURL` is present and `msg.files[id]?.dataURL` is absent
- [x] 6.2 In `handleSnapshot` (~collabManager.js:176-184), if a snapshot entry lacks `dataURL` but has a `url`, fetch the URL and rebuild `{ id, mimeType, dataURL, created, ... }` before calling `api.updateScene` (covers legacy notes during the migration window); otherwise pass through

## 7. Client: thumbnail automatically benefits

- [x] 7.1 Verify `generateThumbnail` (WhiteboardEditor.vue ~166-175) now produces thumbnails that include the pasted images because `files` has `dataURL` everywhere; no code change expected

## 8. Manual verification

- [ ] 8.1 Paste an image in whiteboard — it renders immediately on the originator and stays rendered after ~1s (sender-echo no longer breaks it)
- [ ] 8.2 With two clients open on the same whiteboard, paste in client A — image renders in client B
- [ ] 8.3 Reload the page after pasting — image still renders on reload
- [ ] 8.4 Insert an image via the Excalidraw toolbar — same correct rendering on originator, peer, reload
- [ ] 8.5 Confirm `data/images/<hash>.<ext>` exists on disk (dedup still works) and `image_refs` is updated
- [ ] 8.6 For a note saved during the original bug window, opening it reconstitutes and re-persists the dataURL; image renders after one load
- [ ] 8.7 Thumbnail preview in the gallery now shows the pasted image
- [ ] 8.8 Update `CHANGELOG.md` under `[Unreleased]` → `Fixed`: "Pasted/inserted whiteboard images now render correctly on all clients and on reload (server no longer strips Excalidraw's required dataURL; sender excluded from its own delta echo)"
