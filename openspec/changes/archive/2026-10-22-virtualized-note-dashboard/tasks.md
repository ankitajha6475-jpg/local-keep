## 1. Server index and window APIs

- [x] 1.1 Add `notes.listNoteIndex()` with summary fields, tags, and link counts
- [x] 1.2 Add `notes.listNoteCardsByIds()` returning ordered card DTOs without `canvasData`
- [x] 1.3 Add `GET /api/notes/index` and `POST /api/notes/window`
- [x] 1.4 Change the WebSocket bulk `notes` message to index summaries
- [x] 1.5 Add API tests for index fields, archived inclusion, ordering, and canvas omission

## 2. Virtualized dashboard

- [x] 2.1 Add `vue-virtual-scroller` and its stylesheet
- [x] 2.2 Add pure row-chunking and visible-range helpers with tests
- [x] 2.3 Extract the card markup into `DashboardNoteCard.vue`
- [x] 2.4 Render responsive virtual rows in page mode with a fixed buffer
- [x] 2.5 Add a ResizeObserver-driven column count and fixed row height
- [x] 2.6 Keep Quick Shortcuts, Drafts, archived styling, colors, and presence

## 3. Index and detail state

- [x] 3.1 Load the index in `loadNotes()` and compute filters/counts/search from it
- [x] 3.2 Add a reactive detail cache with batched hydration and in-flight deduplication
- [x] 3.3 Prefetch around the visible range and evict outside the fixed window
- [x] 3.4 Show skeleton cards while details load
- [x] 3.5 Update open paths to fetch full notes (including canvas data) before editing
- [x] 3.6 Track the editing baseline for unsaved-change detection
- [x] 3.7 Apply optimistic create/edit/color/restore updates to index and cache
- [x] 3.8 Invalidate cached details from WebSocket index changes

## 4. Verification and docs

- [x] 4.1 Run the full node:test suite
- [x] 4.2 Run the production build
- [x] 4.3 Browser-test virtualization, scroll hydration, tabs, search, tags, selection, and opening notes
- [x] 4.4 Update `AGENTS.md`, `README.md`, `CHANGELOG.md`, and OpenSpec validation
- [ ] 4.5 Archive after review
