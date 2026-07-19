## Context

Local Keep is a single-user notes app with Vue 3 frontend, Express+SQLite backend, and WebSocket real-time sync for Excalidraw whiteboards. Images are currently completely blocked — the Excalidraw image tool is disabled, paste is intercepted, and text notes have no image support. The collaboration system syncs only `elements` via WebSocket deltas; `files` (Excalidraw's base64 image store) are tracked client-side but never sent in deltas.

## Goals / Non-Goals

**Goals:**
- Enable image insertion in whiteboard canvases using Excalidraw's built-in image tool
- Enable image insertion in text notes with markdown-style references
- Persist images to disk using content-hash filenames (SHA-256) so identical images deduplicate
- Share the same image store between whiteboard and text notes
- Sync whiteboard images via the existing WebSocket collaboration system

**Non-Goals:**
- Image editing/cropping/resizing (future feature)
- Image galleries or media management UI
- External image hosting or CDN integration
- Migration of existing canvasData to extract images retroactively
- Image compression or format conversion

## Decisions

### D1: Content-hash filenames with SHA-256

Images are stored as `data/images/<sha256-prefix>.<ext>` where `<sha256-prefix>` is the first 16 hex chars of the SHA-256 of the file content.

**Why 16 hex chars?** Collision probability is negligible for a single-user app (~10^(-19) at 1000 images), and filenames stay short. Full 64-char hashes are unwieldy.

**Alternatives considered:**
- UUID filenames: No dedup — same image uploaded twice gets two files
- Full SHA-256: Unnecessarily long filenames
- Excalidraw's `fileId` as filename: Not content-based, can't share across contexts

### D2: Server-side image extraction from Excalidraw files

When a whiteboard delta arrives containing `files`, the server:
1. For each file entry, decode the base64 `dataURL`
2. Compute SHA-256 hash of the binary content
3. Write to `data/images/<hash>.<ext>` (skip if exists — dedup)
4. Store only the hash reference in `state.files` instead of the full dataURL
5. Persist `{ elements, files: { fileId: { hash, mimeType, ext } } }` to `canvasData`

This keeps `canvasData` small and puts image bulk on the filesystem.

**Why not store base64 in SQLite?** A single 2MB image = 2.7MB base64 in the canvasData TEXT column. Multiple images balloon the DB and make every snapshot/delta huge.

### D3: Delta sync carries files alongside elements

The existing delta protocol extends:

```
Client → Server:
{ type: 'delta', noteId, elements, files, thumbnail }
                                   ^^^^^ new

Server → Client:
{ type: 'delta', noteId, elements, files, serverTs }
```

The server's `applyDelta()` merges `files` entries (additive — files are immutable by content hash). The server broadcasts file entries to other sessions. Since files are content-addressed, there's no conflict — same hash always means same content.

### D4: Text note images via dedicated upload endpoint

Text notes use `POST /api/images` (multipart form upload) → returns `{ hash, url }`. The note content stores `![alt](/api/images/<hash>)` markdown syntax. The note view renders these as `<img>` tags.

**Why not inline base64 in note content?** Same reason as D2 — bloats the content column and makes sync expensive.

### D5: Excalidraw thumbnail still uses exportToBlob (no change)

Thumbnail generation already receives `files` and passes them to `exportToBlob`. No changes needed — it will naturally include image content once images are present.

## Risks / Trade-offs

**[Risk] Large images in WebSocket deltas** → Mitigation: The `files` entries in deltas contain the full base64 dataURL at sync time (before server extraction). For very large images this could be slow. Acceptable for a local network app. Future optimization: upload image first, send only hash in delta.

**[Risk] Disk usage growth** → Mitigation: Content-hash dedup means no duplicates. No cleanup for orphaned images yet (images from deleted notes). Acceptable for single-user app; can add GC later.

**[Risk] Excalidraw internal fileId changes across versions** → Mitigation: We store the mapping `fileId → {hash, mimeType, ext}` in `state.files`, so we control the linkage regardless of how Excalidraw generates IDs.

**[Trade-off] Base64 in delta vs pre-upload** → We chose to keep Excalidraw's native flow (base64 in files object) for simplicity. This means the full image travels through the WebSocket once. Pre-upload would require intercepting Excalidraw's image insertion, which is fragile.

## Migration Plan

1. Ensure `data/images/` directory exists (created at startup)
2. Existing notes without images are unaffected — `files: {}` is already the default
3. No schema changes needed — `canvasData` JSON already supports a `files` key
4. Rollback: disable image tool again, ignore `files` in deltas
