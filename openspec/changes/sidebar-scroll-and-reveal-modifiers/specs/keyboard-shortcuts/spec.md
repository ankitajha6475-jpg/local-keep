# Keyboard Shortcuts (delta)

## MODIFIED Requirements

### Requirement: Shortcut hints on Alt and Ctrl/Cmd

The workspace SHALL reveal shortcut hints while **Alt/Option only** is held;
Ctrl/Cmd and Shift alone SHALL NOT trigger the reveal. The app SHALL intercept
the bare Alt keydown/keyup at window level (`preventDefault`) so the browser
(e.g. Chrome's menu-bar focus) does not act on it. Releasing Alt or blurring the
window SHALL hide the hints. Pointer events carrying Alt SHALL also reveal them
when a modifier keydown is missed. Shortcuts that combine Ctrl/Cmd+Alt (such as
`Ctrl+Alt+V`) SHALL keep working because only bare Alt presses are intercepted.
Hints SHALL be shown only for actions that declare an actual shortcut.

#### Scenario: Reveal with Ctrl

- **WHEN** the user holds Ctrl on Linux/Windows or Cmd on macOS without Alt
- **THEN** shortcut hints are not revealed
- **AND** no bare-Alt interception interferes with Ctrl/Cmd shortcuts

#### Scenario: Reveal with Alt

- **WHEN** the user holds Alt/Option
- **THEN** the same shortcut hints are revealed
- **AND** releasing Alt hides the hints

#### Scenario: Bare Alt is intercepted

- **WHEN** the user presses and releases Alt with no other key
- **THEN** the event is prevented so the browser does not focus its menu bar
- **AND** the hints reveal while held and hide on release

#### Scenario: Ctrl+Alt combos still dispatch

- **WHEN** the user presses `Ctrl+Alt+V` while editing
- **THEN** the Visual-mode shortcut fires normally

#### Scenario: No unhandled hints

- **WHEN** an action has no keyboard binding
- **THEN** it does not advertise a shortcut
