# note-metadata Specification

## Purpose
Gives every note a typed properties section (an Obsidian-style YAML fence) that is structurally separate from its body, so metadata is editable, queryable, and versioned with the file while the body stays pure markdown.

## Requirements

### Requirement: Properties section format

A text note's canonical content SHALL be a properties section followed by a body: exactly one leading fence of `---`, property lines, `---`, then the body. The fence MUST be the first bytes of the content. The renderer, editor, and search inputs MUST treat everything after the closing fence as the body and never parse metadata from body text.

#### Scenario: Fence is stripped before rendering

- **WHEN** a note's content begins with a fence declaring `tags: [project/alpha]` followed by `# Heading`
- **THEN** the rendered output contains the heading and no fence text
- **AND** `# Heading` renders as an `h1`, never as a tag

#### Scenario: A note without a fence renders as-is

- **WHEN** content has no leading fence
- **THEN** the entire content is the body
- **AND** no properties are shown

### Requirement: Strict YAML subset

The properties section SHALL use a strict, one-scalar-per-line YAML subset: `key: value` per line, flow-style lists of scalars on one line, key order preserved, no comments, no anchors or aliases, no type tags, no block scalars, and no nested mappings. Values that look like booleans, numbers, dates, or colours SHALL be written quoted. Parsing a section the system wrote and re-serialising it MUST be byte-identical.

#### Scenario: Ambiguous scalars round-trip unchanged

- **WHEN** a property value is `no`, `2026-11-01`, `3.0`, or `#e2ece4`
- **THEN** the stored section quotes it
- **AND** a parse-and-reserialise cycle reproduces the original bytes exactly

#### Scenario: Unknown keys survive

- **WHEN** a note carries a property key the application does not define
- **THEN** the key and its value are preserved on every re-serialisation
- **AND** the panel may display it read-only or as a text field

#### Scenario: Invalid fence is rejected

- **WHEN** a fence contains an anchor, a block scalar, or a nested mapping
- **THEN** the system refuses to parse it as properties
- **AND** reports a validation error naming the offending line

### Requirement: Property value typing

Property values SHALL infer their type from the literal: unquoted text is text, quoted digits or decimals are text, a date-shaped string is a date, `true`/`false` is a checkbox, a flow list is a list, and a `[[Note]]` or `[[note:<id>]]` value is a link. The properties panel SHALL render the matching control for each type.

#### Scenario: Date property

- **WHEN** a property value is a date
- **THEN** the panel shows a date picker
- **AND** editing it writes a quoted date string

#### Scenario: List property

- **WHEN** a property value is `[a, b]`
- **THEN** the panel shows chip editing
- **AND** saving preserves one-line flow style

### Requirement: System and user properties

The properties panel SHALL present system properties (`tags`, `aliases`) with their dedicated controls and user properties with typed controls. The title SHALL appear as a first-class panel row even though it is not a fence key. `color` SHALL appear under a separate Presentation heading and MUST NOT be written into the fence. Unknown user keys SHALL be preserved.

#### Scenario: Title edits in the panel

- **WHEN** the user edits the title row in the properties panel
- **THEN** the note's title changes
- **AND** no fence key `title` is written

#### Scenario: Color is presentation, not a property

- **WHEN** the user sets the color from the properties panel
- **THEN** the tint is stored as head metadata
- **AND** the fence is unchanged

### Requirement: Property queries

The system SHALL expose a shadow index of property key, value, type, and numeric projection per note, and SHALL support filtering notes by property equality and numeric/date comparison. The index MUST be rebuilt from the fence whenever the head moves.

#### Scenario: Filter by property

- **WHEN** a client requests notes where `status` is `active`
- **THEN** only notes whose fence declares `status: active` are returned

#### Scenario: Index follows the head

- **WHEN** a note's fence changes `status` from `active` to `done`
- **THEN** the shadow index reflects the new value
- **AND** a branch revision that does not move the head does not change the index

### Requirement: Property changes are revisions

Every change to the fence SHALL create a revision whose `source` is `property`. Consecutive property revisions that share the same message SHALL be presentable as one grouped history entry. Body and fence changes follow the same revision rule; there is no metadata exemption.

#### Scenario: Tag edit creates a revision

- **WHEN** a property edit changes only the `tags` list
- **THEN** a new revision is appended with `source: property`
- **AND** the revision content contains the updated fence

#### Scenario: Grouped history entry

- **WHEN** a tag rename touches ten notes with the same message
- **THEN** the history UI presents one collapsible entry
- **AND** each note's revision remains individually readable

### Requirement: Import compatibility

When a pasted or imported note carries a `title` fence key, the system SHALL fold it into the note title when the title is empty and MUST NOT write a `title` key back on serialisation. When a fence contains a `color` key, the system SHALL apply it as head tint metadata and MUST NOT re-emit it.

#### Scenario: Imported title key

- **WHEN** content includes `title: Q3 Plan` in the fence and the note has no title
- **THEN** the note title becomes `Q3 Plan`
- **AND** the next serialisation omits `title`
