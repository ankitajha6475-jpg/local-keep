# Design: Chat Room, Kanban Board, and Universal Tags

## Architectural Overview

```
Document Types in Local Keep:
┌─────────────────┬───────────────────────┬──────────────────────┬──────────────────────┐
│ Text Note       │ Whiteboard Note       │ Chat Room Note       │ Kanban Board Note    │
│ type: 'text'    │ type: 'canvas'        │ type: 'chat'         │ type: 'kanban'       │
├─────────────────┼───────────────────────┼──────────────────────┼──────────────────────┤
│ Markdown body   │ Excalidraw JSON       │ JSON Transcript      │ JSON Board Layout    │
│ Head: content   │ Head: canvasData      │ Head: content        │ Head: content        │
│ Rev: Full-text  │ Rev: Lean elements    │ Rev: Single msg delta│ Rev: Action deltas   │
└─────────────────┴───────────────────────┴──────────────────────┴──────────────────────┘
                  ▲                       ▲                      ▲
                  └───────────────────────┴──────────────────────┘
                                  │
                 Universal Note Header (`NoteHeader.vue`)
                 - Title input
                 - 12-color picker
                 - Tag chips + autocomplete
                 - Version badge (v1, v2...)
```

## 1. Universal Note Header (`src/components/NoteHeader.vue`)

- Encapsulates:
  - Editable title input with auto-resize/full-width styling.
  - Palette color button with popup menu (`NOTE_COLOR_OPTIONS`).
  - Tag chips: `#tag-name` with dismissible remove button `×`.
  - Tag autocomplete combobox: typing searches `knownTags` with fuzzy ranking, Enter/comma commits, up/down arrows navigate.
  - Revision badge `v<revisionNo>`.
  - Action buttons slot: parents insert view-specific actions (e.g. Whiteboard pages/render/pen/fullscreen, history, graph, backlinks, close).
- Tag storage for Canvas notes:
  - Canvas notes keep tags in the properties fence of `notes.content` (`---\ntags:\n  - my/tag\n---\n`).
  - Synchronizes to `note_tags` on every edit via `tags.syncNote(id, content, canvasData)`.

## 2. Chat Room Note (`type: 'chat'`)

### Head Data Shape (`notes.content`)
```json
{
  "messages": [
    {
      "id": "msg_1715610000000_abc",
      "sender": "user:alex",
      "senderName": "Alex Rivera",
      "text": "Hello team, let's discuss the release.",
      "timestamp": "2026-11-13T10:00:00.000Z"
    }
  ]
}
```

### Discrete Delta Revision
```json
{
  "type": "chat_message",
  "message": {
    "id": "msg_1715610000000_abc",
    "sender": "user:alex",
    "senderName": "Alex Rivera",
    "text": "Hello team, let's discuss the release.",
    "timestamp": "2026-11-13T10:00:00.000Z"
  }
}
```
- Stored in `note_revisions` with `source: 'chat'`.
- Every message increment: revision number bumps by +1.
- WebSocket message: `{ type: 'chat-message', noteId, message }` broadcasts to clients.

## 3. Kanban Board Note (`type: 'kanban'`)

### Head Data Shape (`notes.content`)
```json
{
  "columns": [
    { "id": "col_todo", "title": "To Do", "order": 1000 },
    { "id": "col_doing", "title": "In Progress", "order": 2000 },
    { "id": "col_done", "title": "Done", "order": 3000 }
  ],
  "cards": [
    {
      "id": "card_1",
      "columnId": "col_todo",
      "title": "Setup Docker",
      "description": "- [ ] install compose\n- [ ] run service",
      "color": "amber",
      "order": 1000
    }
  ]
}
```

### Action Suite Delta Revision
```json
{
  "type": "kanban_delta_suite",
  "actions": [
    { "type": "card_moved", "cardId": "card_1", "fromColumnId": "col_todo", "toColumnId": "col_doing", "order": 1500 }
  ]
}
```
- Idle debounce: 1.5s after user interactions or explicit Save button commits the delta suite.
- Revision bump: only when dirty changes are committed.

## 4. Dashboard & Index Integration

- `listNoteIndex`: includes `type: 'chat'` and `type: 'kanban'`.
- `fts.js`:
  - For chat: indexes text of all messages in `messages`.
  - For kanban: indexes titles and descriptions of all cards in `cards`.
- Dashboard Card:
  - Chat preview: shows latest message snippet and message count.
  - Kanban preview: shows column badges and card count.
