## MODIFIED Requirements

### Requirement: MCP authentication and tokens

MCP requests MUST be authenticated by a bearer token (`Authorization: Bearer lk_mcp_...`) or a valid session cookie. Tokens SHALL be stored as SHA-256 hashes with a name, scopes, creation time, last-used time, expiry, creator, and revocation time. The raw token SHALL be shown once at creation. The token name MUST become the revision actor `mcp:<name>`. No anonymous MCP access SHALL be allowed. Scopes SHALL be `read`, `write`, or `admin`; `admin` implies the others. Only a human admin session may mint another admin token; admin-scoped tokens MAY manage client tokens and admin configuration but MUST NOT mint admin tokens.

#### Scenario: Create and use a token

- **WHEN** a user creates an MCP token named `Claude`
- **THEN** the raw token is returned once
- **AND** an MCP call with that token succeeds
- **AND** revisions created by it have actor `mcp:Claude`

#### Scenario: Revoked token

- **WHEN** a token is revoked and then used
- **THEN** the request is rejected with an auth error

#### Scenario: Scope enforcement

- **WHEN** a read-only token calls a write tool or opens a write session
- **THEN** the request is rejected as forbidden
- **AND** the error guide tells the agent to use a read session or ask an admin for write scope

#### Scenario: Admin token boundary

- **WHEN** an admin-scoped MCP token attempts to create another admin token
- **THEN** the request is rejected with `admin_token_requires_human`
- **AND** the same token may still manage client tokens and configuration

### Requirement: Token management and stdio adapter

The system SHALL provide token create/list/revoke via REST, CLI, and the admin UI. The admin UI SHALL expose token management only in the account menu. It SHALL list token name, scopes, creator, creation time, expiry, last use, and revocation state; raw secrets MUST NOT be recoverable after creation. The UI SHALL also expose admin-configurable MCP session limits. It SHOULD provide a `mcp-stdio.js` adapter for stdio-only hosts; the adapter MUST use the same services/permission model (direct DB with WAL or the REST facade).

#### Scenario: Manage tokens

- **WHEN** an admin opens the account menu and chooses MCP access
- **THEN** existing tokens are listed without raw secrets
- **AND** a new token can be created once and copied
- **AND** a token can be revoked

#### Scenario: CLI-created token appears in the UI

- **WHEN** a token is created with the CLI
- **THEN** the admin UI lists it with `createdBy` metadata
- **AND** it can be revoked from the UI

## ADDED Requirements

### Requirement: Stable persistent session tools

The MCP tool catalog SHALL remain stable. `get_note_state` and `note_session` SHALL always be registered; opening or closing a session MUST NOT add or remove tools or require `tools/list_changed`. Session and mutation results SHALL include the current `state`, `allowed_actions`, and a human-readable `guide`. Errors SHALL use the same envelope plus a structured `error.code`.

#### Scenario: Tool list is stable

- **WHEN** a client lists tools before and while a session is open
- **THEN** the tool names and order are unchanged
- **AND** both `get_note_state` and `note_session` are present

#### Scenario: Recovery guide

- **WHEN** an action fails because no session is open or the session mode is wrong
- **THEN** the result includes `ok: false`, `error.code`, current state, allowed actions, and a guide to recover

### Requirement: Per-token write and read leases

Session state SHALL be keyed by MCP token id, not display name. A token SHALL hold up to `max_write_sessions` write sessions (default 5) and `max_read_sessions` read sessions (default 8). At most one session per note/mode SHALL exist. Opening a write on a note with a read session SHALL upgrade it; opening a read on a note with a write session SHALL return that write session with `read_included: true`. Opening another write after the limit SHALL return `too_many_writes`; opening another read after the read limit SHALL return `too_many_reads`.

#### Scenario: Multiple sub-agents share a token

- **WHEN** five write sessions are open on different notes under one token
- **THEN** `state.writes` lists all five
- **AND** a sixth write note is rejected with `too_many_writes`
- **AND** closing one session allows a new note

#### Scenario: Read-to-write upgrade

- **WHEN** a client opens write for a note that has a read session
- **THEN** the read session is replaced by a write session
- **AND** the result reports `upgraded_from_read: true`

### Requirement: State shape and compatibility

`get_note_state` SHALL return `state.writes` as the authoritative list of write sessions, `state.reads` for read sessions, and `state.limits` with `max_write_sessions` and `max_read_sessions`. It SHALL also return `state.write` as the first write session or `null` for older clients. Each session SHALL include its id, mode, note id, base revision id, revision number, version, expiry, and dirty flag.

#### Scenario: Empty state

- **WHEN** a token has no sessions
- **THEN** `state.write` is `null`
- **AND** `state.writes` and `state.reads` are empty arrays
- **AND** `state.limits` reports the active limits

#### Scenario: Multiple writes are visible

- **WHEN** a token has more than one write session
- **THEN** `state.write` is the first opened write session
- **AND** `state.writes` contains every write session

### Requirement: Admin-configurable session limits

Write and read session limits SHALL be stored in SQLite (`mcp_settings`) and editable by an admin in the MCP access dialog. The defaults SHALL be 5 write sessions and 8 read sessions. Changes SHALL apply to newly opened sessions without restarting the server. Limits SHALL be validated as whole numbers between 1 and 64.

#### Scenario: Raise the write limit

- **WHEN** an admin changes the write limit from 5 to 7
- **THEN** new opens use 7
- **AND** existing sessions are not closed
- **AND** `state.limits` reports 7

#### Scenario: Invalid limit

- **WHEN** an admin submits a limit outside 1..64
- **THEN** the API rejects it with `invalid_mcp_limit`
- **AND** the previous limit remains active

### Requirement: Session save and draft semantics

`note_session action=save` SHALL commit with source `mcp-open`, update the shared draft base, and broadcast `text-saved`. One-shot `edit_note`/`append_to_note` SHALL use source `mcp` and MUST NOT move a live draft base. While any write session is open for a token, one-shot edits and appends from that token SHALL be rejected with `active_write_session`.

#### Scenario: Save inside a session

- **WHEN** a write session saves a dirty draft
- **THEN** a revision is created with source `mcp-open`
- **AND** the draft base moves and browsers receive `text-saved`

#### Scenario: One-shot while a write is open

- **WHEN** a client calls `edit_note` while a write session is open
- **THEN** the request is rejected with `active_write_session`
- **AND** the guide lists the open write sessions
