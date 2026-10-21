# Whiteboard Pages

## Purpose

Renders a whiteboard into multiple ordered page images so large boards can be viewed, copied, and later recalled by MCP without losing their reading order.

## Requirements

### Requirement: Reading-order page planning

The system SHALL cluster whiteboard elements spatially and order clusters left-to-right within top-to-bottom bands. Elements connected by groups, frames, containers, or arrow bindings MUST stay in the same cluster. Clusters SHALL be greedily packed into pages bounded by configurable maximum width/height. The planner MUST NOT cut an element in normal gap-based packing; when a single oversized cluster cannot be split cleanly it MAY be exported as one scaled page or a grid fallback and MUST flag `clipped`.

#### Scenario: Three separated clusters

- **WHEN** a board has three spatially separated clusters at top-left, top-right, and bottom-left
- **THEN** the planner returns pages in top-left, top-right, bottom-left order

#### Scenario: Large board packs multiple pages

- **WHEN** clusters exceed the maximum page dimensions
- **THEN** the planner produces multiple pages while preserving cluster order
- **AND** no element is split across pages in normal packing

#### Scenario: Bound elements stay together

- **WHEN** an arrow connects two clusters or a text element is bound to a container
- **THEN** the connected elements are placed on the same page

### Requirement: Browser page export

The client SHALL export each planned page with Excalidraw `exportToBlob` using the page's elements and files, a light background, padding, and a bounded output size. Pages SHALL be exported sequentially with progress and cancellation when the scene changes. PNGs SHALL be uploaded to content-addressed `/api/images`.

#### Scenario: Render pages

- **WHEN** the user clicks Render pages
- **THEN** each page is exported and uploaded
- **AND** a manifest with ordered tile hashes/metadata is posted
- **AND** progress is visible

### Requirement: Ordered render manifest

The server SHALL store a render manifest with scene hash, renderer version, source, ordered tiles (`page_index`, image hash, URL, dimensions, bbox, element ids, clipped), and timestamp. `GET /api/notes/:id/renders/latest` SHALL return the current manifest with a `stale` flag computed against the head canvas hash.

#### Scenario: Read the latest manifest

- **WHEN** a client requests the latest render
- **THEN** tiles are returned in ascending `page_index`
- **AND** `stale` is false when `scene_hash` matches the head `canvas_hash`
- **AND** `stale` is true after the canvas changes without a re-render

### Requirement: Render triggers

Pages SHALL be rendered on explicit request, on leaving the whiteboard when the scene changed, and MAY be rendered after idle. A render request from another client (future MCP) SHALL be delivered over WebSocket and acknowledged when the manifest is stored.

#### Scenario: Leave triggers render

- **WHEN** the user leaves a whiteboard whose scene changed since the last render
- **THEN** a page render is started
- **AND** the manifest is stored

#### Scenario: On-demand request

- **WHEN** a client sends `render-request` for a note with an open whiteboard session
- **THEN** the browser renders and posts the manifest
- **AND** the server acknowledges `render-complete`

### Requirement: Pages UI

The whiteboard header SHALL provide a Pages drawer showing ordered page thumbnails, page numbers, rendered timestamp, stale state, Render now, Copy markdown, and Download all. The note card SHOULD show the first page or thumbnail and a page-count badge when available.

#### Scenario: View pages

- **WHEN** a render exists
- **THEN** the drawer shows page 1..N in order
- **AND** Copy markdown produces ordered `![page N](/api/images/...)` refs

#### Scenario: Stale pages

- **WHEN** the canvas changed after the last render
- **THEN** the drawer shows a stale badge and offers Render now

### Requirement: Legacy and empty states

Boards with only a legacy thumbnail SHALL expose it as page 1 with `source='legacy-thumbnail'` and stale/unrendered metadata. Empty boards SHALL return an empty render rather than failing.

#### Scenario: Legacy board

- **WHEN** a board has a legacy thumbnail and no page render
- **THEN** the latest manifest contains one legacy tile
- **AND** re-rendering replaces it with reading-order pages

#### Scenario: Empty board

- **WHEN** a board has no non-deleted elements
- **THEN** the render is stored as `status='empty'` with zero tiles
