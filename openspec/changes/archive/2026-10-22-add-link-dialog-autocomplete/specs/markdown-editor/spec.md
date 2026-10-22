## ADDED Requirements

### Requirement: Modal link insertion

The editor SHALL use a modal dialog for both regular links and wiki links instead of a native browser prompt. The dialog SHALL support Visual and Source modes and MUST capture the editor or textarea selection before opening. Inserting a link MUST place it at that captured selection and use the canonical serialization path.

A regular link dialog SHALL provide Text and URL fields, prefilled from the current selection where available. Submitting SHALL insert `[text](url)`. Escape SHALL close the dialog without closing the note editor.

#### Scenario: Add a regular link

- **WHEN** the user selects text and chooses Link, edits the URL, and submits
- **THEN** the selected text becomes the link label and the URL is stored in the markdown
- **AND** the editor selection is replaced by the new link

#### Scenario: Cancel link insertion

- **WHEN** the link dialog is open and the user presses Escape
- **THEN** only the dialog closes
- **AND** the note editor remains open with its content unchanged

### Requirement: Wiki-link note suggestions

The wiki-link dialog SHALL search notes as the user types, using the same search endpoint as the gallery search bar, with debounced requests. It SHALL show matching note titles and types, support arrow-key navigation, and allow inserting a link to a typed title that does not match an existing note. Archived notes and the note currently being edited SHALL be excluded from suggestions.

Choosing an existing note SHALL insert a stable `[[note:<id>|label]]` link. A typed unmatched title SHALL insert `[[title]]` or `[[title|label]]`. When no label is provided, the note title SHALL be used.

#### Scenario: Link to an existing note

- **WHEN** the user types part of a note title and selects the result
- **THEN** the editor inserts a wiki link targeting that note id
- **AND** any text selected before opening the dialog becomes the display label

#### Scenario: Link to a new title

- **WHEN** the user types a title that matches no note and chooses the new-title option
- **THEN** a title-based wiki link is inserted
- **AND** it can be resolved later when that note is created

### Requirement: Wiki-link alias round-trip

Rendered wiki links SHALL expose both the link target and the display label to the editor serializer. Unresolved links with aliases SHALL serialize back to `[[target|label]]` instead of losing the target.

#### Scenario: Edit an unresolved aliased link

- **WHEN** a note contains `[[Missing note|alias]]` and the editor re-renders and saves
- **THEN** the canonical markdown still contains `[[Missing note|alias]]`
