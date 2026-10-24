# Note Display Title — Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Aliases participate in link resolution

Wiki-link title resolution SHALL match a note by its title or by any entry in its `aliases` list. Ambiguity rules are unchanged: multiple matches remain ambiguous.

#### Scenario: Resolve by alias

- **WHEN** a note titled `Q3 Plan` declares `aliases: [Quarterly Plan]`
- **THEN** `[[Quarterly Plan]]` resolves to that note
- **AND** `[[Q3 Plan]]` resolves to the same note
