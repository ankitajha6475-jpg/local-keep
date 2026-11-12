## MODIFIED Requirements

### Requirement: Whiteboard title persistence

A whiteboard title edit SHALL be sent to the server and committed through the same note/revision service as other edits. The commit MUST use the current head as its base and MUST update the head title, gallery card, and other open whiteboard editors.

The title field SHALL NOT swallow a keystroke that belongs to an IME. Enter SHALL stand down during a composition so the IME can confirm its candidate.

#### Scenario: Edit and leave the title

- **WHEN** the user edits the whiteboard title and blurs the field, presses Enter, or leaves the whiteboard
- **THEN** the server commits the title as a revision
- **AND** the gallery and other open editors show the new title

#### Scenario: Another editor changes the title

- **WHEN** another client changes the title of the open whiteboard
- **THEN** this editor receives `title-updated`
- **AND** the local title field reflects the new value

#### Scenario: Reopen the whiteboard

- **WHEN** a whiteboard with a saved title is reopened
- **THEN** the initial snapshot contains the saved title
- **AND** the editor does not fall back to an empty title

#### Scenario: Enter confirms the IME candidate

- **WHEN** the user presses Enter while an IME is composing the whiteboard title
- **THEN** the IME confirms the candidate instead of the keypress being swallowed
- **AND** the committed title contains the confirmed characters
