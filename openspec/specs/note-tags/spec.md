# Note Tags

## Purpose

Gives notes a hierarchical, code-aware tag structure with a browsable tree, counts, and descendant-aware filtering.

## Requirements

### Requirement: Tag syntax and normalisation

Tags SHALL be a list-valued property of the note's properties section, not text parsed from the body. Tag paths SHALL be hierarchical slash paths (`area/project/topic`), NFKC-normalised, lowercased, deduplicated, limited to 64 characters, and capped at 100 per note. The body MAY contain `#` text, which is never interpreted as a tag. Inline content parsing SHALL be used only by migration and by the pre-migration compatibility writers.

#### Scenario: Body hash text is not a tag

- **WHEN** a note's body contains `#project/alpha` and its fence declares `tags: [ops]`
- **THEN** the note's tags are exactly `ops`
- **AND** the body text renders unchanged

#### Scenario: Parse a hierarchical tag

- **WHEN** a note declares `tags: [project/local-keep/design]`
- **THEN** the note has that full tag path
- **AND** the tag tree exposes `project`, `project/local-keep`, and the full path

#### Scenario: Ignore code and colours

- **WHEN** a note's body contains `#e2ece4` or `#tag` inside code
- **THEN** neither is recorded as a tag

### Requirement: Tag tree and counts

`GET /api/tags` SHALL return a tree of tag paths with direct note counts and subtree counts. Prefix filtering SHALL be supported. The UI SHALL show a collapsible tag tree with counts and an "Untagged" entry.

#### Scenario: Tag tree counts

- **WHEN** two notes use `#project/local-keep` and one uses `#project/other`
- **THEN** `project` has subtree count 3
- **AND** `project/local-keep` has direct count 2

### Requirement: Operable tag tree

The tag tree SHALL support renaming a tag path, moving a subtree under a new parent, and deleting a subtree, applied across every note whose tags match. Operations SHALL use exact-path semantics: renaming `area/project` rewrites `area/project` and `area/project/*`, and must not touch `area/projector`. Archived notes SHALL be skipped and reported.

#### Scenario: Rename a subtree

- **WHEN** the user renames `area/project` to `area/proj`
- **THEN** every note tagged `area/project` or `area/project/...` has those paths rewritten to `area/proj` and `area/proj/...`
- **AND** `area/projector` is unchanged

#### Scenario: Move a subtree

- **WHEN** the user moves `alpha` under `ops`
- **THEN** `alpha` and `alpha/*` become `ops/alpha` and `ops/alpha/*`
- **AND** the tree re-derives from the rewritten tags

#### Scenario: Delete a subtree with confirmation

- **WHEN** the user confirms deleting `area/project`
- **THEN** those tag paths are removed from every affected note's `tags` property
- **AND** the notes themselves remain intact

### Requirement: Tag tree operations are property mutations

Rename, move, and delete SHALL rewrite the `tags` property of each affected note and create one revision per note with `source: property` and a shared message describing the operation. Archived notes SHALL NOT be modified and SHALL be reported as skipped.

#### Scenario: Batch revision message

- **WHEN** a rename touches five notes
- **THEN** each affected note gains exactly one revision
- **AND** all five revisions carry the same operation message

### Requirement: Tag filtering

Note list and search SHALL accept a `tag` filter. By default it SHALL include descendants (`#project` matches `#project/local-keep`); `exactTag=1` SHALL restrict to the exact tag. Selecting a tag in the sidebar SHALL filter the gallery and show a removable breadcrumb.

#### Scenario: Filter by parent tag

- **WHEN** the user selects `#project`
- **THEN** notes tagged `#project` or any `#project/...` child are shown
- **AND** selecting the exact-only mode shows only exact `#project` notes

### Requirement: Tags on notes

Note list/get responses SHALL include the note's current tags derived from the fence. Cards SHALL render tag chips; clicking a chip SHALL apply the tag filter. The note's properties panel SHALL edit tags through chips that write the `tags` property.

#### Scenario: Edit tags through chips

- **WHEN** the user adds `project/alpha` in the properties panel
- **THEN** the fence's `tags` list gains the entry
- **AND** the tag tree and counts update

#### Scenario: Card tag chip

- **WHEN** a note declares `tags: [project/local-keep]`
- **THEN** its card shows a `#project/local-keep` chip
- **AND** clicking it filters the gallery

### Requirement: Tag rebuild on revision

Tags SHALL describe the current head. When a revision moves the head, the system SHALL rebuild that note's tags from its fence. Branch revisions that do not move the head SHALL NOT change the head's tags.

#### Scenario: Edit adds a tag

- **WHEN** a user saves a revision whose fence adds `project/new`
- **THEN** the head's tags include `project/new`
- **AND** the tag tree counts include it

#### Scenario: Branch does not change head tags

- **WHEN** a stale save is kept as a branch with a new tag
- **THEN** the head's tags remain unchanged
- **AND** the branch content is still readable in history

### Requirement: Tag migration

A versioned migration SHALL create tag tables and backfill existing notes from their head content and canvas text. The migration MUST be idempotent and MUST run after the note-thread migration. A later normalization migration SHALL move tags from body markers into the fence and MUST append a normalization revision per note rather than rewriting history.

#### Scenario: Backfill existing tags

- **WHEN** the migration runs on an existing database containing `#tag`
- **THEN** `note_tags` contains the parsed entries
- **AND** re-running the migration creates no duplicates

#### Scenario: Normalization moves markers into the fence

- **WHEN** the properties migration runs on a note with inline `#tag` markers
- **THEN** the head body no longer contains those markers
- **AND** the fence lists them under `tags`
- **AND** one normalization revision is appended

### Requirement: Tag sidebar never scrolls horizontally

The tag sidebar SHALL keep a fixed-width column in which every row fits without
a horizontal scrollbar. Long tag names SHALL truncate with an ellipsis and the
count pill SHALL remain visible; the sidebar SHALL hide horizontal overflow so
the browser can never render a horizontal scrollbar in the column.

#### Scenario: Long tag name

- **WHEN** a tag path is longer than the sidebar width
- **THEN** the name is truncated with an ellipsis
- **AND** the count pill stays visible on the row

#### Scenario: No horizontal scrollbar

- **WHEN** the sidebar renders any set of tags
- **THEN** the sidebar never shows a horizontal scrollbar
