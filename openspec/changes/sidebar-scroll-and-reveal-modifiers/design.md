# Design: Sidebar scroll and reveal modifiers

## Context

Follow-up polish to the editor chrome change:

1. `TagSidebar.vue` sets `overflow-y: auto` with a fixed 230px width. A long tag
   name (nowrap + ellipsis on `.tag-name`) plus the count pill usually fits, but
   the browser can still produce a horizontal scrollbar when content is wider
   than the padding box (e.g. very long unbroken names before ellipsis applies,
   or zoom levels rounding widths up).
2. `App.vue` reveals shortcut hints when Alt **or** Ctrl/Cmd is held
   (`onShortcutRevealDown/Up/Pointer`). In Chrome, a bare Alt press focuses the
   browser menu bar unless the page prevents it.

## Goals / Non-Goals

- Goals:
  - Tag sidebar can never scroll horizontally.
  - Reveal is Alt-only; bare Alt is prevented so Chrome keeps focus in the page.
  - Ctrl/Cmd+Alt combos (Ctrl+Alt+V etc.) keep dispatching.
- Non-Goals:
  - No change to shortcut dispatch logic, shortcut map, or sidebar layout.

## Decisions

### Decision 1: Hide horizontal overflow on the sidebar

`.tag-sidebar { overflow-x: hidden; overflow-y: auto; }`. `.tag-name` already
has `flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`,
so names truncate rather than push width. `overflow-x: hidden` is the hard
guarantee the browser never shows a horizontal bar.

### Decision 2: Alt-only reveal with bare-Alt interception

`onShortcutRevealDown` reveals only when `e.key === 'Alt'` (a bare Alt press,
no other modifier held via `e.altKey && !e.ctrlKey && !e.metaKey`). Bare Alt
keydown/keyup call `e.preventDefault()` so Chrome does not focus its menu bar.
`onShortcutRevealUp` hides the hints when Alt is released and no other modifier
remains. `onShortcutRevealPointer` requires `e.altKey` only. Combo shortcuts
like Ctrl+Alt+V are untouched: their keydown has a real key (`v`) and Alt-only
checks never preventDefault them.

### Decision 3: Update user-facing copy and specs

The Quick Shortcuts card copy drops "or Ctrl/Cmd" and the keyboard-shortcuts /
dashboard-chrome deltas replace the dual-modifier requirement with Alt-only
reveal plus interception.

## Risks / Trade-offs

- Alt-reveal no longer works by holding Ctrl — intentional per user request.
- macOS Option keydown also fires `key === 'Alt'`; preventDefault on Option is
  harmless and stops the character-picker in some setups.

## Migration Plan

Frontend-only change; no data or protocol impact.
