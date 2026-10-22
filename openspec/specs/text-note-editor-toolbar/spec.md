# Text Note Editor Toolbar

## Purpose

Places text-note editing affordances, starting with image insertion, in a dedicated toolbar above the note body so the modal's Save/Cancel action row contains only commit decisions.

## Requirements

### Requirement: Editor toolbar above the body holds editor affordances

The text note editor SHALL render a dedicated toolbar (`.note-editor-toolbar`) directly above the contenteditable editor body. The toolbar SHALL host the markdown tool groups followed by the image-insert button as inline siblings, and SHALL be visually distinct from the modal's Save/Cancel action row. The Visual/Source mode switch and the paste-mode select SHALL NOT be toolbar children; they SHALL live in the modal's bottom action row, left of the Save/Draft/Discard buttons.

#### Scenario: Image button visible in toolbar

- **WHEN** the user opens the note create or edit modal
- **THEN** an image-insert button is rendered inside the toolbar above the editor body, in the same inline flow as the markdown tool groups, not inside the Save/Cancel action row and not right-aligned with a flexible spacer between it and the tools

#### Scenario: Action row contains only commit buttons on the right

- **WHEN** the user opens the note create or edit modal
- **THEN** the `.note-form-actions` row shows the mode switch and paste-mode select on the left and exactly the Submit (Save/Add Note) button plus the Draft/Discard buttons on the right, and does NOT contain the image-insert button

#### Scenario: Action row contains only Save and Cancel

- **WHEN** the user opens the note create or edit modal
- **THEN** the `.note-form-actions` action-buttons row contains exactly the Submit (Save/Add Note) button and the Cancel button, and does NOT contain the image-insert button

#### Scenario: Mode switch is not in the content toolbar

- **WHEN** the user opens the note create or edit modal
- **THEN** the Visual/Source mode switch is rendered in the bottom action row, not inside `.note-editor-toolbar`

#### Scenario: Paste mode select is not in the content toolbar

- **WHEN** the user opens the note create or edit modal
- **THEN** the Paste: plain/rich select is rendered in the bottom action row, not inside `.note-editor-toolbar`

### Requirement: Image-insert button behavior is unchanged

Relocating the image button SHALL preserve its existing behavior: clicking it triggers the hidden file input; while an upload is in flight the button is disabled and shows a progress glyph; selecting a file triggers the same upload and markdown-insert flow.

#### Scenario: Clicking the toolbar image button opens the file picker

- **WHEN** the user clicks the image button in the toolbar
- **THEN** the hidden `<input type="file">` is clicked (the file picker opens)

#### Scenario: Upload in flight disables the button

- **WHEN** an image upload is in progress (`imageUploading` is true)
- **THEN** the image button is disabled (`disabled` attribute set) and displays the progress glyph `⏳`

#### Scenario: Image button tooltip matches the markdown tools

- **WHEN** the user hovers the image button in the editor toolbar
- **THEN** its tooltip shows the action name in the same style as the markdown tool buttons
- **AND** while Alt/Option is held the tooltip shows the image shortcut instead of the name

#### Scenario: Selected file inserts markdown into the body

- **WHEN** the user selects an image file via the picker
- **THEN** the upload runs and the resulting markdown `![alt](/api/images/<hash>.<ext>)` is inserted into the editor body, exactly as before the relocation
