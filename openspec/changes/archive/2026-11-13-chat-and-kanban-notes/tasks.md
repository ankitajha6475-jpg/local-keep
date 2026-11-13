# Tasks: Chat Room, Kanban Board, and Universal Tags

## 1. Universal Note Header & Tags Component

- [x] 1.1 Create `src/components/NoteHeader.vue` supporting title editing, color selection, tag chips, tag autocomplete combobox, revision badge, and actions slot
- [x] 1.2 Wire `NoteHeader.vue` into `WhiteboardEditor.vue` with color changes, tag changes, and back/page actions
- [x] 1.3 Add backend `PATCH /api/notes/:id/properties` route in `server.js` allowing tag edits on all note types
- [x] 1.4 Test tag and color sync on canvas notes

## 2. Chat Room Note Type (`type: 'chat'`)

- [x] 2.1 Update `src/server/services/notes.js` and `src/server/services/revisions.js` to support discrete chat message delta revisions and transcript head updates
- [x] 2.2 Update `src/server/fts.js` to index chat message text in SQLite FTS
- [x] 2.3 Implement WebSocket and REST endpoints for chat (`POST /api/notes/:id/chat/messages`, `chat-send`, `chat-delta`)
- [x] 2.4 Create `src/components/ChatRoomEditor.vue` with message timeline, avatars, auto-scrolling, and input composer
- [x] 2.5 Add Chat card preview in `src/components/DashboardNoteCard.vue` and new Chat creation button on dashboard

## 3. Kanban Board Note Type (`type: 'kanban'`)

- [x] 3.1 Implement kanban board serialization helpers and action suite delta commits in `src/server/services/notes.js` / `revisions.js`
- [x] 3.2 Update `src/server/fts.js` to index kanban card titles and markdown descriptions
- [x] 3.3 Create `src/components/KanbanBoardEditor.vue` with columns, cards, checklist progress, drag-and-drop, and idle debounced auto-save
- [x] 3.4 Add Kanban card preview in `src/components/DashboardNoteCard.vue` and new Kanban creation button on dashboard

## 4. Verification & Testing

- [x] 4.1 Add test suite in `tests/chatNotes.test.js` covering discrete message deltas, version bumping, and FTS indexing
- [x] 4.2 Add test suite in `tests/kanbanNotes.test.js` covering board action deltas, column/card operations, and FTS indexing
- [x] 4.3 Add test suite in `tests/universalTags.test.js` verifying tags on whiteboard, chat, and kanban
- [x] 4.4 Run full test suite (`npm test`) and build check (`npm run build`)
- [x] 4.5 Update `CHANGELOG.md` and `AGENTS.md`
