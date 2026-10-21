## Context

The text-note editor modal has a single `.note-form-actions` row currently holding `[Save] [🖼️ Image] [Cancel]` plus a keyboard hint. Mixing the image-insert affordance with the save/cancel commit actions is a UX problem — insertion is a content action that belongs with editor controls, not with the modal's outcome buttons. The user wants the image button moved **above** the editor body, into a small toolbar row.

The hidden file input, the upload handler, the markdown-insert helper, and the upload state are all unchanged — this is a pure template/CSS relocation.

## Goals / Non-Goals

**Goals:**
- Move the image-insert button out of the Save/Cancel action row into a dedicated toolbar above the editor body.
- Keep all functionality intact (upload, progress indicator `⏳`, hidden `<input>`).
- Make the toolbar visually distinct from the action row (left-aligned icon button, no competing color emphasis).

**Non-Goals:**
- Adding other toolbar buttons (bold/italic/etc.) — not requested; this change only moves the existing image button. New buttons can be added later as children of the same `.note-editor-toolbar`.
- Modal-splitting, larger editor redesign.
- Touch/stylus behavior changes.

## Decisions

### Decision 1: Toolbar placement — directly above the editor body
Insert `<div class="note-editor-toolbar">…</div>` immediately before `<div class="imageEditor" contenteditable>…</div>`. This puts the image button at eye level with the content it affects and groups it with future editor affordances.

### Decision 2: Action row becomes Save + Cancel only
`.note-form-actions .action-buttons` simplifies to `[Save] [Cancel]`. The keyboard hint stays.

### Decision 3: Reuse `.image-btn` styling
The same class works in the new location. Add `.note-editor-toolbar` layout (flex row, small padding, small bottom border to visually separate from the body). No CSS variable overhaul needed.

### Decision 4: Disabled-state behavior preserved
The `imageUploading ? '⏳' : '🖼️'` and `:disabled="imageUploading"` bindings move verbatim to the toolbar-located button.

## Risks / Trade-offs

- **[Risk] Visual regression for users used to the old spot** — minor; the button is more discoverable in the new location and no functionality is removed.
- **[Risk] Toolbar takes vertical space from the editor** — single row (~32px), negligible; modal already has enough room.
- **[Risk] Mobile/touch target** — keep the same icon-button size as before; no regression.

## Migration Plan

Pure frontend change. No data migration. Deploy → button now appears in toolbar above the body.

## Open Questions

none.
