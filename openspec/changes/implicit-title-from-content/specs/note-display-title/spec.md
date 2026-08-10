## ADDED Requirements

### Requirement: Notes may be saved with a title only, content only, both, or neither
The note create and edit flows SHALL NOT require a non-empty body. Saving a note with a title and empty content, content and empty title, or both empty SHALL succeed and persist as-is.

#### Scenario: Save a note with title only
- **WHEN** the user enters a title and leaves content empty and clicks Save
- **THEN** the note is persisted with the title and empty content
- **AND** the modal closes and the note appears in the list

#### Scenario: Save a note with content only
- **WHEN** the user enters content and leaves the title empty and clicks Save
- **THEN** the note is persisted with empty title and the entered content

#### Scenario: Edit a note to remove its content
- **WHEN** the user edits an existing note and clears its content (title remains) and clicks Save
- **THEN** the save succeeds; the note retains its title and now-empty content

### Requirement: Display title derivation rule
The list, gallery cards, and editor header SHALL display a note's title using a derivation rule: (1) the stored `title` if it is non-empty after trimming; (2) otherwise the leading characters of the cleaned content; (3) otherwise a localized fallback string.

#### Scenario: Note has an explicit title
- **WHEN** a note has `title: "Shopping list"` and any content
- **THEN** the display title returned is `"Shopping list"` (the content is NOT used)

#### Scenario: Note has no title but has content
- **WHEN** a note has `title: ""` and `content: "Buy milk, eggs, and bread"`
- **THEN** the display title returned is the leading characters of the cleaned content

#### Scenario: Note has neither title nor content
- **WHEN** a note has `title: ""` and `content: ""`
- **THEN** the display title returned is the fallback `"Untitled"`

### Requirement: Leading content is cleaned before becoming the display title
When deriving a display title from content, the system SHALL strip markdown image syntax (replacing `![alt](url)` with `alt`, or empty when alt is absent), strip any `data:` URLs, collapse whitespace runs to a single space, and trim leading/trailing whitespace before taking the leading characters.

#### Scenario: Content starts with a markdown image with alt text
- **WHEN** content is `"![cat](/api/images/abc.png) Note about the cat"`
- **THEN** the cleaned leading text is `"cat Note about the cat"` (alt text replaces the image)

#### Scenario: Content starts with a data URL
- **WHEN** content is `"data:image/png;base64,iVBOR... rest"`
- **THEN** the data URL is stripped and the cleaned leading text is `"rest"` (after collapsing/trimming)

#### Scenario: Content is inline base64 only
- **WHEN** content is `"![alt](data:image/png;base64,AAA)"`
- **THEN** the cleaned leading text is `"alt"` (data URL removed, alt preserved)

### Requirement: Display title length is bounded and suffixed when truncated
The derived display title from content SHALL be truncated to at most 50 characters. When the cleaned content is longer than 50 characters, the displayed title SHALL end with a single ellipsis character (`…`). When the cleaned content is exactly 50 characters or shorter, no ellipsis SHALL be appended.

#### Scenario: Content longer than 50 characters
- **WHEN** cleaned content is 80 characters
- **THEN** the display title is the first 50 characters followed by `…`

#### Scenario: Content exactly 50 characters
- **WHEN** cleaned content is exactly 50 characters
- **THEN** the display title is all 50 characters with no ellipsis

### Requirement: Derived display titles apply consistently across surfaces
The title derivation rule SHALL be used in every UI surface that displays a note's title, including (but not limited to) the gallery card, the note list, and the editor header. The stored `title` field SHALL remain unchanged by this derivation.

#### Scenario: Gallery card uses derived title
- **WHEN** the gallery renders a note that has no title
- **THEN** the card header shows the derived display title (leading content snippet), not blank

#### Scenario: Editor preserves stored title for editing
- **WHEN** the user opens a note for editing whose stored title is empty
- **THEN** the title input field is empty (the user can fill it in), even though the gallery showed a derived title
