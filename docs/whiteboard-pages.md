# Whiteboard Pages

A whiteboard can be exported as multiple ordered PNG pages instead of a single thumbnail.
Rendering happens in the browser because Excalidraw's `exportToBlob` needs the DOM and
loaded fonts; the server stores the resulting images and manifest.

## Rendering

Open a whiteboard → **Pages** in the header:

- **Render now** exports the current board.
- Leaving the board renders automatically when the scene changed since the last render.
- A connected browser can also be asked to render via the WS `render-request` event
  (`POST /api/notes/:id/renders/request` or MCP `get_whiteboard` with
  `render_if_stale: true`).

The planner clusters elements spatially, keeps groups/frames/bound arrows/text together,
orders clusters top-to-bottom in bands and left-to-right within a band, then packs them
into 1600×1600 scene-unit pages (gap 48). Pages are exported at up to 2000 px with 24 px
padding. A single oversized solid cluster is exported as one page and flagged `clipped`.

## Pages drawer

- Ordered page thumbnails with page numbers.
- `Render now`, `Copy markdown`, `Download all`.
- `Stale` badge when the head canvas changed after the render.
- `Rendered <timestamp>`.

Copy markdown produces:

```markdown
![Whiteboard page 1](/api/images/ab12.png)
![Whiteboard page 2](/api/images/cd34.png)
```

## Data/API

- `whiteboard_renders` holds the manifest (scene hash, renderer version, source, timestamp,
  current flag).
- `whiteboard_tiles` holds ordered pages (hash, dimensions, bbox, element ids, clipped).
- `GET /api/notes/:id/renders/latest`
- `PUT /api/notes/:id/renders`
- `POST /api/notes/:id/renders/request`

`stale` compares the render `scene_hash` with the head `canvas_hash`. Legacy thumbnails are
one-tile renders with `source='legacy-thumbnail'` until the board is re-rendered.

## MCP

`get_whiteboard` returns page images in order (default `format: "images"`, max 4 tiles) or
ordered markdown image refs (`format: "markdown"`). If no browser is connected and the
render is stale, the tool returns the last manifest with `stale: true` and a notice; it does
not fail.
