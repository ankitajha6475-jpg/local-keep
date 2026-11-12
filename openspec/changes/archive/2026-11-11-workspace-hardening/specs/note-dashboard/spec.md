## ADDED Requirements

### Requirement: Off-screen card bodies skip rendering

The dashboard card body SHALL use `content-visibility: auto` so that a card
that is off-screen skips layout and painting, and SHALL declare a
`contain-intrinsic-size` so the reserved space stays stable.

The card's height SHALL NOT depend on the card body's contents, so skipping
the body SHALL NOT change the row height that the virtual scroller relies on.

Skipped content SHALL remain focusable, selectable, and exposed to assistive
technology. An absolutely positioned element inside the card body SHALL have
a positioned ancestor outside the card body, so that paint containment does
not change what it is anchored to.

#### Scenario: An off-screen card is not painted

- **WHEN** a card is outside the viewport
- **THEN** its body skips layout and painting
- **AND** the card keeps its fixed height
- **AND** the virtual list keeps its stable row height

#### Scenario: A skipped card body stays reachable

- **WHEN** a card body is skipped
- **THEN** the controls inside it remain focusable
- **AND** the card body remains in the accessibility tree

#### Scenario: The presence dot does not move

- **WHEN** a card body is skipped and later revealed
- **THEN** the presence indicator stays anchored to the card, not to the card body

## MODIFIED Requirements

### Requirement: Virtualized responsive rows

The dashboard SHALL render notes in rows sized to the measured column count and SHALL mount only the visible rows plus a fixed render buffer. Each row SHALL have a fixed height equal to the card height plus the grid gap. The column count SHALL be derived from the container width and the minimum card width. Quick Shortcuts, Drafts, archived notes, note colors, presence, and card actions SHALL render through the same card component.

The workspace SHALL be a size query container, and the dashboard layout decisions that depend on the available width SHALL be measured against that container rather than the viewport. The tag sidebar's stacking breakpoint and the workspace's own stacking rule SHALL use the same container and the same threshold, so they cannot drift apart.

#### Scenario: Resize

- **WHEN** the dashboard width crosses a column breakpoint
- **THEN** the row chunking and column count update
- **AND** the virtual list keeps a stable row height

#### Scenario: Long library

- **WHEN** the dashboard has thousands of notes
- **THEN** the DOM contains only the buffered row range
- **AND** scrolling mounts and unmounts rows

#### Scenario: Quick Shortcuts and drafts

- **WHEN** the Notes tab shows Quick Shortcuts or the Drafts tab shows draft cards
- **THEN** both are included in the virtual item ordering
- **AND** they keep their read-only controls

#### Scenario: The workspace narrows

- **WHEN** the workspace's content box becomes narrower than the stacking threshold
- **THEN** the tag sidebar stacks above the notes area
- **AND** the decision is the same whether the viewport narrowed or the workspace did
