## MODIFIED Requirements

### Requirement: Dashboard color picker

The dashboard SHALL show a color picker immediately to the right of each normal note's selection checkbox. The picker SHALL offer Default plus the six palette tints, show the current selection, expose accessible labels, and apply changes optimistically with rollback and a notice on failure. The picker SHALL close on outside click and Escape.

The picker SHALL be a popover, and its swatches SHALL be toggle buttons inside a labelled group that report their pressed state. The picker SHALL NOT declare `role="menu"`.

#### Scenario: Choose a tint

- **WHEN** the user opens the card palette and selects Amber
- **THEN** the card immediately uses the amber surface, border, and accent
- **AND** the palette icon reflects amber
- **AND** the selection is persisted through the color endpoint

#### Scenario: Dismiss the palette

- **WHEN** the palette is open and the user clicks elsewhere or presses Escape
- **THEN** the palette closes without changing the color

#### Scenario: Failed update

- **WHEN** the color request fails
- **THEN** the card returns to its previous tint
- **AND** a notice explains the failure

#### Scenario: The swatch reports its state

- **WHEN** the note's tint is amber
- **THEN** the amber swatch reports that it is pressed
- **AND** the other swatches report that they are not
