## ADDED Requirements

### Requirement: Editor toolbar above the body holds editor affordances
The text note editor SHALL render a dedicated toolbar (`.note-editor-toolbar`) directly above the contenteditable editor body. The toolbar SHALL host editor content affordances and SHALL be visually distinct from the modal's Save/Cancel action row.

#### Scenario: Image button visible in toolbar
- **WHEN** the user opens the note create or edit modal
- **THEN** an image-insert button is rendered inside the toolbar above the editor body, not inside the Save/Cancel action row

#### Scenario: Action row contains only Save and Cancel
- **WHEN** the user opens the note create or edit modal
- **THEN** the `.note-form-actions` action-buttons row contains exactly the Submit (Save/Add Note) button and the Cancel button, and does NOT contain the image-insert button

### Requirement: Image-insert button behavior is unchanged
Relocating the image button SHALL preserve its existing behavior: clicking it triggers the hidden file input; while an upload is in flight the button is disabled and shows a progress glyph; selecting a file triggers the same upload and markdown-insert flow.

#### Scenario: Clicking the toolbar image button opens the file picker
- **WHEN** the user clicks the image button in the toolbar
- **THEN** the hidden `<input type="file">` is clicked (the file picker opens)

#### Scenario: Upload in flight disables the button
- **WHEN** an image upload is in progress (`imageUploading` is true)
- **THEN** the image button is disabled (`disabled` attribute set) and displays the progress glyph `⏳`

#### Scenario: Selected file inserts markdown into the body
- **WHEN** the user selects an image file via the picker
- **THEN** the upload runs and the resulting markdown `![alt](/api/images/<hash>.<ext>)` is inserted into the editor body, exactly as before the relocation
