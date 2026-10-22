## Why

Dashboard cards all share one type-based tint (blue for text notes, violet for whiteboards), so users cannot group or distinguish notes visually. The Quick Shortcuts card is also a bespoke template with its own amber styling and scroll container, which makes its scrollbar and spacing differ from every real note.

## What Changes

- Add per-note color metadata stored in `notes.color` with a fixed tint palette. `null` keeps the existing note-type default.
- Add migration 13 and `PUT /api/notes/:id/color`, including palette validation and a `note-color` WebSocket event.
- Add a color picker to the dashboard card header, immediately right of the selection checkbox: Default, Blue, Green, Amber, Rose, Violet, Slate.
- Render color tints through shared card CSS variables so text notes, whiteboards, hover, and archived states stay consistent.
- Render Quick Shortcuts through the normal card path as a read-only virtual note: no selection checkbox, color picker, copy, or delete/restore; it cannot be selected or opened for editing, and its markdown preview uses the standard note scrollbar.
- Remove the bespoke Quick Shortcuts card/list styles.

## Capabilities

### New Capabilities

- `note-colors`: per-note tint metadata, dashboard color picker, and the read-only virtual Quick Shortcuts card.

### Modified Capabilities

None.

## Impact

- **Affected code**:
  - `src/shared/noteColors.js` — palette ids, labels, normalization.
  - `src/server/migrations/013-note-color.js` — adds `notes.color`.
  - `src/server/services/notes.js` — `setNoteColor`.
  - `server.js` — migration registration, color endpoint, WebSocket broadcast.
  - `src/App.vue` — tint classes, picker, virtual Quick Shortcuts note, WS/state handling, CSS.
  - `src/components/AppIcon.vue` — palette and check icons.
  - migration/API tests, `AGENTS.md`, `CHANGELOG.md`.
- **Color changes do not create revisions or change `updatedAt`.**
- **The Quick Shortcuts virtual note is never written to the database and never joins `notes`/`sortedNotes`.**
