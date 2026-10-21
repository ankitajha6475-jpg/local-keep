## Why

A whiteboard is currently represented by one 400px thumbnail. The wishlist requires recalling a whole board as multiple page images in reading order (left-to-right, top-to-bottom), both in the UI and through MCP later. The existing `whiteboard_renders`/`whiteboard_tiles` tables were introduced for this but only legacy thumbnails populate them.

## What Changes

- Add a pure page planner that clusters whiteboard elements spatially, orders clusters in reading order, and packs them into page-sized images.
- Render pages in the browser with Excalidraw `exportToBlob` (fonts/DOM required), upload PNGs to `/api/images`, and store an ordered manifest.
- Add a whiteboard **Pages** drawer: ordered thumbnails, render-now, copy markdown, download, staleness badge.
- Add render manifests to the API:
  - `GET /api/notes/:id/renders/latest`
  - `PUT /api/notes/:id/renders`
  - `POST /api/notes/:id/renders/request` (asks a connected browser to render)
- Add WS `render-request`/`render-complete`/`render-updated` events and ack.
- Mark renders stale by comparing `scene_hash` with the head `canvas_hash`; show the timestamp.
- Keep the legacy thumbnail as a one-tile render until the board is re-rendered.
- Add planner, manifest API, and staleness tests.

## Capabilities

### New Capabilities

- `whiteboard-pages`: Reading-order page planning, browser page export, ordered render manifests, staleness, and page UI.

### Modified Capabilities

<!-- No existing spec covers whiteboard page rendering. whiteboard-images remains the image
     storage contract; this change only adds derivative page images. -->

## Impact

- **Client**: `src/utils/whiteboardTiles.js`, `WhiteboardEditor.vue` render/upload/drawer, `App.vue` page badge/copy affordances, `collabManager` checkpoint interaction remains.
- **Server**: render service/routes use the existing `whiteboard_renders`/`whiteboard_tiles`; image refs include tiles; render events.
- **No schema change** (tables already exist).
- **No new runtime dependency**; export stays in the browser (no headless Chromium).
- **MCP later** will consume the manifest; no MCP in this change.
