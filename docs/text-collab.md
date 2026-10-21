# Live Text Collaboration

Text notes use a Yjs CRDT document per note, shared over the existing
`/ws?token=` WebSocket. The live document is a **shared draft**:

- every edit is broadcast immediately and merged character-by-character;
- a reload, reconnect, or second tab does not lose the draft;
- the draft is stored in `note_text_docs`, but it is **not** a revision;
- pressing **Save** commits the current draft as a normal revision and updates
  the note head. The existing stale-base/branch rules still apply.

## Editing

- **Visual** mode captures and restores the caret around a remote re-render.
  Remote updates arriving during IME composition are deferred until
  `compositionend`.
- **Source** mode updates the textarea and restores the selection.
- The title is synchronized through a `Y.Map`.
- The editor header shows `● Live` and the number of active editors.
- The dashboard shows a green presence dot on any card (text or whiteboard)
  that another tab, device, or user currently has open.

Yjs updates are additive. When restore/promote replaces the head, the server
broadcasts `text-reset`; clients discard their local `Y.Doc` and create a new
one from the reset snapshot instead of merging the old draft into the new head.

## Persistence and Save

`note_text_docs(note_id, update_data, base_revision_id, updated_at)` stores the
Yjs state. The server batches writes with a 400 ms debounce.

- A clean draft (text and title equal to the head) is deleted when the last
  editor leaves.
- `text-discard` deletes a draft only when the sender is the last editor.
- A Save from the browser updates the draft's `base_revision_id` and broadcasts
  `text-saved` with the committed title/content. Other open editors update their
  base and their dashboard card content.
- An MCP or external edit does **not** move the draft base. The next Save sees a
  stale base and creates a branch, preserving history.

## Protocol

Client → server:

```json
{ "type": "text-join", "noteId": "..." }
{ "type": "text-leave", "noteId": "..." }
{ "type": "text-update", "noteId": "...", "update": "<base64 Yjs update>" }
{ "type": "text-discard", "noteId": "..." }
```

Server → client:

```json
{ "type": "text-snapshot", "noteId": "...", "update": "<base64>", "stateVector": "<base64>", "baseRevisionId": "...", "revisionNo": 3 }
{ "type": "text-update", "noteId": "...", "update": "<base64>" }
{ "type": "text-saved", "noteId": "...", "baseRevisionId": "...", "revisionNo": 4, "title": "...", "content": "..." }
{ "type": "text-reset", "noteId": "...", "update": "<base64>", "baseRevisionId": "...", "revisionNo": 5 }
{ "type": "text-discarded", "noteId": "..." }
```

Presence is separate:

```json
{ "type": "presence", "presence": { "<noteId>": { "count": 1, "users": [...] } } }
{ "type": "presence", "noteId": "...", "count": 2, "users": [...] }
```

## Limitations

- Live text updates are draft-only; search, tags, links, embeddings, and the
  note card markdown are updated on Save, not on every keystroke.
- Undo/redo remains the browser/contentEditable undo stack. A remote re-render
  can clear native undo history; this is not yet a Yjs `UndoManager`.
- The live draft is stored per note, not per session. Closing the last editor
  with unsaved changes removes the draft only on explicit Discard; Save commits
  it.
