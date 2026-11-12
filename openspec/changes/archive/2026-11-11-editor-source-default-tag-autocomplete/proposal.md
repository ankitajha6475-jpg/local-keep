## Why

Three small editor behaviours were wrong or missing:

1. The note editor opened in **Visual** mode, but Source is the canonical
   markdown surface and the safer default for technical notes.
2. Tags from the previous editor session leaked into the next new note because
   the properties section was never cleared when the editor was reset.
3. Adding a tag required typing the full path exactly; there was no help for the
   existing hierarchical tag tree while typing.

## What Changes

- The editor SHALL open new notes and existing notes in **Source** mode by
  default. Visual remains available from the bottom-left mode switch and with
  `Ctrl/Cmd+Shift+M`, and no mode preference is persisted.
- Every new-note path SHALL reset the editor-local properties state, so a new
  note always starts with an empty `tags` list and no inherited user properties
  or drafts (`tagDraft`, `propKeyDraft`).
- The properties-panel tag input SHALL offer fuzzy autocomplete while typing.
  Suggestions come from the known tag tree, exclude tags already on the note,
  rank exact/prefix/segment/substring/subsequence matches, and support keyboard
  selection and click/tap insertion. Manually typed new tags remain possible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-editor`: Source is the default editing mode.
- `note-tags`: tag autocomplete while typing, and new notes start with no tags.

## Impact

- **Affected code**: `src/App.vue` (editor mode defaults, properties reset, tag
  suggestion UI/state), `src/shared/tags.js` (`matchTags`), `tests/tags.test.js`.
- **Behaviour**: no data or schema changes; autocomplete is client-side over the
  already-loaded tag tree. Tags are still written as the `tags` property when
  the note is saved.
- **No API changes.**
