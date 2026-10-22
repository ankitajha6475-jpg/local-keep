# Note Relationships

## Purpose

Lets notes reference each other through wiki links and exposes those relationships as backlinks, a navigable graph, and clickable internal links.

## Requirements

### Requirement: Wiki-link syntax and parsing

The system SHALL parse `[[Title]]`, `[[Title|label]]`, and `[[note:<id>|label]]` outside fenced code blocks and inline code. Link targets MUST be trimmed; links longer than 200 characters and notes with more than 200 links SHALL be ignored beyond the limit. Parsing MUST NOT treat `[[...]]` inside code as a link.

#### Scenario: Parse a title link

- **WHEN** a note contains `See [[Another note|details]]`
- **THEN** a link target `Another note` with label `details` is recorded

#### Scenario: Ignore code links

- **WHEN** `[[Another note]]` appears inside a fenced code block or inline code
- **THEN** no relationship is recorded for it

### Requirement: Link resolution

Title links SHALL resolve against the current head `title` or `display_title`, case-insensitively after whitespace normalisation. Exactly one match SHALL resolve; zero matches SHALL be `unresolved`; multiple matches SHALL be `ambiguous`. Explicit `note:<id>` links MUST resolve by id and SHALL be marked `archived` when the target is archived. Resolution SHALL be refreshed when a note title or display title changes.

#### Scenario: Resolve a unique title

- **WHEN** exactly one head note has the target title/display title
- **THEN** the link's `target_note_id` is set and status is `ok`

#### Scenario: Ambiguous title

- **WHEN** two head notes share the target title/display title
- **THEN** the link status is `ambiguous` and no target id is chosen

#### Scenario: Explicit id link

- **WHEN** a link uses `[[note:<id>|label]]` and the note exists
- **THEN** it resolves to that note regardless of title
- **AND** an archived target is marked `archived`

### Requirement: Backlinks and outgoing links

The system SHALL expose outgoing links for a note and backlinks from other head notes. Backlink entries MUST include source note id/title/type, link label/status, and a short context snippet around the raw link occurrence.

#### Scenario: Show backlinks

- **WHEN** note B contains `[[A]]` and note A is opened
- **THEN** A's backlinks include B with the link label and surrounding context
- **AND** B's outgoing links include A

### Requirement: Graph view

The system SHALL expose a graph of resolved relationships as nodes and edges. It SHALL support an optional note id plus depth for a neighbourhood, a tag filter, and a limit. Archived notes and unresolved/ambiguous links SHALL be excluded unless explicitly requested. The UI SHALL render the graph and allow clicking a node to open the note.

#### Scenario: Graph neighbourhood

- **WHEN** a client requests the graph around note A with depth 1
- **THEN** the response contains A and its directly linked neighbours plus edges
- **AND** clicking a node in the UI opens that note

### Requirement: Internal link navigation

Rendered wiki links with a resolved target SHALL open the target note from the gallery, editor, or preview. Unresolved links SHALL be visually marked and SHALL NOT navigate. Archived targets SHALL show an archived notice.

#### Scenario: Open a resolved link

- **WHEN** a user clicks a rendered `[[Another note]]` link
- **THEN** the target note opens
- **AND** the current editor's unsaved changes are not discarded without confirmation

#### Scenario: Broken link

- **WHEN** a user clicks a link whose target cannot be resolved
- **THEN** an inline/broken-link notice is shown and no navigation occurs

### Requirement: Link rebuild on revision

Links SHALL describe the current head. When a revision moves the head, the system SHALL rebuild that note's links and re-resolve title links globally. Branch revisions that do not move the head SHALL NOT change the head's links.

#### Scenario: Edit adds a link

- **WHEN** a user saves a revision that adds `[[B]]`
- **THEN** the head's outgoing links include B
- **AND** B's backlinks include the edited note

#### Scenario: Branch does not change head links

- **WHEN** a stale save is kept as a branch
- **THEN** the head's links remain those of the current head
- **AND** the branch content is still readable in history

### Requirement: Link migration

A versioned migration SHALL create link tables and backfill existing notes from their head content and canvas text. The migration MUST be idempotent and MUST run after the note-thread migration.

#### Scenario: Backfill existing links

- **WHEN** the migration runs on an existing database containing `[[link]]`
- **THEN** `note_links` contains the parsed entries
- **AND** re-running the migration creates no duplicates

### Requirement: Bulk link summary for selected notes

The system SHALL expose a read-only bulk relationship summary for a set of note ids. The summary MUST group outgoing links by resolved target note (or by status + target label when unresolved/ambiguous) and backlinks by source note. Each group MUST include the linked note's id (when resolved), title/display title, type, archived state, link status, and at least one context snippet. Duplicate note ids MUST NOT duplicate groups. A request with no valid ids SHALL return empty groups.

Archived source notes SHALL be excluded from backlinks unless `includeArchived` is requested. Archived targets SHALL still appear in outgoing groups and be marked archived.

#### Scenario: Summarise several selected notes

- **WHEN** notes A and B are selected, A links to C and D links to both A and B
- **THEN** the outgoing groups contain C once with A as its source
- **AND** the incoming groups contain D once with links to A and B
- **AND** each group includes a context snippet

#### Scenario: Unresolved target

- **WHEN** a selected note contains `[[Missing note]]`
- **THEN** the outgoing summary includes an `unresolved` entry labelled `Missing note`
- **AND** the entry has no target note id

#### Scenario: Archived relationships

- **WHEN** a selected note links to an archived note
- **THEN** the outgoing group is marked archived
- **AND** backlinks from archived sources appear only when `includeArchived` is true

### Requirement: Selection links UI

The gallery's multi-note selection bar SHALL offer a link-summary action. The resulting panel SHALL show both directions by default and SHALL allow switching between both, outgoing only, and incoming only. Rows SHALL open the related note, SHALL show archived/unresolved/ambiguous status, and SHALL NOT open archived or unresolved entries. Opening a related note while the editor has unsaved changes SHALL require confirmation.

#### Scenario: List links for a selection

- **WHEN** the user selects notes and chooses the link-summary action
- **THEN** the panel lists the notes they link to and the notes linking to them
- **AND** clicking a resolved active row opens that note

#### Scenario: Filter direction

- **WHEN** the user switches the panel to "Linked from"
- **THEN** only incoming sources are listed

### Requirement: Wiki-link insertion search

The wiki-link insertion dialog SHALL let the user find a target note by typing, using keyword search over titles and content. It SHALL exclude archived notes and the current note, present recent active notes for an empty query, and keep the display label separate from the target title.

Inserting a link to an existing note SHALL use the stable `note:<id>` form. Inserting a typed new title SHALL use the title form and remain unresolved until a matching note exists.

#### Scenario: Find a target by title

- **WHEN** the user types part of an existing note title in the wiki-link dialog
- **THEN** that note appears in the suggestions
- **AND** choosing it inserts a link with the note id as the target

#### Scenario: Preserve a label

- **WHEN** the user selected the text `read this` before opening the wiki-link dialog and chooses a note titled `Alpha`
- **THEN** the inserted link resolves to `Alpha` and displays `read this`
