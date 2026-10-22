# Proposal: Sidebar scroll and reveal modifiers

## Why

Two polish issues reported during review of the editor chrome change:

1. The tag sidebar can show a horizontal scrollbar. Long tag names and the
   count pill overflow the fixed 230px column, and `overflow-y: auto` alone lets
   the browser add a horizontal scrollbar that shifts rows.
2. Chrome reserves plain **Alt** for its own UI (menu bar focus, etc.), so
   holding Alt can trigger browser behavior on the way to revealing shortcuts.
   Users asked that **Ctrl** no longer trigger the reveal, and that the app
   intercept Alt so the browser does not act on it.

## What Changes

- Tag sidebar: rows keep `white-space: nowrap` + ellipsis and the container gets
  `overflow-x: hidden` so a horizontal scrollbar can never appear.
- Shortcut reveal: only **Alt/Option** (with Ctrl/Cmd/Shift *excluded*) toggles
  hints. Alt keydown/keyup is `preventDefault`-ed at window level so Chrome does
  not focus its menu bar or show its own UI. Pointer reveal requires Alt only.
- Shortcuts that combine Ctrl/Cmd+Alt (e.g. `Ctrl+Alt+V`) keep working: only
  *bare* Alt presses are intercepted; combos carry real keys and are unaffected.
- Quick Shortcuts card text and the keyboard-shortcuts spec updated: reveal is
  Alt-only.

## Capabilities

### Modified: `dashboard-chrome`, `keyboard-shortcuts`

- `dashboard-chrome`: header actions reveal behavior reference updated (the
  shared reveal is Alt-only and app-intercepted); no other dashboard behavior
  changes.
- `keyboard-shortcuts`: the "Shortcut hints on Alt and Ctrl/Cmd" requirement
  becomes Alt-only reveal with browser interception; a new tag-sidebar
  no-horizontal-scroll scenario is added under `note-tags`.

## Impact

- `src/App.vue`: `onShortcutRevealDown/Up/Pointer` and window listeners.
- `src/components/TagSidebar.vue`: sidebar overflow CSS.
- Quick Shortcuts card copy.
