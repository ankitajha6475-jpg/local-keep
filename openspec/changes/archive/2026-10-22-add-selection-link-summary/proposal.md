## Why

The gallery supports selecting multiple notes, but relationships are only discoverable one note at a time (the editor's backlinks panel and the single-note graph). When reviewing or cleaning up a group of notes there is no way to see, in one place, everything the selected notes link to or everything linking to them.

## What Changes

- Add a bulk relationship summary for a set of note ids: outgoing links grouped by target note and backlinks grouped by source note.
- Add `POST /api/notes/links/summary` accepting `{ ids, includeArchived }`.
- Add a **🔗 Links** action to the multi-note selection bar.
- Add a `SelectionLinksPanel` overlay with a **Both / Links to / Linked from** mode switch, clickable rows to open the related note, and status chips for unresolved, ambiguous, archived, and in-selection entries.
- Keep the existing single-note backlinks panel and graph unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `note-relationships`: adds a bulk relationship summary for the current selection and the UI surface that consumes it.

## Impact

- **Affected code**:
  - `src/server/services/links.js` — new `summary(noteIds, options)` aggregation.
  - `server.js` — new `POST /api/notes/links/summary` route.
  - `src/App.vue` — selection-bar action and panel wiring.
  - `src/components/SelectionLinksPanel.vue` — new overlay component.
  - `tests/relationships.test.js`, `tests/relationshipsApi.test.js` — service/API coverage.
  - `CHANGELOG.md` — Unreleased entry.
- **No schema migration.**
- **No change to link indexing or resolution.**
