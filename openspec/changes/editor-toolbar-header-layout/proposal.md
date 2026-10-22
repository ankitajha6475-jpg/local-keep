# Proposal: Editor toolbar header layout

## Why

The note editor toolbar has grown into a crowded second row: mode switch on the
left, markdown tools in the middle, and a right-aligned paste-mode select plus
image button. The modal header only shows a title and three action buttons, so
there is spare room. Users asked for a calmer layout:

- the paste-mode select and the Visual/Source mode switch belong in the modal
  header (persistent editor-level controls, not per-content formatting tools);
- the image button should sit with the markdown tools instead of being pinned to
  the far right (it inserts content, like the other content tools);
- the `h2` title is noisy — `Editing Note v2` should simply read `Editor`, and
  the revision badge should go.

## What Changes

- Move the `.editor-mode-switch` (Visual/Source) out of `.note-editor-toolbar`
  into the bottom action row (`.note-form-actions`), left of the
  Save/Draft/Discard buttons.
- Move the `.paste-mode-select` out of `.note-editor-toolbar` into the bottom
  action row, grouped with the mode switch.
- Move the image button into the markdown tool groups area so it flows inline
  after the last markdown tool group instead of being right-aligned via the
  toolbar spacer.
- Simplify the modal header `h2`: always `Editor` (new note and editing),
  drop the `v{{ editingRevisionNo }}` revision badge and the `Ctrl+Enter to
  save` hint; keep the `● Live` collab badge.
- Keep all shortcuts (`Ctrl+Alt+V`, `Ctrl+Alt+S`, `Ctrl+Alt+I`), the paste-mode
  persistence, the image upload flow, and every markdown tool unchanged.

## Capabilities

### New: none

### Modified: `text-note-editor-toolbar`, `markdown-editor`

- `text-note-editor-toolbar`: the toolbar above the body now hosts only the
  markdown tool groups plus the inline image button; the mode switch and
  paste-mode select are no longer toolbar children.
- `markdown-editor`: Visual/Source switching and the plain/rich paste switch
  keep their behavior but now live in the modal header; the header title is
  `Editor` with no revision number badge.

## Impact

- `src/App.vue` template: modal header and `.note-editor-toolbar` blocks.
- `src/App.vue` styles: header toolbar group layout; remove the now-dead
  toolbar spacer/divider usage in the editor toolbar.
- No server, protocol, or persistence changes.
