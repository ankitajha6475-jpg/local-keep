# keyboard-shortcuts Specification

## Purpose
Defines the workspace keyboard shortcut system: discoverable hints, complete unique-action coverage, scoped dispatch, typing safety, and topmost-overlay close/submit behavior.

## Requirements

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

### Requirement: Complete workspace action coverage

Every unique action button in the workspace chrome, dashboard, note editor,
confirmations, admin dialogs, graph, selection links, backlinks, link dialog, and
tag sidebar SHALL declare a shortcut. Repeated per-row controls SHALL remain
native keyboard-accessible controls and are exempt from global bindings.

#### Scenario: Dashboard action

- **WHEN** the notes dashboard is idle
- **THEN** `T` toggles tags, `R` refreshes notes, `1`/`2`/`3` switch tabs,
  `A` selects all, and `N` opens the create menu

#### Scenario: Editor action

- **WHEN** the note editor is open
- **THEN** `Ctrl/Cmd+Enter` saves, `Ctrl/Cmd+Alt+D` drafts,
  `Ctrl/Cmd+Alt+X` discards, and `Ctrl/Cmd+Alt+V` / `Ctrl/Cmd+Alt+S` select
  Visual / Source mode

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
