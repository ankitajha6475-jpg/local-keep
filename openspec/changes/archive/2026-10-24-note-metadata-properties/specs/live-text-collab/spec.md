# Live Text Collaboration — Delta

## MODIFIED Requirements

### Requirement: Shared live text draft

Each note SHALL have one shared live draft document. The body SHALL be bound as a text type and properties SHALL be bound as a map type, so concurrent property edits and body edits never interleave in one sequence. The serialized fence MUST NOT appear in the shared body text; it SHALL be assembled at commit time from the properties map. Draft comparison against the head SHALL consider the body and the properties map, and a clean draft MUST NOT be reported as changed merely because a property moved.

#### Scenario: Two clients edit the same note

- **WHEN** two clients have the same text note open and both type
- **THEN** both editors converge to the same body and title
- **AND** the head note and revision history remain unchanged until an explicit save

#### Scenario: Reconnect restores the draft

- **WHEN** a client reconnects to a note that has a persisted live draft
- **THEN** it receives the current draft and the server state vector
- **AND** it sends any local-only updates after applying the snapshot

#### Scenario: Concurrent property and body edits

- **WHEN** one client edits the body while another changes a tag
- **THEN** both edits merge without corruption
- **AND** no fence text appears in either client's body editor

#### Scenario: Draft detection is body-and-properties aware

- **WHEN** a draft's body matches the head but its properties differ
- **THEN** the draft is reported as changed
- **AND** when both match, it is reported as clean
