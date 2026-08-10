## 1. Template relocation

- [x] 1.1 Remove the image button (the `<button type="button" @click="triggerImageUpload" class="image-btn" :disabled="imageUploading" title="Insert image">…</button>`) from `.note-form-actions .action-buttons` (~App.vue:247-256)
- [x] 1.2 Insert a new `<div class="note-editor-toolbar">` block immediately before the `<div class="imageEditor" contenteditable>` element; place the relocated image button inside it as the leftmost child
- [x] 1.3 Leave the hidden `<input ref="imageUploadInput" type="file" ...>` and its `@change="onImageFileSelected"` exactly where it is

## 2. Styles

- [x] 2.1 Add `.note-editor-toolbar` CSS: flex row, `gap`, small padding, a subtle bottom border to visually separate from the body; ensure it does not stretch with the body
- [x] 2.2 Reuse `.image-btn` styling; tweak if needed so it reads as a compact toolbar item (same sizing as before; no destructive look)
- [x] 2.3 Verify `.note-form-actions .action-buttons` still lays Save + Cancel correctly with no orphaned space where the image button used to be

## 3. Manual verification

- [ ] 3.1 Open Create modal — image button is in the toolbar above the body; Save + Cancel are the only buttons in the action row
- [ ] 3.2 Open Edit modal — same layout
- [ ] 3.3 Click the toolbar image button — file picker opens
- [ ] 3.4 Upload an image — progress `⏳` shows, then markdown inserted into body as before
- [ ] 3.5 While uploading, clicking the button again is disabled
- [ ] 3.6 Resize to mobile-width — toolbar and action row remain usable
- [ ] 3.7 Update `CHANGELOG.md` under `[Unreleased]` → `Changed`: "Moved text-note image insertion button out of the Save/Cancel action row into an editor toolbar above the body"
