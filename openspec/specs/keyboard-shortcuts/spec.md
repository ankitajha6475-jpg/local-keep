# keyboard-shortcuts Specification

## Purpose
Defines the workspace keyboard shortcut system: discoverable hints, complete unique-action coverage, scoped dispatch, typing safety, and topmost-overlay close/submit behavior.

## Requirements

### Requirement: Shortcut hints on Alt and Ctrl/Cmd

The workspace SHALL reveal shortcut hints while Alt/Option **or** Ctrl/Cmd is
held. Releasing the modifier or blurring the window SHALL hide the hints.
Pointer events carrying Alt, Ctrl, or Cmd SHALL also reveal them when a modifier
keydown is missed. Hints SHALL be shown only for actions that declare an actual
shortcut.

#### Scenario: Reveal with Ctrl

- **WHEN** the user holds Ctrl on Linux/Windows or Cmd on macOS
- **THEN** visible action buttons with shortcuts show their key hints
- **AND** releasing the modifier hides the hints

#### Scenario: Reveal with Alt

- **WHEN** the user holds Alt/Option
- **THEN** the same shortcut hints are revealed

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

#### Scenario: Modal isolation

- **WHEN** an admin dialog is open and the user presses `R`
- **THEN** the dashboard refresh button is not clicked

#### Scenario: Focused form

- **WHEN** focus is in one of two MCP forms and the user presses `Ctrl/Cmd+Enter`
- **THEN** the submit button of that form runs

### Requirement: Typing-safe shortcuts

Plain-key shortcuts SHALL NOT run while focus is in an input, textarea, select,
or contenteditable region. Modifier shortcuts SHALL remain available while
editing. Shortcut handling SHALL ignore IME composition.

#### Scenario: Typing a letter

- **WHEN** a search or note input has focus and the user types `r`
- **THEN** the character is entered and notes are not refreshed

#### Scenario: Editor modifier shortcut

- **WHEN** the note editor has focus and the user presses `Ctrl/Cmd+Alt+D`
- **THEN** the Draft action runs

### Requirement: Overlay close and primary submit

`Esc` SHALL close the topmost visible overlay before closing the underlying note
editor. `Ctrl/Cmd+Enter` SHALL submit the focused form or activate the primary
button in the active layer. Existing confirmation Enter/Escape behavior SHALL
remain.

#### Scenario: Close nested history

- **WHEN** the revision history overlay is open above the note editor and the user presses Escape
- **THEN** the history overlay closes and the note editor remains open

#### Scenario: Submit a dialog

- **WHEN** focus is in a dialog form and the user presses `Ctrl/Cmd+Enter`
- **THEN** that form's primary action runs
