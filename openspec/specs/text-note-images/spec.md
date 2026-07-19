# Text Note Images

## Purpose

The system allows users to insert images into text notes, which are stored using the shared content-addressed image storage and referenced via markdown syntax.

## Requirements

### Requirement: Image upload in text note editor
The text note editor SHALL provide an image insertion capability, accessible via a toolbar button and via paste. Images are uploaded to the shared image store and referenced by markdown syntax in the note content.

#### Scenario: Insert image via toolbar button
- **WHEN** the user clicks the "insert image" button in the text note editor
- **THEN** a file picker opens, the selected image is uploaded to `/api/images`
- **AND** the markdown reference `![image](/api/images/<hash>.<ext>)` is appended to the note content

#### Scenario: Paste image into text note
- **WHEN** the user pastes an image from the clipboard while editing a text note
- **THEN** the image is uploaded to `/api/images` and the markdown reference is inserted at the cursor position

#### Scenario: Upload feedback
- **WHEN** an image is being uploaded
- **THEN** the UI SHALL show a brief uploading indicator, and replace it with the markdown reference on success

### Requirement: Markdown image rendering in text notes
The text note viewer SHALL render markdown image references (`![alt](url)`) as inline `<img>` elements pointing to the shared image store.

#### Scenario: Render image in note view
- **WHEN** a note's content contains `![photo](/api/images/a1b2c3d4e5f67890.png)`
- **THEN** the note view renders an `<img>` tag with `src="/api/images/a1b2c3d4e5f67890.png"`

#### Scenario: Broken image reference
- **WHEN** a note references an image URL that returns 404
- **THEN** the renderer SHALL show a broken image indicator or the alt text, not crash

### Requirement: Image references use shared store URLs
Image references in text notes SHALL use the same `/api/images/<hash>.<ext>` URL format that serves images from the shared content-addressed store. This ensures images uploaded via whiteboard can be referenced in text notes and vice versa.

#### Scenario: Reference a whiteboard image in text note
- **WHEN** a user knows the hash of an image that was inserted in a whiteboard
- **THEN** they can reference it in a text note as `![alt](/api/images/<hash>.<ext>)` and it resolves to the same file