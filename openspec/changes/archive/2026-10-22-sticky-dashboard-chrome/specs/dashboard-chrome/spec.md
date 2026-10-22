## ADDED Requirements

### Requirement: Pinned dashboard header

The authenticated gallery SHALL keep its header pinned to the top of the viewport while the note list scrolls. The header SHALL remain above the gallery content and above the pinned action bars.

#### Scenario: Scroll a long note list

- **WHEN** the user scrolls down through the gallery
- **THEN** the header stays visible at the top of the viewport
- **AND** note cards scroll underneath it

### Requirement: Pinned gallery action bar

The gallery SHALL pin the active action bar directly beneath the header while the note list scrolls. When no notes are selected, the control bar SHALL remain visible with the note count and sort controls. When one or more notes are selected, the selection bar SHALL occupy the same pinned slot with the selection count and actions. The header and action bar SHALL NOT overlap each other, and their offsets SHALL follow the measured header height so responsive padding and header reflows keep the bar flush beneath the header.

#### Scenario: Control bar while scrolling

- **WHEN** no notes are selected and the user scrolls the gallery
- **THEN** the control bar stays visible directly below the header

#### Scenario: Selection bar while scrolling

- **WHEN** notes are selected and the user scrolls the gallery
- **THEN** the selection bar stays visible directly below the header
- **AND** the control bar is replaced rather than stacked

#### Scenario: Responsive header

- **WHEN** the viewport narrows and the header padding or height changes
- **THEN** the action bar remains flush beneath the header
- **AND** the note list remains scrollable past both

### Requirement: Dashboard shortcut hints

Dashboard actions SHALL use the same Alt/Option reveal behavior as the note editor toolbar. While Alt/Option is held, every action that has a keyboard shortcut SHALL show that shortcut in its tooltip, even when the pointer is not over it. Without Alt/Option, hovering or focusing an action SHALL show its action name. Actions without a shortcut SHALL keep showing their action name while Alt/Option is held. Releasing Alt/Option SHALL restore action-name tooltips. If the browser misses the Alt keydown, a pointer event with the modifier held SHALL still reveal the hints. The Quick Shortcuts card SHALL document the hold-Alt behavior.

#### Scenario: Reveal shortcuts without hovering

- **WHEN** the user holds Alt/Option on the dashboard
- **THEN** Search shows the platform search shortcut (`Ctrl+I` or `Cmd+I`)
- **AND** the create button shows `Ctrl+Enter` or `Cmd+Enter`
- **AND** the hints are visible without moving the pointer over those actions

#### Scenario: Action without a shortcut

- **WHEN** the user holds Alt/Option and hovers the Refresh action
- **THEN** the tooltip keeps showing `Refresh notes`

#### Scenario: Restore normal labels

- **WHEN** the user releases Alt/Option
- **THEN** the shortcut hints disappear
- **AND** hovering an action shows its action name again

#### Scenario: Missed modifier keydown

- **WHEN** the browser does not deliver an Alt/Option keydown but a pointer event arrives with the modifier held
- **THEN** the dashboard still reveals the shortcut hints

### Requirement: Modern dashboard icon controls

The dashboard header SHALL render its actions and sync state with the shared inline SVG icon set and text labels rather than emoji or font-dependent glyphs. Header controls SHALL expose accessible names and SHALL remain usable at small viewport widths without horizontal overflow.

#### Scenario: Header actions are labelled

- **WHEN** a screen reader or keyboard user focuses a header icon action
- **THEN** the action exposes its accessible name
- **AND** the visual tooltip shows the same name

#### Scenario: Narrow phone width

- **WHEN** the viewport is narrow
- **THEN** the account name and sync label collapse before the icon actions overflow
- **AND** the brand mark and icon buttons remain visible
