## ADDED Requirements

### Requirement: Blocking overlays are native dialogs

Every overlay that interrupts the user and blocks the page SHALL be a native
`<dialog>` element opened with `showModal()`. The platform SHALL provide
focus containment, background inertness, top-layer rendering, `Esc`
dismissal, and focus return to the invoker.

An overlay SHALL NOT declare `role="dialog"` or `aria-modal`, SHALL NOT
toggle `inert` on the background, SHALL NOT implement a focus trap, and
SHALL NOT implement its own `Escape` handler.

Every dialog SHALL be named with `aria-labelledby` pointing at its heading.
The primary control, or the first field, SHALL carry `autofocus`. In a
destructive confirmation, `autofocus` SHALL be on the safe action.

#### Scenario: Tab is contained

- **WHEN** the note editor is open and the user presses Tab repeatedly
- **THEN** focus stays within the editor
- **AND** the dashboard behind it is not reachable

#### Scenario: Focus returns to the invoker

- **WHEN** the note editor is closed
- **THEN** focus returns to the dashboard card that opened it

#### Scenario: Escape closes the topmost dialog

- **WHEN** the user presses Escape while a dialog is open
- **THEN** that dialog closes
- **AND** an underlying dialog stays open

#### Scenario: The dialog is named

- **WHEN** a screen reader opens a dialog
- **THEN** the dialog announces its heading as its accessible name

#### Scenario: The background is inert

- **WHEN** a dialog is open
- **THEN** the content behind it is not in the accessibility tree
- **AND** it cannot be focused or clicked

### Requirement: Overlays resolve their order from an explicit stack

The workspace SHALL keep an explicit stack of the open overlays, so that
"the topmost overlay" is known even though the top layer does not follow
DOM order. Shortcut dispatch SHALL target the overlay at the top of that
stack, and SHALL NOT use DOM order to decide which overlay is on top.

#### Scenario: A nested dialog is on top

- **WHEN** the link dialog is open above the note editor
- **THEN** the link dialog's controls receive the workspace shortcuts
- **AND** the editor's controls do not

#### Scenario: The stack empties

- **WHEN** every overlay is closed
- **THEN** the stack is empty
- **AND** the dashboard's own shortcuts are dispatched again

### Requirement: Menus do not claim menu semantics they do not implement

A menu, dropdown, or palette SHALL NOT declare `role="menu"` unless it
implements the menu keyboard pattern: arrow-key navigation, a roving
`tabindex`, `Home` and `End`, `Escape` to close, and focus moving into the
menu. A palette of exclusive choices SHALL use toggle buttons that report
their pressed state inside a labelled group, and the control that opens it
SHALL report its expanded state.

A menu MAY use the `popover` attribute when it can be anchored to its
trigger. It SHALL NOT use it when the menu cannot be anchored, because an
unanchored popover is centred on the viewport.

#### Scenario: The account menu announces itself as a group of actions

- **WHEN** a screen reader opens the account menu
- **THEN** the menu's controls are announced as ordinary buttons
- **AND** the menu is not announced as an application menu
- **AND** the button that opened it reports that it is expanded

#### Scenario: A colour swatch reports its state

- **WHEN** the note's colour is amber
- **THEN** the amber swatch reports that it is pressed
- **AND** the palette is a labelled group of those swatches

### Requirement: The dashboard view switcher is a tablist

The dashboard's view switcher SHALL implement the ARIA tab pattern. The
selected tab SHALL have `tabindex="0"` and the others `tabindex="-1"`.
`Left` and `Right` SHALL move between tabs and select them, and `Home` and
`End` SHALL move to the first and last tab. Each tab SHALL reference its
panel with `aria-controls`, and the panel SHALL be a `role="tabpanel"`
labelled by its tab.

#### Scenario: Arrow keys move between tabs

- **WHEN** the Notes tab is selected and the user presses ArrowRight
- **THEN** the Archived tab becomes selected
- **AND** focus follows the selection

#### Scenario: The panel is labelled

- **WHEN** a screen reader reaches the notes panel
- **THEN** the panel announces the name of the tab that controls it
