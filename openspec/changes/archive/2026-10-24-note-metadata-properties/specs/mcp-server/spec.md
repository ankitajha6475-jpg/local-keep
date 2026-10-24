# MCP Server — Delta

## MODIFIED Requirements

### Requirement: Relationship and tag tools

Tag tools SHALL mutate the note's `tags` property rather than rewriting body text. `add_tags` and `remove_tags` SHALL accept multiple note ids and a `dry_run` preview, SHALL use the shared tag helpers for exact-path semantics, SHALL reject archived notes with `note_archived`, and SHALL create one revision per changed note with `source: property`. The tool list SHALL remain stable and registered at all times.

#### Scenario: Add tags as a property edit

- **WHEN** an MCP client adds `project/alpha` to a note
- **THEN** the fence's `tags` list gains the entry
- **AND** one revision is appended with `source: property`
- **AND** the body is unchanged

#### Scenario: Dry run preview

- **WHEN** `add_tags` is called with `dry_run: true`
- **THEN** the response reports the tags that would change
- **AND** no revision is created

#### Scenario: Backlinks over MCP

- **WHEN** note A is linked from note B and a client requests A's backlinks
- **THEN** B is returned with its title/type/context

#### Scenario: Tag tree over MCP

- **WHEN** a client lists tags
- **THEN** the tree includes hierarchical paths and counts

#### Scenario: Archived note rejected

- **WHEN** `add_tags` targets an archived note
- **THEN** the result is `note_archived`
- **AND** no content or metadata is modified

## ADDED Requirements

### Requirement: Property mutation tools

The MCP surface SHALL expose structured property access: `get_note` SHALL return a `meta` map alongside body-only content, `include_frontmatter: true` SHALL return the raw file, and a property mutation entry point SHALL set, replace, or remove property keys. Property mutations SHALL create a revision with `source: property`, SHALL respect the deletion mask and archived rules, and SHALL broadcast the change to open browsers.

#### Scenario: Read structured properties

- **WHEN** a client calls `get_note`
- **THEN** the response carries `meta` with the parsed properties
- **AND** `content` is body-only

#### Scenario: Raw file on request

- **WHEN** a client calls `get_note` with `include_frontmatter: true`
- **THEN** the response contains the full fence-then-body text

#### Scenario: Set a property

- **WHEN** a client sets `status` to `done`
- **THEN** the fence declares `status: done`
- **AND** one revision is appended with `source: property`

### Requirement: Property queries over MCP

Search and list tools SHALL support filtering by property key and value in addition to the existing tag and text filters, using the same equality and comparison semantics as the REST surface.

#### Scenario: Filter by property

- **WHEN** a client searches notes where `status` is `active`
- **THEN** only notes declaring that property value are returned
