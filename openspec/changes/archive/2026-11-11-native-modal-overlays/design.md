# Design: native modal overlays

## Which rule applies to which overlay

The guide picks the overlay type by asking what the overlay does to the
page. Every one of the thirteen is **visually blocking** — a full-screen dim
layer with a centred panel:

| Overlay | Backdrop | Verdict |
|---|---|---|
| MCP settings, account settings, interface settings, people, hybrid search | `rgba(0,0,0,0.4)` over the viewport | Rule 1 |
| Note editor | same | Rule 1 |
| Unsaved changes, archive confirm | same | Rule 1 |
| Link dialog | `rgba(32,33,36,0.45)` over the viewport | Rule 1 |
| Revision history | `rgba(32,33,36,0.35)` over the editor | Rule 1 |
| Graph, backlinks, selection links | `rgba(32,33,36,0.45)` over the viewport | Rule 1 |

So **all thirteen become `<dialog>` opened with `showModal()`**. The
revision-history and backlinks overlays are `position: absolute` over the
editor rather than over the viewport, but they dim the editor completely and
take the interaction, so they block the page just as much; the top layer
simply puts them above the editor instead of inside it, which is what the
hand-maintained `z-index` was trying to achieve.

The guide's Rule 2 (`<dialog popover>`) is for panels the user keeps working
in — find bars, inspectors, palettes. None of these qualifies.

## The overlay stack

Moving overlays into the top layer breaks one thing: `shortcutRoot()` used to
find the topmost overlay by taking the **last** matching element in DOM
order. In the top layer, DOM order no longer describes stacking.

So the app keeps an explicit stack:

```js
const overlayStack = createOverlayStack()
```

`src/shared/dialog.js` owns it. Each overlay pushes its element when it
opens and pops it when it closes, and `shortcutRoot()` asks the stack:

```js
function shortcutRoot() {
  const top = overlayStack.top()
  return top || document
}
```

The stack is a plain array with `open` / `close` / `top` / `contains`. It is
pure, so it is unit-tested directly.

### Why not keep the DOM-order fallback?

A DOM-order fallback would be wrong in exactly the case the stack exists
for: the link dialog opens on top of the note editor, and in DOM order the
editor's `<dialog>` comes first — so DOM order happens to work there. But
the account menu's popover and the colour picker popover are *not* in the
stack (they do not block), and the confirmation dialogs can be raised from
inside the editor. A single explicit stack is one source of truth; two
mechanisms that usually agree are two mechanisms that eventually disagree.

## The dialog controller

Each overlay needs the same four things: a reactive `open` flag, a template
ref, a `show()`, and a `hide()`. `src/shared/dialog.js` wraps that:

```js
const mcpSettingsDialog = createDialogController({
  open: mcpSettingsOpen,
  element: mcpSettingsRef,
  stack: overlayStack
})
```

`show()` sets the flag, waits for the next render (the `<dialog>` is created
by `v-if`), and calls `showModal()`. `hide()` clears the flag and calls
`close()`. The `close` event is the single source of truth for "this overlay
is gone" — it fires for `Esc`, for the back gesture, and for `close()`.

### Why the element is created and destroyed

Keeping the `<dialog>` in the DOM at all times would avoid the `nextTick`
wait, but it would also keep every modal's content — and their watchers,
computed properties, and the editor's Yjs session — alive. The `v-if`
approach keeps the lifecycle identical to today's.

### The `close` event and the flag

`onClosed()` sets the flag to false and pops the stack. The flag is also
cleared by `hide()`. Both are idempotent.

The `close` event fires as a queued task, so `onClosed()` can run *after*
Vue has removed the element. `onClosed()` therefore pops the stack using the
template ref, which may already be `null` — `stack.close(null)` is a no-op,
and `hide()` has already popped it synchronously.

## Light dismiss

`closedby` is not supported in Safari, and the guide treats it as
progressive enhancement. The app's existing behaviour is "click outside
closes", which today comes from `@mousedown.self` on the overlay.

- `closedby="any"` gives light dismiss where it is supported.
- Where it is not, the guide's documented `pointerdown`/`pointerup`
  outside-test is used.

Both are implemented in `src/shared/dialog.js` as `installLightDismiss()`,
which is applied once to every dialog that opts in.

The unsaved-changes dialog is the exception: it must not be dismissed by
accident. It uses `closedby="none"` **and** a `cancel` handler, because
Safari ignores `closedby` entirely and would otherwise close on `Esc`.

## Focus

The guide is explicit: "DON'T write code to return focus on close. The
browser returns it to the invoker."

So the manual `.focus()` calls are deleted:
`modalTitleInput.value.focus()`, `searchInput.value.focus()`,
`imageEditor.value.focus()`, `markdownTextarea.value.focus()`,
`opInput` focus, and the link dialog's `focusAndSelect()`.

In their place, `autofocus` goes on the first field of each dialog, and on
the **safe** action of the destructive confirmations (Cancel, not Archive).

`autofocus` on a `<dialog>` applies when the dialog is shown, so it
replaces the manual call exactly.

## The `Esc` handler

The global keydown dispatcher has eight `Escape` branches. With native
dialogs, `Esc` is handled by the platform: the topmost modal closes and the
event never reaches the window listener in a way that matters.

The branches are removed, except where the app needs to know: the
unsaved-changes dialog's `cancel` handler.

The `Enter` branches in the dispatcher are a separate problem — a global
`Enter` that confirms a destructive action regardless of which overlay is
topmost. That is folded into this change: the confirm dialogs' actions are
bound to their own buttons, and the global `Enter` branch is removed.

## Menus keep their anchoring, and stop claiming menu semantics

The account menu and the two colour pickers are **not** dialogs, so they are
not migrated. The defect the audit found was not the positioning - it was
that they declared `role="menu"` and `role="menuitemradio"` without the
keyboard behaviour those roles imply.

The guide is unambiguous: "When applying `role="menu"` to an element, it must
then behave like a menu." Arrow-key navigation, a roving `tabindex`,
`Home`/`End`, `Escape` to close, focus moving into the menu - none of that is
implemented, and implementing it for three small menus is not worth the
complexity.

So the roles go:

- **Account menu**: a plain list of buttons. The trigger keeps
  `aria-expanded` and gets `aria-haspopup="true"`.
- **Colour pickers**: a `role="group"` of toggle buttons with `aria-pressed`.
  A toggle button needs no keyboard pattern beyond Space and Enter, and
  `aria-pressed` states the selection that `aria-checked` was trying to
  state.

The `role="group"` container keeps the "choose one of these" meaning without
the radio-group arrow-key requirement.

### Why not `popover`

Rule 3 prefers `popover` for menus, and it would fix a real class of bug: a
popover is in the top layer, so it can never paint under a modal.

But an unanchored popover is **centred on the viewport**. The user-agent
style is `position: fixed; inset: 0; margin: auto`, and the only way to
anchor it to its trigger is CSS anchor positioning (`anchor-name` /
`position-anchor`), which is not a Baseline feature. Without it the account
menu would fly to the middle of the screen.

The alternatives were all worse:

- Positioning the popover from JavaScript with `getBoundingClientRect()`
  needs a scroll and resize listener to stay put, which is more machinery
  than the problem deserves.
- Loading `@oddbird/popover-polyfill` does not help - it provides the
  behaviour, not the anchoring.

So the menus keep their current anchored positioning, and the ARIA is fixed.
The z-index problem the audit found is not reachable in practice either: the
page is inert while a modal is open, so the header cannot be clicked to open
a menu underneath one.

## Tabs become a real tablist

The dashboard's Notes / Archived / Drafts switcher declares `role="tab"` on
three buttons with no `role="tabpanel"`, no `aria-controls`, and no arrow
keys. The guide's rule: "When applying `role="tab"` to an element, it must
then behave like a tab."

The implementation is the standard ARIA tabs pattern:

- the active tab has `tabindex="0"`, the others `tabindex="-1"` (roving),
- `Left`/`Right` move between tabs and select them, `Home`/`End` jump to the
  ends,
- each tab has `aria-controls` pointing at the panel, and the panel has
  `role="tabpanel"` and `aria-labelledby` pointing back at its tab.

The panel is the notes grid below the control bar.

The `1`/`2`/`3` shortcuts still work: the shortcut dispatcher clicks the
button with the matching `data-shortcut`, which is the tab.

## Known limits

- The browser's own focus trap, inertness, and `Esc` handling cannot be
  tested in this environment — jsdom implements neither `showModal()` nor
  the top layer. The tests cover the app's own wiring (the controller, the
  stack, the light-dismiss probe) against a fake dialog element; the
  platform behaviour is the platform's contract.
- The Excalidraw bundle's own overlays are untouched.
