## Why

The "Insert image" button in the text note editor currently sits **between Save and Cancel** in the `.note-form-actions` row. That placement is confusing — image insertion is an editor affordance, not a destructive/commit action, and visually competes with the primary Save button. Per user request, it should move to a small toolbar above the editor body where it functions as a content tool.

## What Changes

- Introduce a small editor toolbar (`.note-editor-toolbar`) directly above the `imageEditor` contenteditable body.
- Move the image-button (🖼️) from the `.action-buttons` row into this toolbar, as the leftmost action.
- Keep the hidden file `<input>` (`imageUploadInput`) and its `@change` handler `onImageFileSelected` unchanged — only the trigger button's location changes.
- Save and Cancel remain in the `.note-form-actions` row below the editor, in their existing order (Save primary, Cancel secondary).
- Add styling for the toolbar consistent with the existing button styles (`.image-btn` styling reused).
- Preserve all existing behavior: `triggerImageUpload`, `imageUploading` state, keyboard shortcut hints in the actions row.

## Capabilities

### New Capabilities
- `text-note-editor-toolbar`: A toolbar above the text note editor body hosting editor affordances (image insertion first), separate from the action row (commit/cancel) below.

### Modified Capabilities
<!-- None. No existing spec governs text-note editor layout; `text-note-images` covers image storage, not UI placement. -->

## Impact

- **Affected code**:
  - `src/App.vue` template (~247-256): remove the `<button ... class="image-btn">` from `.action-buttons`; add a new `.note-editor-toolbar` block before the `<div class="imageEditor" ...>` element containing the relocated button.
  - `src/App.vue` styles (~2490): add `.note-editor-toolbar` layout rules; refine `.image-btn` so it reads as a toolbar item.
- **Behavior**: unchanged — `triggerImageUpload()` still fires from the same handler.
- **No server or persistence changes.**
- **No API changes.**
