## Context

`note_links` already materialises the current head's outgoing relationships. `links.outgoing()` and `links.backlinks()` expose them per note, and the editor uses `BacklinksPanel`. The selection bar in `App.vue` currently supports select-all, deselect-all, and archive.

## Goals / Non-Goals

**Goals:**
- One request returns a deduplicated view of outgoing targets and incoming sources for N selected notes.
- Preserve context snippets so each row says why the relationship exists.
- Distinguish unresolved/ambiguous outgoing labels and archived notes without making them clickable.
- Keep the UI usable when a note is both selected and appears as a related note.

**Non-Goals:**
- Graph rendering changes or multi-centre graph layout.
- New relationship types, link editing, or bulk link rewrites.
- MCP tool changes (the existing per-note tools remain the API for agents).

## Decisions

### Decision 1: Dedicated batch endpoint rather than N single-note calls

`POST /api/notes/links/summary` accepts up to 2000 ids and queries `note_links` in chunks. This avoids 2N REST calls when many notes are selected (including Select All) and keeps grouping consistent.

### Decision 2: Group by counterpart note

Outgoing rows are keyed by resolved `target_note_id`, or by status + normalised label when unresolved/ambiguous. Incoming rows are keyed by `source_note_id`. Each row carries a `links` array with the selected-note side and a context snippet.

Rationale: the user asked for "all they link to" / "all linked to them", which reads as a list of related notes, not a raw edge dump.

### Decision 3: Both directions in one panel with a mode switch

The panel defaults to **Both** (two columns) and allows narrowing to **Links to** or **Linked from**. This satisfies "or/and" without forcing two separate buttons.

### Decision 4: Archived entries are included on request

The client sends `includeArchived: true` because the selection can contain archived notes. Rows display an archived chip; clicking an archived note shows the existing archived notice instead of opening it.

### Decision 5: Reuse the existing open-note flow

`openSelectionLinkNote()` mirrors `openGraphNode()` / `openBacklinkSource()`: validate the note still exists, refuse archived notes with a notice, confirm before discarding unsaved editor changes, then open the text or canvas note on the next tick.

## Risks / Trade-offs

- **[Risk] Large selections produce large payloads** — capped at 2000 ids; grouping reduces output to unique counterparts and contexts.
- **[Risk] Stale selection** — the panel is fetched when opened; closing or deselecting clears it. Live relationship changes while the panel is open are not pushed (same as BacklinksPanel).
- **[Risk] Context repetition** — a source linking to several selected notes shows one row with multiple contexts; the UI shows the first context and a "via" count.

## Migration Plan

None. Pure additive API + UI.

## Open Questions

none.
