## Why

Seven text inputs commit a value on `Enter`, and every one is unsafe under an
input method editor (IME): the properties tag input, the new-property-key
input, the link dialog's text and URL inputs, the wiki-link search input, the
tag rename/reparent input, and the whiteboard title input.

While an IME composes (Chinese, Japanese, Korean), `Enter` confirms the current
candidate — it does not mean "commit this". These handlers run anyway, so the
user gets a half-composed tag path committed, a half-typed URL inserted as a
link, or a whiteboard title committed from an unfinished candidate.

Three further sites have the same defect for other keys: the whiteboard title
binds `@keydown.enter.prevent` with no handler, so a candidate is **impossible**
to confirm with Enter there; the link dialog and the tag suggestion list close
on `Escape`, which is the IME's cancel key; and the arrow keys that move the
suggestion highlight are cancelled during composition.

Only the editor's own `onEditorKeydown` tracks composition today. The global
`keydown` dispatcher has the same bug class: `Enter` on the unsaved-changes
dialog calls `saveAndClose()` while a composition may still be running in the
editor behind it.

This project has a Chinese-language user base, so this is the most visible
input bug in the workspace.

## What Changes

- A single shared module (`src/shared/ime.js`) SHALL expose one composition
  check used by every affected control.
- Composition SHALL be detected with `event.isComposing`, plus the legacy
  `event.keyCode === 229` fallback for the keys an IME uses to confirm or
  cancel a candidate (`Enter`, `Escape`, `Tab`). The legacy check SHALL NOT be
  applied to other keys, because Android soft keyboards report `229` for
  ordinary character entry.
- A handler that stands down SHALL NOT cancel the keydown's default action, so
  the IME can still confirm or cancel its candidate. The default action SHALL
  be cancelled only when the handler actually acts on the key. This means the
  Vue `.prevent` modifier cannot be used on these bindings; the handler calls
  `event.preventDefault()` itself after the composition check.
- Every `Enter` / `Escape` / arrow / comma handler in the tag input, property
  key input, link dialog, wiki dialog, tag sidebar, whiteboard title, and the
  global keydown dispatcher SHALL stand down while an IME owns the keystroke.
- `Ctrl/Cmd+Enter` SHALL remain available during composition: modifier
  combinations do not conflict with candidate confirmation.

## Capabilities

### New Capabilities

- `input-composition`: the workspace-wide rule that a control must not act on
  a keystroke that belongs to an IME.

### Modified Capabilities

- `keyboard-shortcuts`: `Enter` and `Escape` handlers stand down during
  composition, so the global dispatcher cannot confirm a dialog or close an
  overlay while the user is still typing.
- `note-tags`: the tag input and the tag rename / reparent input do not commit
  while a composition is active.
- `markdown-editor`: the link dialog and wiki-link dialog do not insert a link
  while a composition is active.
- `whiteboard-metadata`: the whiteboard title field lets the IME confirm the
  candidate instead of swallowing the keypress.
- `note-metadata`: the new-property-key input does not add a key while a
  composition is active.

## Impact

- **Affected code**: `src/shared/ime.js` (new), `src/App.vue`,
  `src/components/LinkDialog.vue`, `src/components/TagSidebar.vue`,
  `src/components/WhiteboardEditor.vue`.
- **Behaviour**: no data, schema, or API changes. No existing non-IME flow
  changes — outside a composition the same keys do the same things.
- **Risk**: low, but the fix touches keyboard paths in the note editor, so the
  full test suite must stay green and the editor's `Ctrl/Cmd+Enter` save path
  is explicitly re-verified.
