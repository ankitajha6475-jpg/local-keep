## MODIFIED Requirements

### Requirement: Markdown image rendering in text notes
The text note viewer SHALL render markdown image references (`![alt](url)`) as inline `<img>` elements pointing to the shared image store. The rendered element SHALL declare `loading="lazy"` and `decoding="async"`.

#### Scenario: Render image in note view
- **WHEN** a note's content contains `![photo](/api/images/a1b2c3d4e5f67890.png)`
- **THEN** the note view renders an `<img>` tag with `src="/api/images/a1b2c3d4e5f67890.png"`
- **AND** the image loads lazily and decodes asynchronously

#### Scenario: Broken image reference
- **WHEN** a note references an image URL that returns 404
- **THEN** the renderer SHALL show a broken image indicator or the alt text, not crash
