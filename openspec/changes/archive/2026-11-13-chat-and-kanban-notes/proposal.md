# Proposal: Chat Room, Kanban Board, and Universal Tags

## Summary

Expand Local Keep with two new first-class document types — **Chat Room** (`type: 'chat'`) and **Kanban Board** (`type: 'kanban'`) — alongside universal tag support and a shared metadata header across all note types (Text, Canvas, Chat, Kanban).

## Problem

1. **Diverse Note Workflows**: Users need conversational threads (growing message history, transcript format) and agile task boards (columns, card drag-and-drop), but currently only free-form text and Excalidraw whiteboards are supported.
2. **Delta Growth vs Full Rewrite**: Text notes rewrite the whole document on save. Chat rooms and kanban boards naturally evolve via discrete deltas:
   - Chat: Each sent message appends a discrete delta revision rather than rewriting the entire conversation history from scratch.
   - Kanban: Revisions record semantic action suites (cards moved, columns renamed/reordered) committed on idle/save.
3. **Inconsistent Tag Presentation**: Text notes have a properties panel with tag chips; whiteboards only extract tags from raw canvas text and lack visual tag chips in the editor header. All document types must support uniform tagging.

## Proposed Solution

1. **Universal Note Header & Tags (`NoteHeader.vue`)**:
   - Shared header with Title input, 12-color picker, tag chips list + autocomplete input, and revision indicator `v<revisionNo>`.
   - Used across Text note editor, Whiteboard editor, Chat room, and Kanban board.
   - Persists tags to `note_tags` and syncs properties across all types.
2. **Chat Room (`type: 'chat'`)**:
   - Head stores structured JSON transcript in `notes.content`. FTS indexes transcript text.
   - 1 message sent = 1 discrete revision bump in `note_revisions` storing `{ type: 'chat_message', messageId, sender, text, timestamp }`.
   - Interactive Vue chat UI with message bubbles, sender identity, timestamp, and responsive composer.
   - Live synchronization over WebSocket (`chat-send`, `chat-delta`).
3. **Kanban Board (`type: 'kanban'`)**:
   - Head stores structured JSON board layout in `notes.content` (columns, cards with markdown checklist items and card color tints).
   - Interactive Vue kanban board with columns, card addition, column addition/rename, and drag-and-drop.
   - Delta action suites recorded in `note_revisions` upon auto-save on idle (1-2s debounce) or explicit Save button.
4. **Dashboard Integration**:
   - First-class cards on the virtualized dashboard: Chat card shows recent message snippet and participant avatars; Kanban card shows column summary pills and card counts.
   - Tag filtering, search (FTS & semantic), archiving, and color tinting work uniformly across all 4 document types.
