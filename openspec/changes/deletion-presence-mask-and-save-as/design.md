## Context

`DELETE /api/notes/:id` and `POST /api/notes/batch-delete` both end with `broadcastNotes()` which sends the full `notes` array to every open WebSocket. On the client, the WS handler in `App.vue:402` only updates `notes.value` when the modal is closed, otherwise it buffers into `pendingNotes` until the modal closes. Consequences:

1. Text-note editor with the modal open on the deleted note: the user keeps editing; on Save the server returns `404`, the promise rejects, and the modal stays open with no user feedback. Edits lost on next refresh.
2. Whiteboard editor viewing the deleted note: the bulk `notes` broadcast arrives but the canvas view never re-reads `notes.value`. The user keeps drawing. Their next delta is accepted by the in-memory `noteStates` (which still exists) and `schedulePersist` runs an `UPDATE` that affects 0 rows; the data is silently dropped — but the `notes_fts` row is re-inserted, leaving dangling FTS entries.
3. Non-editing clients: fine, gallery refreshes via the bulk broadcast.

The requirement: detect deletion remotely and **mask** the editor (no alert popup), then prompt the user to **Save as** (new note) or **Discard**.

## Goals / Non-Goals

**Goals:**
- A client currently editing or viewing a deleted note detects this within ~1 second.
- Detection triggers a mask overlay over the editor (no `alert()`), with a non-blocking prompt offering **Save as new note** and **Discard**.
- **Save as** preserves the user's local edits by creating a fresh note; **Discard** drops them. Neither blocks other views/clients.
- Server stops accepting further deltas/persists for a deleted noteId (closes the silent-data-loss hole for whiteboards).
- Existing gallery refresh behaviour for non-editing clients is unchanged.

**Non-Goals:**
- "Tombstones" or undo of deletion (delete is final; Save-as is the recovery).
- Conflict resolution UI for concurrent edits.
- Multi-select Save-as for batch-deleted notes (each affected open note is masked independently).
- Server-side snapshot retention of the last state to enable a richer "Restore" — out of scope; Save-as from the client buffer is enough.

## Decisions

### Decision 1: Targeted `note-deleted` broadcast in addition to bulk `notes`
After the DB DELETE in `DELETE /api/notes/:id` and after all deletes in `batch-delete`, broadcast `{ type: 'note-deleted', noteId, deletedAt: <epochMs> }` to every connected client. Keep `broadcastNotes()` as well for gallery refresh.

Why targeted: the bulk `notes` broadcast gives the list but no per-note event; the client would have to diff against its current list to notice — which it can't do for a note that no longer exists in the new list AND is currently open in the modal. Adding a per-note event makes detection trivial (`if (data.type === 'note-deleted' && data.noteId === openNoteId)`).

### Decision 2: Mask + non-blocking prompt, not an alert
`deletedNoteMask` is a reactive state (`{ noteId, deletedAt } | null`). When set AND the current view matches `noteId`, the editor view renders a `.deleted-mask` overlay (absolute-positioned, semi-opaque, pointer-events: all) with the prompt inline. No `window.confirm` or `alert`. The user can click **Save as** or **Discard**.

### Decision 3: Save-as flow reuses existing create path
For a text note: call the same code path as `addNote` but with the current local buffer (`newNoteTitle`, `newNoteContent`). Server creates a fresh note with a new id. On success: close mask, close modal.
For a canvas: gather current `collab.currentElements` + `collab.currentFiles`, create a new canvas note via `POST /api/notes` with `type: 'canvas'`, then attach/detach `collabManager` to the new noteId (`detach(oldWs); { noteId } = result; attach(newWs)`). The freshly-created note is selected.

### Decision 4: Server rejects deltas/persists for deleted notes
The `noteStates` Map entry is deleted when a note is removed. In the `delta` handler, if `!noteStates.has(noteId)`, reply to the sender only with `{ type: 'note-gone', noteId }` and skip broadcasting. The client's `collabManager` on `note-gone` sets `detached = true`, cancels `debounceTimer` (don't fire a final persist that likely fails), and surfaces the same mask (the client may have detected via `note-deleted` first; idempotent).

### Decision 5: Existing `pendingNotes` integration
If the user discards (closes modal), the modal closes and `pendingNotes` (if any) replaces `notes.value` per the existing close flow — now correctly excluding the deleted note.

### Decision 6: Idempotency / duplicate
A client that's the originator of the delete does its local filter immediately (already does in `confirmDelete`) and doesn't need the mask. The `note-deleted` broadcast includes the originator too, but the originator's modal/canvas isn't on the deleted id (it just deleted it) so the mask check (`noteId === currentOpenNoteId`) won't match. No special-casing needed.

## Risks / Trade-offs

- **[Risk] Stray `note-deleted` arrives before the user opened the note** — masked-state guard checks `currentOpenNoteId === data.noteId`; if no match, ignore (and rely on bulk broadcast for gallery). Safe.
- **[Risk] Save-as during an unsaved canvas state loses in-flight edits buffered in collabManager** — Decision 3 explicitly reads from `collab.currentElements/files` (the live items), and the collabManager's debounce is cleared. Safe as long as implementation flushes debounce-ahead changes to `currentElements` first — tracked in tasks.md (#3.3).
- **[Risk] Server restart resets `noteStates`, so a deleted note's in-memory state is gone — good** (we want re-create-via-Save-as). But a stale client that had a `noteStates` reference then deltas will hit the `note-gone` branch — exactly correct.
- **[Risk] Out-of-order: `note-deleted` arrives but the user already saved-as / navigated away** — check current open note id; if different, no-op. Idempotent.
- **[Risk] Two deletion sources (`note-deleted` broadcast AND `note-gone` response)** — both lead to the same `enterDeletedMask()`; guard on first-only.

## Migration Plan

1. Ship server: emit `note-deleted` on deletes; reject deltas on deleted notes with `note-gone`.
2. Ship client: handle both messages; add mask UI + Save-as/Discard.
3. No DB migration.
4. Rollback safe: removing the new message handling reverts to old behavior (silent 404 on save / silent whiteboard loss). No data corruption.

## Open Questions

none.
