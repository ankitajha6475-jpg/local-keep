## MODIFIED Requirements

### Requirement: Typing-safe shortcuts

Plain-key shortcuts SHALL NOT run while focus is in an input, textarea, select,
or contenteditable region. Modifier shortcuts SHALL remain available while
editing. Shortcut handling SHALL ignore IME composition.

Handlers bound to `Enter` or `Escape` SHALL also stand down while an IME owns
the keystroke, so confirming or cancelling a candidate never commits a value or
closes an overlay. `Ctrl/Cmd+Enter` SHALL remain available during composition.

#### Scenario: Typing a letter

- **WHEN** a search or note input has focus and the user types `r`
- **THEN** the character is entered and notes are not refreshed

#### Scenario: Editor modifier shortcut

- **WHEN** the note editor has focus and the user presses `Ctrl/Cmd+Alt+D`
- **THEN** the Draft action runs

#### Scenario: Enter during composition does not confirm a dialog

- **WHEN** the unsaved-changes dialog is open and the user presses Enter while an IME is composing text in the editor behind it
- **THEN** the IME confirms the candidate
- **AND** the dialog does not save and close the editor

#### Scenario: Escape during composition does not close an overlay

- **WHEN** the user presses Escape while an IME is composing text in the search field
- **THEN** the IME cancels the candidate
- **AND** the search field stays open
