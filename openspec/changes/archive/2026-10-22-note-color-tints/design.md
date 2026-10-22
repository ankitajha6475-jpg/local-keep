## Context

`notes` stores the materialized head of each note, while `note_revisions` is append-only content history. Dashboard cards currently derive their background, border, and accent from `note.type` in `App.vue`. Quick Shortcuts is a hard-coded `.note-card` before the `v-for` loop with its own `.shortcut-tips-content` scroll container and amber styling.

## Goals / Non-Goals

**Goals:**
- Persist a per-note tint that is visible to every client and survives edits, archive, restore, and reload.
- Keep the picker in the card header right of the selection checkbox and make it fast to use.
- Keep one card render path, one `.note-preview` scrollbar, and one set of card spacing rules.
- Make Quick Shortcuts read-only without hiding it behind another bespoke template.

**Non-Goals:**
- Revision history for colors.
- Bulk color changes for a selection.
- User-defined colors or arbitrary hex values.
- Color-aware search, tags, MCP tools, or whiteboard themes.

## Decisions

### Decision 1: Color is head-level presentation metadata

`notes.color` stores one of the palette ids (`blue`, `green`, `amber`, `rose`, `violet`, `slate`) or `NULL` for the type default. It is not copied into `note_revisions`: restoring an old version restores content, not the card tint. Changing color does not create a revision and does not update `updatedAt`, so color edits never reorder the "Last Modified" list. Archive/restore and normal head updates preserve the column.

### Decision 2: Shared palette + validation

`src/shared/noteColors.js` defines ids and labels and normalizes `default`, empty, and `null` to `NULL`. The service returns `400 invalid_note_color` for unknown values. The client only sends palette ids, so the server remains authoritative for external callers.

### Decision 3: Dedicated endpoint and WebSocket event

`PUT /api/notes/:id/color` returns the updated note DTO and broadcasts `{ type: 'note-color', noteId, color }`. This avoids a full note-list broadcast and keeps open dashboards in sync. Clients optimistically tint the card, then reconcile with the response; failures revert and show the normal toast.

### Decision 4: Shared CSS tint variables

`.note-card` defines `--card-surface-start`, `--card-surface-end`, `--card-border-color`, `--card-accent-start`, and `--card-accent-end`. `.canvas-note` sets the violet defaults; `.note-color-*` classes override the variables. Hover uses the accent color and archived rules still take precedence. The palette button uses the accent color for its icon and the menu swatches show the selectable tints.

### Decision 5: Quick Shortcuts is a virtual note

A module-level `quickShortcutsNote` object has `isQuickShortcuts: true` and markdown content. `dashboardNotes` prepends it to the filtered/sorted real notes only for rendering; it is not in `notes`, `sortedNotes`, `selectAll`, search, tags, or editing sessions. The card template hides the checkbox, color picker, copy, and delete/restore when that flag is set, and `handleCardClick` returns early. Its body is rendered through `MarkdownView` with `.note-preview`, so it inherits the standard thin scrollbar and typography. Inline code in that note is styled to look like shortcut keys.

## Risks / Trade-offs

- **[Risk] Color drift** — clients that ignore `note-color` see the old tint until the next note list refresh. The event is additive and the API remains the source of truth.
- **[Risk] Archived tint precedence** — archived card styles must remain after color classes so gray archived cards do not become brightly tinted.
- **[Risk] Virtual note identity** — `__quick_shortcuts__` must never enter the real note array or API calls; guards in the card click and controls enforce this.
- **[Risk] Popover clipping** — the card has `overflow: hidden`; the palette menu stays inside the card width and opens below the 24px toolbar.

## Migration Plan

Migration 13 runs `ALTER TABLE notes ADD COLUMN color TEXT`. Existing notes get `NULL` (type default). A pre-migration backup is taken by the existing migration runner when notes exist.

## Open Questions

None.
