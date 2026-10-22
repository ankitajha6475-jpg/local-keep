# Dashboard Chrome (delta)

## MODIFIED Requirements

### Requirement: Dashboard shortcut hints

Dashboard actions SHALL use the same reveal behavior as the note editor
toolbar: while **Alt/Option only** is held, every action that has a keyboard
shortcut SHALL show that shortcut in its tooltip, even when the pointer is not
over it. Ctrl/Cmd alone SHALL NOT reveal the hints. The app SHALL intercept bare
Alt keydown/keyup so the browser does not act on it. Without Alt/Option, hovering
or focusing an action SHALL show its action name. Actions without a shortcut
SHALL keep showing their action name while Alt/Option is held. Releasing
Alt/Option SHALL restore action-name tooltips. If the browser misses the Alt
keydown, a pointer event with Alt held SHALL still reveal the hints. The Quick
Shortcuts card SHALL document the hold-Alt behavior.

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

- **WHEN** the browser does not deliver an Alt/Option keydown but a pointer event arrives with Alt held
- **THEN** the dashboard still reveals the shortcut hints
