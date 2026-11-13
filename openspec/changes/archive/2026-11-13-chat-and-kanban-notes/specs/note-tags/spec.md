# Note Tags (Delta)

## ADDED Requirements

### Requirement: Universal note tags across all document types

All note types (text, canvas/whiteboard, chat, kanban) SHALL support hierarchical tags. The note header UI across all note types SHALL display tag chips with autocomplete input for adding and removing tags. Modifying tags on any note type SHALL persist the tags to `note_tags` and sync the properties fence in `notes.content`.

#### Scenario: Whiteboard note tag management
- **WHEN** a user adds tag `project/frontend` to a whiteboard note in the editor header
- **THEN** the tag is displayed as a chip in the header
- **AND** the tag is stored in `notes.content` properties and synchronized into `note_tags`
- **AND** the tag tree and tag filter include this whiteboard note under `project/frontend`

#### Scenario: Chat and kanban note tagging
- **WHEN** a user tags a chat room or kanban board
- **THEN** the note is filtered by that tag in the dashboard and sidebar
- **AND** restricted users subject to tag whitelists can only view chat rooms and kanban boards matching their whitelist rules
