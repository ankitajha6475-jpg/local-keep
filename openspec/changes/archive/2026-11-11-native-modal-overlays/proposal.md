## Why

The workspace hand-rolls every overlay. A `modern-web-guidance` audit found
thirteen of them, and every one rebuilds - badly - what the platform already
provides:

1. **No focus containment.** Nothing traps Tab. With the note editor open,
   Tab walks into the dashboard behind it.
2. **No background inertness.** Only `LinkDialog.vue` declared
   `role="dialog" aria-modal="true"`; the other twelve exposed nothing, so
   the dashboard behind a modal stayed keyboard-reachable.
3. **No top layer.** Overlays relied on a hand-maintained `z-index` scale
   spanning 1 to 1000.
4. **No scroll lock.** The page scrolled behind an open overlay.
5. **No focus return.** Focus fell back to the document body.
6. **`Esc` was re-implemented** in the global keydown dispatcher.

Three ARIA patterns were also declared without the behaviour that makes them
honest: `role="tab"` on the dashboard tabs, `role="menu"` on the account
menu, and `role="menuitemradio"` on the two colour pickers.

## What Changes

- Every blocking overlay SHALL be a native `<dialog>` opened with
  `showModal()`. The platform provides focus containment, background
  inertness, top-layer rendering, `Esc` dismissal, scroll containment, and
  focus return to the invoker.
- The overlays SHALL NOT carry `role="dialog"`, `aria-modal`, a manual focus
  trap, `inert` toggling, or a manual `Esc` handler.
- Every dialog SHALL be named with `aria-labelledby`, and the primary or
  first field SHALL carry `autofocus`.
- The workspace SHALL keep an explicit overlay stack, so "the topmost
  overlay" is known even though the top layer no longer reflects DOM order.
- The account menu and the two colour pickers SHALL stop declaring
  `role="menu"` and `role="menuitemradio"`, because the full menu keyboard
  pattern is not implemented; the colour swatches become toggle buttons in a
  labelled group. They keep their anchored positioning: an unanchored
  `popover` is centred on the viewport, because CSS anchor positioning is not
  a Baseline feature.
- The dashboard tabs SHALL implement the ARIA tab pattern: a roving
  `tabindex`, arrow-key navigation, and a labelled tabpanel.

## Capabilities

### New Capabilities

- `modal-overlays`: the native dialog contract for every blocking overlay.

### Modified Capabilities

- `keyboard-shortcuts`: the topmost overlay is resolved from an explicit
  stack rather than from DOM order.
- `dashboard-chrome`: the view switcher is a real ARIA tablist.
- `note-colors`: the colour picker is a popover of toggle buttons.
- `note-dashboard`: the card palette is a popover of toggle buttons.

## Impact

- **Affected code**: `src/shared/dialog.js` (new), `src/App.vue`,
  `src/components/LinkDialog.vue`, `src/components/GraphView.vue`,
  `src/components/BacklinksPanel.vue`, `src/components/SelectionLinksPanel.vue`,
  `src/components/DashboardNoteCard.vue`.
- **Behaviour**: no data, schema, or API changes. The visible difference is
  that overlays are centred by the platform instead of by a flex container,
  and that a modal can no longer be tabbed out of.
- **Risk**: high. This is the largest change in the modernisation set. It
  touches the editor open/close lifecycle, the shortcut dispatcher, and the
  unsaved-changes guard.
