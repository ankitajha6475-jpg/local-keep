# Note Tags

## Purpose

Gives notes a hierarchical, code-aware tag structure with a browsable tree, counts, and descendant-aware filtering.

## Requirements

### Requirement: Tag syntax and normalisation

The system SHALL parse `#tag` and hierarchical `#area/project/topic` tags outside code. A tag MUST start with a Unicode letter, may contain letters/numbers/`_`/`-`/`/`, and MUST NOT be immediately preceded by an ASCII word character. Pure hex colour tokens SHALL NOT be tags. Tags SHALL be NFKC-normalised, lowercased, deduplicated, limited to 64 characters, and capped at 100 per note.

#### Scenario: Parse a hierarchical tag

- **WHEN** a note contains `#project/local-keep/design`
- **THEN** the note has that full tag path
- **AND** the tag tree exposes `project`, `project/local-keep`, and the full path

#### Scenario: Ignore code and colours

- **WHEN** a note contains `#e2ece4` or `#tag` inside code
- **THEN** neither is recorded as a tag

### Requirement: Tag tree and counts

`GET /api/tags` SHALL return a tree of tag paths with direct note counts and subtree counts. Prefix filtering SHALL be supported. The UI SHALL show a collapsible tag tree with counts and an "Untagged" entry.

#### Scenario: Tag tree counts

- **WHEN** two notes use `#project/local-keep` and one uses `#project/other`
- **THEN** `project` has subtree count 3
- **AND** `project/local-keep` has direct count 2

### Requirement: Tag filtering

Note list and search SHALL accept a `tag` filter. By default it SHALL include descendants (`#project` matches `#project/local-keep`); `exactTag=1` SHALL restrict to the exact tag. Selecting a tag in the sidebar SHALL filter the gallery and show a removable breadcrumb.

#### Scenario: Filter by parent tag

- **WHEN** the user selects `#project`
- **THEN** notes tagged `#project` or any `#project/...` child are shown
- **AND** selecting the exact-only mode shows only exact `#project` notes

### Requirement: Tags on notes

Note list/get responses SHALL include the note's current tags. Cards SHALL render tag chips; clicking a chip SHALL apply the tag filter. The editor MAY show the current tags.

#### Scenario: Card tag chip

- **WHEN** a note has `#project/local-keep`
- **THEN** its card shows a `#project/local-keep` chip
- **AND** clicking it filters the gallery

### Requirement: Tag rebuild on revision

Tags SHALL describe the current head. When a revision moves the head, the system SHALL rebuild that note's inline tags. Branch revisions that do not move the head SHALL NOT change the head's tags.

#### Scenario: Edit adds a tag

- **WHEN** a user saves a revision that adds `#project/new`
- **THEN** the head's tags include `#project/new`
- **AND** the tag tree counts include it

#### Scenario: Branch does not change head tags

- **WHEN** a stale save is kept as a branch with a new tag
- **THEN** the head's tags remain unchanged
- **AND** the branch content is still readable in history

### Requirement: Tag migration

A versioned migration SHALL create tag tables and backfill existing notes from their head content and canvas text. The migration MUST be idempotent and MUST run after the note-thread migration.

#### Scenario: Backfill existing tags

- **WHEN** the migration runs on an existing database containing `#tag`
- **THEN** `note_tags` contains the parsed entries
- **AND** re-running the migration creates no duplicates
