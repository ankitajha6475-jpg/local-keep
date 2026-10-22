## Context

The dashboard already had a `shortcutsVisible` reveal state for Alt/Option and a
few `data-shortcut` hints, but no shared action map or dispatcher. Adding keys by
copying keydown branches for every button would drift quickly and duplicate modal
context logic.

## Goals / Non-Goals

**Goals:**

- Make every unique workspace action button discoverable through a shortcut hint.
- Reveal hints on Ctrl/Cmd and Alt/Option.
- Execute the same button action from the keyboard, with correct modal/overlay
  scope and focused-form preference.
- Avoid firing background actions while a dialog is open.
- Avoid stealing plain keys from text entry.

**Non-Goals:**

- Global shortcuts for repeated per-row controls (revision actions, individual
  user/token rows, note color swatches, card actions, tag rows).
- Rebinding browser/OS reserved shortcuts.
- Changing the Markdown toolbar's existing Ctrl/Cmd-only shortcut engine.

## Decisions

### Decision 1: Declarative `data-shortcut` buttons

`src/shared/shortcuts.js` stores canonical combos with a `Mod` placeholder.
`App.vue` exposes `shortcut(id)`, which replaces `Mod` with `Cmd` or `Ctrl` for
display and matching. Components outside the app setup receive `modKey`.

Buttons use `:data-shortcut="shortcut('refresh')"` (or a component-local literal
with `modKey`). No separate keydown branch is needed for each action.

### Decision 2: DOM dispatch with overlay scope

`activateShortcutFromDom()` normalizes the event, chooses the last visible
shortcut layer (`.modal-overlay`, `.history-overlay`, `.graph-overlay`,
`.links-overlay`, `.backlinks-overlay`, `.link-dialog-overlay`, `.deleted-mask`)
or the document, finds a visible enabled button with the matching combo, and
clicks it. This keeps background dashboard buttons inert while a dialog is open.
If the active element is inside a form, a matching submit button in that form is
preferred (important for MCP's two forms).

### Decision 3: Typing and reveal rules

Alt/Option, Ctrl, and Cmd all set `shortcutsVisible`; keyup or blur resets it.
Plain-key shortcuts are skipped while the active element is an input, textarea,
select, or contenteditable. Modifier shortcuts still run, so editor actions such
as `Ctrl+Alt+D` work from the editor. IME composition is ignored.

### Decision 4: Escape and primary submit

`Esc` closes the topmost overlay via its `data-shortcut="Esc"` close button before
falling back to the note editor. `Ctrl/Cmd+Enter` submits the focused form or
clicks the first matching primary button in the active layer. Confirmations keep
their existing Enter/Escape behavior.

### Decision 5: Tag sidebar leaf icon

Leaf tag rows replace the blank depth spacer with a `tag` icon; parent rows keep
their expand/collapse arrow. Depth padding is removed so leaf tags align in one
icon column.

## Risks / Trade-offs

- **[Risk] Browser-reserved combos** — use Ctrl/Cmd+Alt for secondary actions and
  plain keys only outside text entry; `preventDefault` is applied on a match.
- **[Risk] Multiple matching buttons** — scope to the topmost layer and prefer the
  focused form; keep combos unique within a visible context.
- **[Risk] Discoverability clutter** — hints appear only while a modifier is held
  (or on hover for icon buttons), not permanently.
- **[Risk] Dynamic row actions** — intentionally remain native controls rather
  than receiving ambiguous global shortcuts.

## Migration Plan

None. Existing toolbar shortcuts and `Ctrl/Cmd+I` / `Ctrl/Cmd+Enter` remain.

## Open Questions

None.
