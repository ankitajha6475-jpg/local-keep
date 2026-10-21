## Context

See `proposal.md`, `specs/note-relationships/spec.md`, and `specs/note-tags/spec.md`.

The note-thread change introduced stable note ids and head + revision storage. The markdown change introduced a renderer with an optional `resolveLink` hook and a shared `transformOutsideCode` implementation. This change adds the relational/tag data beside the head and wires the UI. Note content remains markdown; no content rewrite is required.

## Goals / Non-Goals

**Goals:**

- Parse code-aware wiki links and hierarchical tags from head content/canvas text.
- Resolve links by explicit id or unique title/display title; expose backlinks and graph data.
- Provide a tag tree with counts and descendant-aware filtering.
- Rebuild tags/links only when the head moves; branches do not affect head structure.
- Add a usable tag sidebar, tag chips, backlinks panel, and graph view.

**Non-Goals:**

- Automatic disambiguation UI for ambiguous links (the API/UI marks them; explicit ids are the escape hatch).
- Backlink parsing for historical revisions (current head only).
- Tag renaming/moving, aliases, or frontmatter tags.
- Graph editing or graph database dependency.

## Decisions

### D1: Code-aware parsing via a shared pure helper

Move `transformOutsideCode` from `src/utils/markdown.js` into `src/shared/markdownCode.js`. Both the client renderer and server tag/link parsers import it. It preserves fenced blocks and inline code verbatim, which is essential for technical notes containing `#`/`[[` in code.

### D2: Stable link rows keyed by source revision

`note_links` stores one row per occurrence with `source_revision_id`, `target_note_id`, `target_label`, `kind` (`title`/`id`), `raw`, `status`, and `source='inline'`. On each head-moving commit, delete and rebuild the source note's rows. Branches do not touch the head rows. This avoids trying to diff links.

### D3: Title resolution is a global re-resolve

Build a title/display-title map from non-archived head notes. For `kind='title'` rows, set target/status (`ok`, `unresolved`, `ambiguous`, `archived`). Re-run after any title/display-title change, archive, restore, or create. At personal scale (hundreds of notes) this is cheap; a future change can optimise with a title index.

### D4: Explicit ids are the stable escape hatch

`[[note:<id>|label]]` resolves by id; `[[Title]]` is a convenience. Duplicate titles produce `ambiguous`, not an arbitrary choice. The UI marks broken/ambiguous links and shows a notice.

### D5: Tags are a head-level materialised view

`note_tags(note_id, tag, source, created_at)` stores normalised full paths for the head. On each head-moving commit, delete `source='inline'` rows for the note and reparse. Explicit tags (future API/MCP) use `source='explicit'` and survive inline reparsing. The tag tree is built in the service from rows; no separate tree table.

### D6: Descendant filtering in the service

Because tags may contain `_` (a SQL LIKE wildcard), descendant filtering is done in JS over `note_tags` rows (or with a properly escaped LIKE). At personal scale, load rows and test `tag === prefix || tag.startsWith(prefix + '/')`. `exactTag=1` uses equality. This keeps SQLite portable and avoids escaping mistakes.

### D7: Graph is a service-level BFS over the adjacency table

`GET /api/graph` returns nodes/edges. If `noteId`/`depth` is supplied, BFS outgoing + incoming edges up to depth (1–3, default 1). Otherwise return the resolved graph up to a limit. Archived notes/edges are excluded by default. The UI uses `d3-force` in an SVG, seeded for stable layout, with click-to-open and zoom/pan.

### D8: Internal link navigation reuses the renderer hook

The markdown renderer already emits `.note-link[data-note-id]`/`.note-link--broken`. App-level click handlers open resolved targets (with an unsaved-changes confirmation), show a notice for broken/archived targets, and stop card-click propagation. No new navigation framework is needed.

### D9: Migration 002 backfills after 001

Create `note_tags`/`note_links` with indexes. For every note, parse head content + canvas text and insert rows, then resolve title links globally. Migration 001 already created heads/display titles. The generic migration runner backs up the DB before version 2. Re-running is idempotent (tables exist; backfill only when empty or via `INSERT OR IGNORE`/rebuild).

### D10: Dependencies

Add `d3-force` for the graph layout. No graph database.

## Risks / Trade-offs

- **False tags from technical notes** → code-aware parser + pure-hex rejection + tag starts with a letter.
- **Ambiguous titles** → explicit `note:` links and UI status; no arbitrary resolution.
- **Global re-resolve cost** → hundreds of notes; cheap. Optimise later with a title index/triggers.
- **Graph rendering cost** → cap nodes (default 300, max 1000), use a seeded force layout, allow neighbourhood mode.
- **Tag churn on every save** → delete/insert a handful of rows; wrap in the same transaction as the revision.
- **Backlinks context** → compute from source head content at read time; if the raw occurrence is gone, return an empty snippet.
- **Migration 002 on real data** → backup + transaction + test on a copy; existing corpus mostly has `#`/`[[` in code, so expected tag/link counts are low.

## Migration Plan

1. Add migration `002-relationships-and-tags` to the migration list.
2. Create `note_tags`, `note_links`, indexes.
3. Backfill all heads: parse content + canvas text; insert tags/links; resolve titles.
4. Record schema version 2.
5. Verify tag tree counts and a known link/backlink.
6. Rollback: restore the pre-version-2 backup; no content was rewritten.

## Open Questions

None blocking. Graph visual styling and tag-rename UX can evolve without changing storage/spec.
