## Why

The gallery header already pins to the top, but the control bar and the multi-note selection bar scroll away with the note list. On long lists this hides the sort controls and the selected-note actions exactly when the user scrolls to reach later notes.

The note editor toolbar also reveals keyboard shortcuts when Alt/Option is held, while the dashboard offers no equivalent hints. The header's emoji controls are visually inconsistent and their meaning depends on the emoji font.

## What Changes

- Keep the dashboard header pinned while the gallery scrolls.
- Pin the sort/filter control bar directly beneath the header, and pin the selection action bar in the same slot when notes are selected.
- Measure the header height at runtime and expose it as `--app-header-height` so the pinned offset follows responsive padding and header reflows.
- Adopt the editor's Alt/Option reveal behavior on dashboard actions: hover/focus shows the action name, and holding Alt/Option swaps it for the keyboard shortcut.
- Refresh the header chrome with an inline SVG icon set, a gradient brand mark, a glassy sticky bar, a dot-based sync pill, a compact account menu, and a matching create button.
- Document the Alt reveal behavior in the Quick Shortcuts card.

## Capabilities

### New Capabilities

- `dashboard-chrome`: pinned header and gallery action bar behavior, plus Alt/Option shortcut hints.

### Modified Capabilities

None.

## Impact

- **Affected code**:
  - `src/App.vue` — header ref, `ResizeObserver` header measurement, sticky styles for `.control-bar` and `.selection-bar`, shortcut tooltip markup/CSS, refreshed header and create menu.
  - `src/components/AppIcon.vue` — new inline SVG icon set used by the dashboard chrome.
  - `CHANGELOG.md`.
- **No API, data, or WebSocket changes.**
- **Pure layout/visual change; no behavior changes to sorting, filtering, selection, or keyboard shortcuts.**
