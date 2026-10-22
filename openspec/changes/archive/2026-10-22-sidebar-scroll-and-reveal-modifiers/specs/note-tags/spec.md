# Note Tags (delta)

## ADDED Requirements

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
