## 1. Planner

- [x] 1.1 Add `src/utils/whiteboardTiles.js` with grouping/binding unions, spatial clustering, reading-order bands, and greedy packing; verify unit tests
- [x] 1.2 Add tests for rows/columns, multi-page packing, bound arrows/text/frames, oversized/empty boards; verify `npm test`

## 2. Server manifest

- [x] 2.1 Add render service: save manifest (tiles ordered, old renders non-current, image refs) and latest manifest with staleness; verify tests
- [x] 2.2 Add `GET /api/notes/:id/renders/latest` and `PUT /api/notes/:id/renders`; verify API tests
- [x] 2.3 Add `POST /api/notes/:id/renders/request` and WS `render-request`/`render-complete`/`render-updated`; verify WS test
- [x] 2.4 Handle empty boards and legacy thumbnails; verify tests

## 3. Client export

- [x] 3.1 Add page planning/export/upload/manifest posting to `WhiteboardEditor.vue`; verify build
- [x] 3.2 Trigger render on back (after checkpoint) and add a manual Render now action; verify build
- [x] 3.3 Add progress/cancel/stale handling and avoid parallel exports; verify build

## 4. Pages UI

- [x] 4.1 Add Pages drawer with ordered thumbnails, timestamps, stale badge, Render now, Copy markdown, Download all; verify build
- [x] 4.2 Add page-count/staleness affordance to the card or header where cheap; verify build
- [x] 4.3 Wire WS render requests to the client and acknowledgements to the server; verify test

## 5. Verification and docs

- [x] 5.1 Run `npm test` and `npm run build`; verify pass
- [x] 5.2 Update `CHANGELOG.md`, `AGENTS.md`, and the architecture plan status
- [x] 5.3 Manually render a multi-cluster board; verify order, multiple pages, reload persistence, copy markdown, stale badge
- [x] 5.4 Check legacy canvas thumbnails still display before re-render
