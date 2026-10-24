# Note Display Title

## Purpose

Defines how a note's displayed title is derived when no explicit title is stored, so untitled notes remain identifiable in the gallery, list, and editor without altering the stored title, and so saves are never blocked by an empty body.

## Requirements

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

The display title SHALL be the note's `aliases` property first entry when present, otherwise derived from the note title, otherwise from the first meaningful line of the body. `display_title` SHALL remain a shadow projection for listing and search and MUST NOT be written into the fence as its own key.

#### Scenario: Note has an explicit title

- **WHEN** a note has `title: "Shopping list"` and any content
- **THEN** the display title returned is `"Shopping list"` (the content is NOT used)

#### Scenario: Note has no title but has content

- **WHEN** a note has `title: ""` and `content: "Buy milk, eggs, and bread"`
- **THEN** the display title returned is the leading characters of the cleaned content

#### Scenario: Note has neither title nor content

- **WHEN** a note has `title: ""` and `content: ""`
- **THEN** the display title returned is the fallback `"Untitled"`

#### Scenario: Alias drives the display title

- **WHEN** a note's fence declares `aliases: [Quarterly Plan, Q3]`
- **THEN** the display title is `Quarterly Plan`
- **AND** the fence retains both aliases

#### Scenario: No aliases falls back to the title

- **WHEN** a note has a title and no `aliases` property
- **THEN** the display title matches the title

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

### Requirement: Aliases participate in link resolution

Wiki-link title resolution SHALL match a note by its title or by any entry in its `aliases` list. Ambiguity rules are unchanged: multiple matches remain ambiguous.

#### Scenario: Resolve by alias

- **WHEN** a note titled `Q3 Plan` declares `aliases: [Quarterly Plan]`
- **THEN** `[[Quarterly Plan]]` resolves to that note
- **AND** `[[Q3 Plan]]` resolves to the same note
