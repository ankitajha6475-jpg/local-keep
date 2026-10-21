## Why

When a note is deleted in one client, other clients that are currently viewing or editing that note are not notified. Today the deletion propagates only via the bulk `notes` broadcast (`broadcastNotes()`), and on those clients the modal/canvas simply keeps running — until the user tries to save and gets an opaque 404, or — worse, for whiteboards — their edits are silently lost on next reload because `persistNoteState`'s `UPDATE` rows = 0 and re-inserts stale data into FTS. Per the user request: when a deletion is detected on another client the editor should NOT pop up an alert; instead it should **mask** the editing surface and prompt asking whether to **Save as** a new note (recovering the local edits into a fresh note).

## What Changes

- Add a new WebSocket message `{ type: 'note-deleted', noteId, deletedAt }` emitted by the server whenever a note is deleted (`DELETE /api/notes/:id`, `POST /api/notes/batch-delete`). This is targeted (per-note) and immediate, independent of the bulk `notes` broadcast.
- In `App.vue`, handle `note-deleted` on the WebSocket: if the deleted note is currently being edited/viewed (modal open OR canvas open on that id), enter a "deleted-elsewhere" mode for that view: mask the editor surface (semi-transparent overlay + disabled inputs/canvas) and show a non-modal prompt offering **Save as new note** and **Discard**.
- **Save as** flow: take the current local edits (title + content for text notes; full elements + files for canvas) and create a new note via `POST /api/notes`. On success, close the masked editor and switch to the new note.
- **Discard** flow: close the editor without saving.
- Other clients (not currently viewing the deleted note) just receive the existing bulk `notes` broadcast and the list updates — no mask, no prompt.
- For whiteboards, additionally: the server SHALL reject incoming deltas and new persist attempts for a deleted noteId with a `{ type: 'note-gone', noteId }` message; the client's collabManager SHALL stop the debounce-persist loop on receipt and rely on the mask UI.
- No autocomplete: the bulk `notes` broadcast remains and continues to refresh the list/gallery for non-editing clients.

## Capabilities

### New Capabilities
- `note-deletion-sync`: Targeted real-time notification of note deletion across clients, with a non-intrusive "mask + Save-as / Discard" UX for any client that was actively viewing or editing the deleted note.

### Modified Capabilities
<!-- None — there is no existing spec covering deletion or live deletion handling. -->

## Impact

- **Affected code**:
  - `server.js`: `DELETE /api/notes/:id` (~646) and `POST /api/notes/batch-delete` (~661) — after `broadcastNotes()`, additionally call `broadcastToAllClients({ type: 'note-deleted', noteId, deletedAt })` (one helper). Also clear `noteStates.get(noteId)` (in-memory) so further deltas are rejected.
  - `server.js`: in the `delta` handler, if `noteStates` has no such noteId (or a per-note `deletedAt` flag is set), respond `{ type: 'note-gone', noteId }` to the sender instead of applying/broadcasting.
  - `src/App.vue`: WS `onmessage` (~402) — add `else if (data.type === 'note-deleted')` branch that calls a new `handleNoteDeletedElsewhere(noteId, deletedAt)`.
  - `src/App.vue`: add `deletedNoteMask` reactive state keyed by `noteId` — when set and the user is on that note, render an overlay + prompt; wire **Save as** → reuse `addNote` logic with the current local buffer; wire **Discard** → `closeModal` / leave canvas.
  - `src/collab/collabManager.js`: add `note-gone` handling in `handleWsMessage` (~379) — stop the flush/persist debounce, mark the manager as detached.
- **New message types**: `{ type: 'note-deleted', noteId, deletedAt }` (server → client, broadcast to all clients), `{ type: 'note-gone', noteId }` (server → single sender, in response to a delta on a deleted note).
- **No DB schema change.**
- **Backward compat**: older clients that don't handle `note-deleted` ignore it and behave as before (no worse than current). They'll still catch up via the bulk `notes` broadcast unless they have the modal open — but that's the pre-existing behavior we're explicitly fixing here.
