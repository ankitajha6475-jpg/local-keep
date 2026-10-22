## Context

The dashboard must keep complete note-level behaviour while scaling to large libraries. The existing client loads `/api/notes?includeArchived=1`, renders a card per note, and resolves wiki links from that array. Infinite data paging would break link resolution, client-side tag filtering, search-result filtering, tab counts, and Select All unless those were moved server-side.

The chosen split is:

- **Index**: one lightweight row per note, loaded once.
- **Details**: card bodies and thumbnails fetched in pages into a bounded cache.
- **Virtual rows**: only the visible rows plus a fixed pixel buffer are mounted.

## Goals / Non-Goals

**Goals:**

- Keep dashboard filtering, sorting, search, tag selection, link resolution, drafts, and Select All complete and client-side.
- Bound mounted card DOM and cached note bodies independently of library size.
- Hydrate as the user scrolls, with no blank cards after the first visible page.
- Preserve existing card actions and visual design.

**Non-Goals:**

- Server-side dashboard search/filter/sort.
- Virtualizing the editor, history, graph, or selection-links panels.
- Rendering whiteboard scenes in cards (thumbnails only).
- Replacing the existing REST note CRUD endpoints.

## Decisions

### Decision 1: Index is the complete, lightweight list

`GET /api/notes/index?includeArchived=1` returns every note with only summary fields. It is the source of truth for:

- active/archived tab membership and counts;
- sorting by updated/created/title;
- search-result id filtering;
- tag and untagged filters;
- wiki-link title/id resolution;
- Link dialog recents and search-result lookup;
- Select All and selection-link requests;
- draft-card note metadata.

The index excludes `content`, `canvasData`, and other heavy fields. `displayTitle` is stored on the head, so titleless notes still have a stable label.

### Decision 2: Card details are a separate, bounded cache

`POST /api/notes/window` accepts up to 200 ids and returns card DTOs in the requested order. It includes up to 12,000 characters of text content (with a `contentTruncated` flag) and canvas thumbnails, but omits `canvasData`. The client keeps a reactive `Map<noteId, detail>`.

- Detail pages are 30 notes.
- Steady-state retention is the visible range plus one page on each side.
- The hard cache cap is 120 notes.
- Entries outside the padded visible range are evicted; the cap is a second guard.
- The editing note (text or canvas) is retained.
- A revision change from the WebSocket index invalidates the cached detail.

### Decision 3: Virtualize rows, not individual cards

`RecycleScroller` cannot express a responsive CSS grid directly. The client chunks the ordered dashboard items into rows using the measured column count:

```
columns = max(1, floor((containerWidth + gap) / (minCardWidth + gap)))
rows = chunk(dashboardItems, columns)
```

Every row has a fixed height of `380px card + 16px gap = 396px`. The scroller uses page mode so the existing page scroll and sticky dashboard chrome remain unchanged. The row buffer is fixed in pixels (default 800).

### Decision 4: Infinite scroll means scroll-driven hydration

The index gives the list its full length immediately, so the scrollbar is stable and deep links/searches do not require page-by-page discovery. As the user scrolls, `RecycleScroller` emits the visible row range; the client converts that to a note range and hydrates missing details. This is infinite scroll over card bodies rather than over list length.

Skeleton cards render title/tags/date from the index and reserve the preview area. Once the detail page arrives, the card renders markdown or the canvas thumbnail.

### Decision 5: WebSocket sends index summaries

The bulk `notes` message becomes an index. The client updates summaries, invalidates details whose revision/date/title changed, and rehydrates the visible range if needed. Targeted events (`note-color`, `note-deleted`, etc.) keep their behaviour.

While the editor is open, the existing pending-index buffering is retained.

### Decision 6: Open paths fetch the full note first

Opening a note from a card, graph, backlink, selection-links panel, or wiki link checks the index for existence/archived state, then fetches `GET /api/notes/:id` if a complete body (including `canvasData` for whiteboards) is not cached. This keeps whiteboard opening correct after card hydration.

## Risks / Trade-offs

- **[Risk] First paint has skeletons** — mitigated by hydrating the first page immediately and showing summary metadata.
- **[Risk] Index payload grows with note count** — it is much smaller than full bodies/canvas data; tags and counts are included.
- **[Risk] Jumping far in the scrollbar triggers a fetch** — expected; skeleton cards cover the gap.
- **[Risk] Detail cache churn on fast scrolling** — bounded cache and in-flight deduplication prevent unbounded requests.
- **[Risk] WebSocket consumers expect full notes** — the app's tests and client use the index shape; CRUD endpoints still return full notes.

## Migration Plan

No database or API-breaking migration. The existing `/api/notes` endpoint remains available for compatibility.

## Open Questions

None.
