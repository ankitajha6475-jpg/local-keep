## MODIFIED Requirements

### Requirement: Scoped shortcut dispatch

Shortcut dispatch SHALL target only the topmost visible overlay when one is open.
Background dashboard buttons MUST NOT be activated through their shortcuts while
a dialog or overlay is present. If focus is inside a form, a matching submit
button in that form SHALL take precedence over another form's button in the same
modal.

The topmost overlay SHALL be resolved from the workspace's explicit overlay
stack, not from the order of the overlay elements in the document. An overlay
that does not block the page SHALL NOT take over the shortcut layer.

#### Scenario: Modal isolation

- **WHEN** an admin dialog is open and the user presses `R`
- **THEN** the dashboard refresh button is not clicked

#### Scenario: Focused form

- **WHEN** focus is in one of two MCP forms and the user presses `Ctrl/Cmd+Enter`
- **THEN** the submit button of that form runs

#### Scenario: The topmost overlay wins

- **WHEN** two blocking overlays are open, one above the other
- **THEN** only the upper one's controls receive the shortcut
- **AND** the lower one's controls are not activated

### Requirement: Overlay close and primary submit

`Esc` SHALL close the topmost visible overlay before closing the underlying note
editor. `Ctrl/Cmd+Enter` SHALL submit the focused form or activate the primary
button in the active layer. Existing confirmation Enter/Escape behavior SHALL
remain.

`Esc` SHALL be handled by the platform for a native dialog, not by the
workspace's global key handler. The workspace SHALL NOT open a destructive
action's confirmation from a global `Enter` keypress; a confirmation's action
SHALL run only from its own control, or from the shortcut bound to that
control.

#### Scenario: Close nested history

- **WHEN** the revision history overlay is open above the note editor and the user presses Escape
- **THEN** the history overlay closes and the note editor remains open

#### Scenario: Submit a dialog

- **WHEN** focus is in a dialog form and the user presses `Ctrl/Cmd+Enter`
- **THEN** that form's primary action runs

#### Scenario: Escape does not reach the workspace handler

- **WHEN** a native dialog is open and the user presses Escape
- **THEN** the dialog closes
- **AND** the workspace's global Escape handling does not also run

#### Scenario: A destructive action is not confirmed by a stray Enter

- **WHEN** the archive confirmation is open and the user presses Enter with focus outside the confirmation
- **THEN** the confirmation is not submitted
- **AND** only the confirmation's own control archives the note
