## MODIFIED Requirements

### Requirement: System and user properties

The properties panel SHALL present system properties (`tags`, `aliases`) with their dedicated controls and user properties with typed controls. The title SHALL appear as a first-class panel row even though it is not a fence key. `color` SHALL appear under a separate Presentation heading and MUST NOT be written into the fence. Unknown user keys SHALL be preserved.

No property key SHALL be added while an IME owns the keystroke. Enter SHALL stand down during a composition so the IME can confirm its candidate.

#### Scenario: Title edits in the panel

- **WHEN** the user edits the title row in the properties panel
- **THEN** the note's title changes
- **AND** no fence key `title` is written

#### Scenario: Color is presentation, not a property

- **WHEN** the user sets the color from the properties panel
- **THEN** the tint is stored as head metadata
- **AND** the fence is unchanged

#### Scenario: Add a property key during IME composition

- **WHEN** the user presses Enter while an IME is composing a property name
- **THEN** the IME confirms the candidate
- **AND** no property key is added
