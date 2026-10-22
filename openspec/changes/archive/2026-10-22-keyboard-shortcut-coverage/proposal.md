## Why

Shortcut hints were only available through Alt/Option and only a few dashboard
actions declared a key. Users could not discover the keys for tabs, filters,
selection, editor mode buttons, or dialog actions, and Ctrl/Cmd did not reveal
hints at all.

## What Changes

- Reveal shortcut tooltips while holding **Ctrl/Cmd** as well as **Alt/Option**.
- Add a central shortcut map (`src/shared/shortcuts.js`) and a declarative
  `data-shortcut` dispatcher for workspace buttons.
- Cover the dashboard chrome, search, tabs, tag filters, selection bar, sort,
  MCP/account/interface/user/hybrid-search dialogs, note editor, revision/history
  controls, confirmations, create menu, graph, selection links, and tag sidebar
  primary actions.
- Scope dispatch to the topmost visible overlay so background dashboard buttons
  cannot fire while a dialog is open. Prefer the focused form's submit button for
  `Ctrl/Cmd+Enter`.
- Let `Esc` close the topmost overlay, including history, backlinks, graph, links,
  and admin dialogs.
- Keep plain-key shortcuts inert while typing in inputs, textareas, selects, or
  contenteditable regions; modifier shortcuts remain available.
- Replace tag-sidebar leaf indentation with a tag icon; parent rows keep the
  expand/collapse arrow.
- Update Quick Shortcuts and the changelog.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: workspace shortcut hints, coverage, dispatch scoping,
  typing behavior, and overlay close/submit behavior.

### Modified Capabilities

None.

## Impact

- **Client**: `src/App.vue`, `src/shared/shortcuts.js`, `TagSidebar.vue`,
  `GraphView.vue`, `SelectionLinksPanel.vue`, `BacklinksPanel.vue`, `LinkDialog.vue`.
- **Tests**: shortcut label/event normalization tests.
- **No server, schema, or migration changes.**
