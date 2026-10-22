## ADDED Requirements

### Requirement: Config-file interface defaults

The server SHALL load interface defaults from a JSON config file at `LOCAL_KEEP_CONFIG` or `config.json` in the working directory. Missing files SHALL fall back to built-in defaults. Malformed files SHALL fall back to built-in defaults and expose the parse error to admins. Config-file values SHALL be clamped to the same bounds as runtime values.

The note editor default width SHALL be 960px unless configured otherwise.

#### Scenario: Load file defaults

- **WHEN** `config.json` sets `ui.noteModalWidth` to 1100
- **THEN** authenticated clients receive 1100 from `GET /api/config`

#### Scenario: Invalid config file

- **WHEN** the config file contains invalid JSON
- **THEN** the server uses built-in defaults
- **AND** the admin config response reports the file error

### Requirement: Runtime interface overrides

Admins SHALL be able to update and reset interface dimensions at runtime. Overrides SHALL be persisted in `app_settings`, validated against integer bounds, and merged over file defaults. Non-admin users SHALL NOT be able to mutate them. Reset SHALL delete runtime overrides and restore file defaults.

#### Scenario: Save a runtime override

- **WHEN** an admin sets the note editor width to 1200
- **THEN** subsequent `GET /api/config` responses return 1200
- **AND** open clients receive the new value over WebSocket

#### Scenario: Reject an invalid value

- **WHEN** an admin submits a width outside the allowed range
- **THEN** the request fails with 400
- **AND** the previous value remains effective

#### Scenario: Reset overrides

- **WHEN** an admin resets runtime settings
- **THEN** the effective values return to the config file defaults

### Requirement: Live-applied UI dimensions

The client SHALL apply effective dimensions as CSS variables for the note editor modal, link dialog, relationship graph, and selection-links panel. Values SHALL remain viewport-capped so extreme settings do not overflow small screens. The admin Interface dialog SHALL expose all configurable dimensions with their bounds.

#### Scenario: Widen the note editor

- **WHEN** the effective `noteModalWidth` is 960
- **THEN** the note editor opens at `min(960px, 94vw)`
- **AND** a narrower screen still constrains the modal to the viewport

#### Scenario: Apply without reload

- **WHEN** an admin saves a new graph width
- **THEN** already-open clients update the graph panel size without a page reload
