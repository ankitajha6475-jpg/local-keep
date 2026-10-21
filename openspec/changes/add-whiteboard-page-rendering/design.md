## Context

See `proposal.md` and `specs/whiteboard-pages/spec.md`. `whiteboard_renders`/`whiteboard_tiles` already exist and hold legacy single-tile thumbnails (migration 001). `canvas_hash` is maintained on the head by whiteboard checkpoints. The client already has the live Excalidraw API, files, and a thumbnail exporter.

## Goals / Non-Goals

**Goals:**

- Deterministic, testable reading-order page planning.
- Sequential browser export and ordered manifest storage.
- Staleness, render triggers, and a usable Pages drawer.
- Keep the legacy thumbnail path working until re-render.

**Non-Goals:**

- Server-side/headless rendering.
- Perfect splitting of a single solid drawing that has no whitespace gaps (flagged clipped).
- Editing pages as independent canvases.
- MCP tool surface (next change) — but the manifest must be MCP-ready.

## Decisions

### D1: Pure planner separated from DOM export

`src/utils/whiteboardTiles.js` accepts elements plus an optional `getBounds(el)` callback and returns pages. It has no Excalidraw/DOM dependency, so it is unit-testable with synthetic bboxes. The client supplies `getCommonBounds` from `@excalidraw/excalidraw`.

### D2: Atomic units by groups/frames/bindings

Union-find at element level:

- elements sharing any `groupIds` entry;
- a frame element with its `frameId` children;
- bound text with `containerId`;
- arrows with `startBinding`/`endBinding` endpoints.

Units get a bbox from their elements. Spatial clustering then unions units whose bboxes (expanded by `gap/2`) intersect.

### D3: Reading order = bands + x sort

Sort clusters by `minY`. A cluster joins the current band when its `minY <= bandMaxY + rowTolerance`; otherwise start a new band. Within a band sort by `minX`. Default `rowTolerance` is derived from median cluster height (clamped 24–80). This matches left-to-right, top-to-bottom.

### D4: Greedy page packing

Default `maxPageW/H = 1600` scene units. Add clusters in order while the union bbox fits; otherwise start a page. A single cluster larger than a page becomes its own page and is flagged `oversized`/`clipped` when extreme. No element is cut in normal packing because split lines are chosen in whitespace.

### D5: Client export and manifest

`WhiteboardEditor` uses `planPages`, then for each page:

- select the page's elements (plus bound text/arrows already grouped);
- `exportToBlob({ elements, files, appState: { exportBackground: true, viewBackgroundColor }, mimeType: 'image/png', maxWidthOrHeight: 2000, exportPadding: 24 })`;
- upload to `/api/images` (existing endpoint), collect `{hash, url, width, height}`;
- POST `/api/notes/:id/renders` with `sceneHash`, ordered tiles, bbox/element ids, `rendererVersion`.

Sequential export avoids memory spikes; show `Rendering page X/N` and cancel if the scene hash changes. `sceneHash` uses the same canonical hash as the server (`computeCanvasHash`).

### D6: Manifest storage and staleness

`PUT /api/notes/:id/renders` inserts a `whiteboard_renders` row, marks older renders `is_current=0`, inserts ordered `whiteboard_tiles`, adds tile hashes to `image_refs`, and emits `render.updated`. `GET latest` returns tiles ordered by `page_index` and `stale = render.scene_hash !== notes.canvas_hash`. Legacy renders have `source='legacy-thumbnail'`, `renderer_version=0`, and `stale` computed normally (usually true after edits).

### D7: Triggers and on-demand requests

- Manual **Render now**.
- On `goBack`, after the checkpoint flush, if the scene hash differs from the last render, render pages (fire-and-forget with status).
- Optional idle render (default off; configurable) to avoid interrupting drawing.
- WS `render-request {noteId, requestId}` → client renders → POST manifest → `render-complete {noteId, requestId, renderId}`. The server can later wait for this for MCP; in this change it only acknowledges and updates the UI.

### D8: Pages drawer and card badge

The drawer lists page thumbnails from the manifest, shows `renderedAt`/stale, and provides Copy markdown (`![Whiteboard page N](/api/images/...)`) and Download all (individual anchor downloads; no zip dependency). The card uses the existing thumbnail and, if a render manifest is available, a `N pages` badge. Avoid fetching manifests for every card; the badge can be omitted until the next MCP/notes enrichment change.

## Risks / Trade-offs

- **Export cost** → sequential export, manual/leave triggers, size cap, cancellation.
- **No browser open** → MCP requests return stale/last render; this change only stores/requests; the MCP change will define timeout behavior.
- **Solid huge drawing** → one scaled page or clipped grid; flag it in the manifest/UI.
- **Scene hash mismatch** → use `computeCanvasHash` server-side; client sends its hash and server can recompute from head for validation.
- **Image bloat** → PNGs are content-addressed and deduped; tile refs protect them from cleanup.
- **Legacy render** → keep and mark stale; no destructive migration.

## Migration Plan

No schema migration. Existing legacy renders remain current until a page render replaces them. Deploy client and server together; older clients ignore new events/manifest. Rollback: stop using the render endpoints; legacy thumbnails remain.

## Open Questions

None blocking. Page size defaults and idle-render policy can be tuned after real boards are rendered.
