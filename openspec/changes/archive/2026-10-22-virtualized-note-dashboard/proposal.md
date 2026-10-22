## Why

The dashboard currently loads every full note (including canvas payloads) and renders every card. Cost grows with the whole library: DOM size, JSON payload, and browser memory. The list needs to stay responsive for large note collections without losing client-side search, tag filtering, link resolution, selection, or drafts.

## What Changes

- Add a lightweight note index endpoint: id, title, display title, type, revision, archived flag, dates, color, tags, and link counts. It excludes note bodies and canvas data.
- Add a batched note-card endpoint that returns card bodies (and thumbnails) for requested note ids, omitting canvas scene data.
- Load the index once and use it as the source of truth for ordering, search results, tag filters, tab counts, selection, drafts, and wiki-link resolution.
- Render the dashboard with `vue-virtual-scroller` as responsive rows of cards:
  - fixed row height (`card height + gap`);
  - responsive column count from the container width;
  - a fixed render buffer in pixels.
- Hydrate card bodies on demand in pages of 30 as rows enter the viewport.
- Keep a bounded sliding detail cache (visible range plus one batch on each side, hard cap 120 notes), prefetching near the visible range and evicting far pages. The editing note is never evicted.
- Treat scroll-driven hydration as infinite scroll: the index defines the full scroll length, while card bodies arrive as the user moves through it. Cards show a skeleton until hydrated.
- Change the WebSocket `notes` broadcast to send index summaries. Changed revisions invalidate cached card details.
- Preserve Quick Shortcuts, Drafts, archived notes, note colors, selection, and the existing card interactions.

## Capabilities

### New Capabilities

- `note-dashboard`: virtualized, index-backed dashboard list with bounded on-demand note details.

### Modified Capabilities

None.

## Impact

- **Dependencies**: adds `vue-virtual-scroller` (Vue 3 line).
- **Server**: `GET /api/notes/index`, `POST /api/notes/window`; `notes.listNoteIndex` and `notes.listNoteCardsByIds`; WebSocket notes payload becomes an index.
- **Client**: dashboard state splits into `noteIndex`, `noteDetails` cache, and virtual rows; card markup moves into `DashboardNoteCard.vue`.
- **Behaviour**: full note bodies and canvas scenes are fetched only when a card is hydrated or opened.
- **No database migration.**
