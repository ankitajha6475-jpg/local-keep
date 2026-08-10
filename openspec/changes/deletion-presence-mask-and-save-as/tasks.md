## 1. Server: emit `note-deleted`

- [x] 1.1 Add a `broadcastToAllClients(message)` helper (iterate every ws in `clients.values()`), or reuse existing `broadcastNotes` pattern generalized
- [x] 1.2 In `DELETE /api/notes/:id` (~server.js:646), after a successful delete and after `broadcastNotes()`, call `broadcastToAllClients({ type: 'note-deleted', noteId: req.params.id, deletedAt: Date.now() })`
- [x] 1.3 In `POST /api/notes/batch-delete` (~661), after rows are deleted and after `broadcastNotes()`, emit `note-deleted` for each deleted id (loop)
- [x] 1.4 Clear `noteStates.delete(noteId)` for deleted ids in both handlers so subsequent deltas are rejected

## 2. Server: reject deltas for deleted notes

- [x] 2.1 In the `delta` WS handler, before applying, check `if (!noteStates.has(noteId))` → `ws.send(JSON.stringify({ type: 'note-gone', noteId }))` and `return` (no apply, no broadcast)
- [x] 2.2 Verify `applyDelta()` / `schedulePersist()` are NOT reached for the rejected case

## 3. Client: WS handler + state

- [x] 3.1 Add reactive `deletedMask = reactive({ noteId, deletedAt } | null)` in `App.vue`
- [x] 3.2 In WS `onmessage` (~App.vue:402), add `else if (data.type === 'note-deleted')` → call `handleNoteDeletedElsewhere(data.noteId, data.deletedAt)`
- [x] 3.3 Implement `handleNoteDeletedElsewhere(noteId, deletedAt)`: if `(isModalOpen.value && editingId === noteId) || (currentView === 'canvas' && currentCanvasNoteId === noteId)` → set `deletedMask = { noteId, deletedAt }`; else ignore (gallery refresh handled by bulk broadcast)

## 4. Client: mask UI (no alert/confirm)

- [x] 4.1 Add a `<div class="deleted-mask" v-if="deletedMask && openViewMatchesDeletedNoteId">` overlay rendered ABOVE the modal body / canvas area, semi-opaque, pointer-events: all
- [x] 4.2 Inside the mask: a small panel with explanatory text ("This note was deleted on another client.") and two buttons: **Save as new note** and **Discard**
- [x] 4.3 Style: `.deleted-mask` covers the editor surface (absolute within modal/canvas container), with the panel centered; disabled look on the editor behind it
- [x] 4.4 Do NOT use `window.alert` or `window.confirm` anywhere in this flow

## 5. Client: Save-as flow

- [x] 5.1 Text note Save-as: reuse `addNote` flow — call `POST /api/notes` with `title: newNoteTitle.value`, `content: newNoteContent.value`, `type: 'text'`; on success, close the mask, close the modal, emit a local `notes` update so the new note appears, and select it
- [x] 5.2 Canvas Save-as: gather `collab.currentElements` and `collab.currentFiles` (flush any in-flight collabManager debounced change to `currentElements` first); call `POST /api/notes` with `type: 'canvas'`, `canvasData: JSON.stringify({ elements, files })`; on success, `collab.detach(oldWs)`, set `currentCanvasNoteId` to the new id, `collab.setNoteId(newId)`, `collab.attach(newWs)`; select the new note
- [x] 5.3 Mask is dismissed (`deletedMask = null`) on successful save-as

## 6. Client: Discard flow

- [x] 6.1 Text note Discard: close the modal via existing `closeModal()`, clear `newNoteTitle`/`newNoteContent`, set `deletedMask = null`
- [x] 6.2 Canvas Discard: `collab.detach(ws)`, exit canvas view (`currentView = 'gallery'`), `deletedMask = null`

## 7. Client: collabManager handles `note-gone`

- [x] 7.1 In `collabManager.handleWsMessage` (~collabManager.js:379), add `else if (data.type === 'note-gone')` → call an exposed callback `onNoteGone?.(noteId)`, set `detached = true`, cancel `debounceTimer` (no final flush)
- [x] 7.2 In `WhiteboardEditor.vue` / `App.vue`, wire `onNoteGone` to the same `handleNoteDeletedElsewhere` mask routine (idempotent: if `deletedMask.noteId === noteId`, no-op)

## 8. Manual verification

- [ ] 8.1 Two clients open, both viewing whiteboard X. Delete X from client A → client B's canvas is masked with the Save-as/Discard prompt within ~1s
- [ ] 8.2 Same for a text note: A edits X, B deletes X → A's modal is masked
- [ ] 8.3 On client B Save-as → a new note Y is created with B's local edits; the gallery shows Y; the old X is gone
- [ ] 8.4 On client B Discard → editor closes, no save, gallery reflects X gone
- [ ] 8.5 Client C browsing the gallery (not editing X) when X is deleted → no mask, no prompt; gallery refreshes (`notes` bulk broadcast)
- [ ] 8.6 While masked, B sends another delta (e.g., types more) → server replies `note-gone`; B does NOT re-prompt (idempotency)
- [ ] 8.7 Batch-delete: select and delete 3 notes; any client editing one of them is masked for that note only
- [ ] 8.8 Verify no `window.alert` / `window.confirm` is invoked anywhere in the deletion flow
- [ ] 8.9 Update `CHANGELOG.md` under `[Unreleased]` → `Added`: "Real-time cross-client deletion detection: when a note you're editing is deleted elsewhere, your editor is masked and offers Save-as / Discard (no popup)"
