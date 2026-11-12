## 1. Shared composition helper

- [x] 1.1 Add `src/shared/ime.js` exporting `isImeComposing(event)`
- [x] 1.2 Detect composition with `event.isComposing`
- [x] 1.3 Add the `keyCode === 229` fallback, limited to `Enter` / `Escape` / `Tab`
- [x] 1.4 Add unit tests for the helper

## 2. Properties panel (App.vue)

- [x] 2.1 Guard the tag input's Enter handler
- [x] 2.2 Guard the tag input's comma handler
- [x] 2.3 Guard the tag input's arrow-key handlers
- [x] 2.4 Guard the tag input's Escape handler
- [x] 2.5 Guard the new-property-key input's Enter handler

## 3. Link dialog (LinkDialog.vue)

- [x] 3.1 Guard the link text input's Enter handler
- [x] 3.2 Guard the link URL input's Enter handler
- [x] 3.3 Guard the wiki search input's Enter handler
- [x] 3.4 Guard the wiki suggestion arrow-key handlers
- [x] 3.5 Guard the dialog's Escape handler

## 4. Tag sidebar (TagSidebar.vue)

- [x] 4.1 Guard the tag rename / reparent input's Enter handler

## 5. Whiteboard title (WhiteboardEditor.vue)

- [x] 5.1 Replace the unconditional `@keydown.enter.prevent` with a guarded handler
- [x] 5.2 Keep the `keyup.enter` title flush working

## 6. Global dispatcher (App.vue)

- [x] 6.1 Guard the `Enter` branches of the confirm and unsaved-changes dialogs
- [x] 6.2 Guard every `Escape` branch
- [x] 6.3 Give `activateShortcutFromDom` the shared `229` fallback
- [x] 6.4 Keep `Ctrl/Cmd+Enter` dispatching during composition

## 7. Verification and docs

- [x] 7.1 Run the full test suite
- [x] 7.2 Run the frontend build
- [x] 7.3 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 7.4 Run `openspec validate --strict`
