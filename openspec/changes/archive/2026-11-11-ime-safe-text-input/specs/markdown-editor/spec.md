## MODIFIED Requirements

### Requirement: Modal link insertion

The editor SHALL use a modal dialog for both regular links and wiki links instead of a native browser prompt. The dialog SHALL support Visual and Source modes and MUST capture the editor or textarea selection before opening. Inserting a link MUST place it at that captured selection and use the canonical serialization path.

A regular link dialog SHALL provide Text and URL fields, prefilled from the current selection where available. Submitting SHALL insert `[text](url)`. Escape SHALL close the dialog without closing the note editor.

No link SHALL be inserted and the dialog SHALL NOT close while an IME owns the keystroke. Enter and Escape SHALL stand down during a composition so the IME can confirm or cancel its candidate.

#### Scenario: Add a regular link

- **WHEN** the user selects text and chooses Link, edits the URL, and submits
- **THEN** the selected text becomes the link label and the URL is stored in the markdown
- **AND** the editor selection is replaced by the new link

#### Scenario: Cancel link insertion

- **WHEN** the link dialog is open and the user presses Escape
- **THEN** only the dialog closes
- **AND** the note editor remains open with its content unchanged

#### Scenario: Submit during IME composition

- **WHEN** the user presses Enter while an IME is composing the URL
- **THEN** the IME confirms the candidate
- **AND** no link is inserted

#### Scenario: Escape during IME composition

- **WHEN** the user presses Escape while an IME is composing the URL
- **THEN** the IME cancels the candidate
- **AND** the link dialog stays open

### Requirement: Wiki-link note suggestions

The wiki-link dialog SHALL search notes as the user types, using the same search endpoint as the gallery search bar, with debounced requests. It SHALL show matching note titles and types, support arrow-key navigation, and allow inserting a link to a typed title that does not match an existing note. Archived notes and the note currently being edited SHALL be excluded from suggestions.

Choosing an existing note SHALL insert a stable `[[note:<id>|label]]` link. A typed unmatched title SHALL insert `[[title]]` or `[[title|label]]`. When no label is provided, the note title SHALL be used.

No wiki link SHALL be inserted while an IME owns the keystroke. Enter and the arrow keys SHALL stand down during a composition so the IME can confirm or cancel its candidate and the suggestion highlight does not move on its own.

#### Scenario: Link to an existing note

- **WHEN** the user types part of a note title and selects the result
- **THEN** the editor inserts a wiki link targeting that note id
- **AND** any text selected before opening the dialog becomes the display label

#### Scenario: Link to a new title

- **WHEN** the user types a title that matches no note and chooses the new-title option
- **THEN** a title-based wiki link is inserted
- **AND** it can be resolved later when that note is created

#### Scenario: Accept a suggestion during IME composition

- **WHEN** the user presses Enter while an IME is composing a note title
- **THEN** the IME confirms the candidate
- **AND** no wiki link is inserted
