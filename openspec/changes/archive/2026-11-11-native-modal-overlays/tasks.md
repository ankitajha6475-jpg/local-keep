## 1. Shared overlay module

- [x] 1.1 Add `src/shared/dialog.js` with `createOverlayStack()`
- [x] 1.2 Add `showModalDialog()` / `hideDialog()` helpers
- [x] 1.3 Add `createDialogController()` wiring a reactive flag to a `<dialog>`
- [x] 1.4 Add `installLightDismiss()` for the `closedby` fallback
- [x] 1.5 Add unit tests for the stack and the controller

## 2. Blocking overlays in App.vue

- [x] 2.1 Convert the MCP settings, account settings, interface settings, people, and hybrid search overlays
- [x] 2.2 Convert the note editor overlay
- [x] 2.3 Convert the unsaved-changes and archive-confirm overlays
- [x] 2.4 Convert the revision-history overlay
- [x] 2.5 Give every dialog an `aria-labelledby` and an `autofocus`
- [x] 2.6 Delete the manual `.focus()` calls

## 3. Blocking overlays in components

- [x] 3.1 Convert the link dialog
- [x] 3.2 Convert the relationship graph
- [x] 3.3 Convert the backlinks panel
- [x] 3.4 Convert the selection-links panel

## 4. Styling

- [x] 4.1 Turn the overlay rules into dialog rules and add `::backdrop`
- [x] 4.2 Add the mandatory `overscroll-behavior` containment
- [x] 4.3 Do not set `display` on `dialog` unconditionally

## 5. Shortcut dispatcher

- [x] 5.1 Resolve the topmost overlay from the overlay stack
- [x] 5.2 Remove the global `Escape` branches
- [x] 5.3 Remove the global `Enter` branches for the confirm dialogs

## 6. Menus

- [x] 6.1 Drop `role="menu"` and `role="menuitem"` from the account menu
- [x] 6.2 Turn the editor colour picker into a labelled group of toggle buttons
- [x] 6.3 Turn the card colour picker into a labelled group of toggle buttons
- [x] 6.4 Record why the menus keep their anchored positioning instead of using `popover`

## 7. Dashboard tabs

- [x] 7.1 Add the roving `tabindex` and arrow-key navigation
- [x] 7.2 Add `aria-controls` and a labelled `role="tabpanel"`

## 8. Verification and docs

- [x] 8.1 Add source-level tests for the overlay and ARIA invariants
- [x] 8.2 Run the full test suite
- [x] 8.3 Run the frontend build
- [x] 8.4 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 8.5 Run `openspec validate --strict`
