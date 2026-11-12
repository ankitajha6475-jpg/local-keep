# input-composition Specification

## Purpose
Defines how the workspace behaves when an input method editor owns the keystroke, so confirming or cancelling a candidate never commits a half-composed value or closes the surface the user is still typing into.

## Requirements

### Requirement: IME-safe key handling

Any control that acts on a keydown event SHALL stand down while an input
method editor owns the keystroke. Composition SHALL be detected with
`event.isComposing`, and additionally with `event.keyCode === 229` for the keys
an IME uses to confirm or cancel a candidate (`Enter`, `Escape`, `Tab`). The
legacy `229` check SHALL NOT be applied to other keys, because soft keyboards
report `229` for ordinary character entry.

A handler that stands down SHALL NOT cancel the keydown's default action, so
the IME can still confirm or cancel its candidate. The default action SHALL be
cancelled only when the handler actually acts on the key.

Keys an IME uses for candidate confirmation or cancellation SHALL NOT trigger
the application's own Enter, Escape, arrow-key, or comma behaviour.

#### Scenario: Enter confirms the IME candidate

- **WHEN** the user presses Enter while a Chinese IME is composing text in the tag input
- **THEN** the IME confirms the candidate
- **AND** the tag is not committed
- **AND** the keydown's default action is not cancelled

#### Scenario: Enter commits outside composition

- **WHEN** the user presses Enter in the tag input with no IME composition active
- **THEN** the tag is committed
- **AND** the keydown's default action is cancelled

#### Scenario: Safari out-of-order composition end

- **WHEN** an Enter keydown reports `isComposing` as false but carries `keyCode` 229
- **THEN** the application treats it as IME-owned
- **AND** the value is not committed

#### Scenario: Escape cancels the candidate, not the overlay

- **WHEN** the user presses Escape while an IME is composing text
- **THEN** the IME cancels the candidate
- **AND** no overlay, dialog, or suggestion list closes

#### Scenario: Arrow keys navigate candidates

- **WHEN** the user presses an arrow key while an IME is composing text
- **THEN** the IME moves between candidates
- **AND** the application's suggestion highlight does not move

#### Scenario: Modifier combinations are exempt

- **WHEN** the user presses `Ctrl/Cmd+Enter` during an IME composition
- **THEN** the composition guard does not treat the keystroke as IME-owned
