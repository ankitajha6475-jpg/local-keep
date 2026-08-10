## Context

Excalidraw requires each entry in its `files` map to be `{ id, mimeType, dataURL, created }`. The renderer resolves an image element's `fileId` to `files[fileId].dataURL` and draws that. The current pipeline destroys that shape:

1. Client pastes → Excalidraw holds the correct `{ id, mimeType, dataURL, created }`; `flushChanges` sends it to the server.
2. Server `mergeFiles` runs `storeImageFromDataURL()` to extract bytes to `data/images/<hash>.<ext>` (good — needed for dedup), but then **overwrites** `state.files[fileId]` with only `{ hash, ext, mimeType }`, dropping `id`, `dataURL`, `created`.
3. Server broadcast adds a `url` field; snapshot/load resolves hash→url; `persistNoteState` writes `{ hash, ext, mimeType }` to `notes.canvasData`. At no point does a `dataURL` survive.
4. Client `handleRemoteDelta` / `handleSnapshot` merge these reduced entries into `currentFiles` and call `api.updateScene({ files })`. Excalidraw cannot render an image without `dataURL`.
5. Compounding bug: the broadcast path passes the sender's socket back to itself without an exclude, so the originator's still-valid `dataURL` is **overwritten** by the server's reduced entry — meaning the image breaks on the originator's own canvas within ~500ms of the paste.

## Goals / Non-Goals

**Goals:**
- Pasted (and toolbar-inserted) whiteboard images render correctly on: (a) the originator immediately and persistently, (b) other connected clients, (c) reload of any client.
- Image bytes are still extracted to `data/images/` for content-addressed dedup and serving.
- No regression in toolbar-image insertion, thumbnail export, or other-client propagation.

**Non-Goals:**
- Removing the disk-extraction / content-hashing model (still want dedup).
- Switching to URL-only rendering inside Excalidraw (Excalidraw requires dataURL; not worth working around).
- Compression or resizing of stored images.
- Multi-file/asset pipeline beyond images.

## Decisions

### Decision 1: Server preserves Excalidraw fields, augmenting not replacing
`mergeFiles` becomes an augmenting operation: a file entry is `{ id, mimeType, dataURL, created, hash, ext, url }`. The server keeps the original `id`, `mimeType`, `dataURL`, `created` and adds `hash`, `ext`, and (for broadcast/snapshot) `url`. Bytes are still written to disk for dedup/serving.

Why not the alternative "client fetches URL → dataURL" approach: that adds latency, requires async work inside `handleRemoteDelta`/`handleSnapshot` (Excalidraw's `updateScene` is synchronous; juggling pending fetches per file is more complex), and the dataURL is already in the message — just keep it. For a single-user local app the size growth in `canvasData` is acceptable.

### Decision 2: Broadcast excludes the sender
Pass `excludeWs = sendingSocket` to `broadcastToNote` in the delta handler. The sender already has the full shape in `currentFiles` and its Excalidraw instance already rendered the paste locally — re-broadcast to self is what overwrites a valid `dataURL` with a reduced entry. Excluding the sender stops the regression.

### Decision 3: Client-side defensive merge in `handleRemoteDelta` / `handleSnapshot`
Even with Decision 1+2, defensive logic prevents regressions from older in-flight or out-of-order messages: when merging `msg.files[id]` into `currentFiles`, **never replace** an existing entry that has a non-empty `dataURL` with an incoming entry lacking one. This is a 2-line guard and protects against race conditions.

### Decision 4: Persist the full shape including `dataURL`
`persistNoteState` writes `{ elements, files }` where `files[id]` retains `dataURL`. On reload this means the image renders without a round-trip. Size: yes, `notes.canvasData` now contains base64. For a local single-user app this is fine; if it becomes a problem later we can move to URL-fetch-then-dataURL on the client (Decision 1 keeps that door open).

### Decision 5: `url` field included on broadcast/snapshot for forward compatibility
Server still computes `url: /api/images/<hash>.<ext>` and includes it. Future clients could prefer `url` for performance; current code path uses `dataURL`.

### Decision 6: No change to client paste handling
Excalidraw's built-in paste remains the source of truth. No new paste/drop event listeners needed in `WhiteboardEditor.vue` — the bug was downstream.

## Risks / Trade-offs

- **[Risk] Larger persisted `canvasData`** — base64 stored in DB. Single-user local app; acceptable. Mitigation: limit note size? Not worth it now.
- **[Risk] Older persisted notes lack `dataURL`** — On first load of a legacy note after deploy, the snapshot will have `{ hash, ext, mimeType, url }` but no `dataURL`. The client-side defensive guard would render blank for those entries. Mitigation: in the snapshot path, for any entry lacking `dataURL` but having `url`/`hash`, the server-side load (or the client on receive) SHALL perform a one-time URL→dataURL fetch and restore the entry. Implement in `loadNoteState` lazily — async hydration that re-persists once converted. **Tracked as a separate sub-task in tasks.md** so the main fix ships first; legacy notes that pre-date this change are rare (only those saved while the bug was active).
- **[Risk] Sending large deltas when many images** — already true pre-change for the first send; no worse.
- **[Risk] Excalidraw's `created` cache key** — preserving `created` avoids stale-cache re-decoding.

## Migration Plan

1. Ship server-side field preservation + sender-exclude.
2. Ship client-side defensive merge.
3. For old persisted notes (created during the bug window), implement the URL→dataURL hydration (Decision-6 risk mitigation). Re-persist once.
4. Rollback safe: reverting re-introduces `{ hash, ext, mimeType }` reduction; clients would re-break but no data loss.

## Open Questions

none.
