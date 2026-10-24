# MCP Server

## Purpose

Exposes Local Keep's notes, revisions, relationships, tags, and whiteboard pages through an embedded MCP server so external agents can search, read, create, edit, and recall them with the same identity and history guarantees as the UI.

## Requirements

### Requirement: Embedded MCP transport

The server SHALL expose an MCP Streamable HTTP endpoint at `/mcp` on the same Express server as the REST/WS API. It SHALL support MCP SDK v2 clients and accept `POST /mcp` with `Accept: application/json, text/event-stream`. The endpoint MUST be mounted before the production static fallback.

#### Scenario: List tools over HTTP

- **WHEN** an authenticated MCP client connects to `/mcp`
- **THEN** `tools/list` returns the Local Keep tool catalog

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

### Requirement: Search and list tools with timestamps

`search_notes` SHALL support text query, tags, tag mode, type, created/updated date bounds, archived inclusion, limit, and offset. Every result MUST include `note_id`, `revision_id`, `title`, `display_title`, `type`, `snippet`, `tags`, `created_at`, `updated_at`, `revision_created_at`, `revision_no`, and score. Whiteboard results SHALL include tile count, render timestamp, and staleness where available. `list_notes` SHALL provide the same summary shape without a query.

#### Scenario: Search returns timestamps

- **WHEN** an MCP client searches for a known term
- **THEN** each hit includes ISO `created_at` and `updated_at` values
- **AND** the result includes the current revision id/number

#### Scenario: Tag-filtered search

- **WHEN** a client searches with `tags: ["project"]`
- **THEN** notes tagged `project` or its descendants are returned unless exact matching is requested

### Requirement: Note read/write tools

`get_note` SHALL return markdown content, metadata, tags, links/backlinks optionally, history optionally, and a whiteboard render summary. `create_note` SHALL create revision 1 and accept tags/related note ids. `edit_note` SHALL create a revision, accept `base_revision_id` and modes `append`/`branch`/`take_head`, and return `notice`, `conflict`, `previous_revision`, and `history_url`. `append_to_note` SHALL append content as a new revision. Editing MUST preserve stable note ids and MUST branch on stale writes by default.

#### Scenario: MCP edit creates a revision

- **WHEN** an MCP client edits note `N` with the current base revision
- **THEN** the note id remains `N`
- **AND** a new revision is created
- **AND** the response includes a notice

#### Scenario: Concurrent MCP edit branches

- **WHEN** an MCP edit uses a stale `base_revision_id`
- **THEN** the edit is kept as a branch by default
- **AND** the head is unchanged
- **AND** the response reports `conflict: true`

### Requirement: Thread tree tool

`get_thread` SHALL return the revision tree with parent ids, revision numbers, timestamps, actor/source, head-chain markers, and the head revision id. It SHALL support a text format for human-readable trees.

#### Scenario: Read a forked thread

- **WHEN** a note has a branch revision
- **THEN** `get_thread` shows both the head chain and the branch
- **AND** the branch is marked off the head chain

### Requirement: Relationship and tag tools

The server SHALL expose `get_links`, `get_backlinks`, `get_graph`, and `list_tags`. Graph results SHALL support note/depth, tag filtering, limits, and unresolved inclusion. Tag results SHALL include the tree with direct/subtree counts and untagged count. Tag tools SHALL mutate the note's `tags` property rather than rewriting body text. `add_tags` and `remove_tags` SHALL accept multiple note ids and a `dry_run` preview, SHALL use the shared tag helpers for exact-path semantics, SHALL reject archived notes with `note_archived`, and SHALL create one revision per changed note with `source: property`. The tool list SHALL remain stable and registered at all times.

#### Scenario: Add tags as a property edit

- **WHEN** an MCP client adds `project/alpha` to a note
- **THEN** the fence's `tags` list gains the entry
- **AND** one revision is appended with `source: property`
- **AND** the body is unchanged

#### Scenario: Dry run preview

- **WHEN** `add_tags` is called with `dry_run: true`
- **THEN** the response reports the tags that would change
- **AND** no revision is created

#### Scenario: Backlinks over MCP

- **WHEN** note A is linked from note B and a client requests A's backlinks
- **THEN** B is returned with its title/type/context

#### Scenario: Tag tree over MCP

- **WHEN** a client lists tags
- **THEN** the tree includes hierarchical paths and counts

#### Scenario: Archived note rejected

- **WHEN** `add_tags` targets an archived note
- **THEN** the result is `note_archived`
- **AND** no content or metadata is modified

### Requirement: Property mutation tools

The MCP surface SHALL expose structured property access: `get_note` SHALL return a `meta` map alongside body-only content, `include_frontmatter: true` SHALL return the raw file, and a property mutation entry point SHALL set, replace, or remove property keys. Property mutations SHALL create a revision with `source: property`, SHALL respect the deletion mask and archived rules, and SHALL broadcast the change to open browsers.

#### Scenario: Read structured properties

- **WHEN** a client calls `get_note`
- **THEN** the response carries `meta` with the parsed properties
- **AND** `content` is body-only

#### Scenario: Raw file on request

- **WHEN** a client calls `get_note` with `include_frontmatter: true`
- **THEN** the response contains the full fence-then-body text

#### Scenario: Set a property

- **WHEN** a client sets `status` to `done`
- **THEN** the fence declares `status: done`
- **AND** one revision is appended with `source: property`

### Requirement: Property queries over MCP

Search and list tools SHALL support filtering by property key and value in addition to the existing tag and text filters, using the same equality and comparison semantics as the REST surface.

#### Scenario: Filter by property

- **WHEN** a client searches notes where `status` is `active`
- **THEN** only notes declaring that property value are returned

### Requirement: Whiteboard page recall

`get_whiteboard` SHALL return the latest ordered page manifest. It SHALL support `images`, `markdown`, `urls`, and `manifest` formats, a max tile count, and `render_if_stale`. In `images` mode it MUST return image content blocks (base64 PNG) in page order plus a text manifest. If no browser is connected and the render is stale, it SHALL return the stale manifest with a clear notice. `request_whiteboard_render` SHALL ask a connected browser to render and wait up to a timeout.

#### Scenario: Recall multiple pages

- **WHEN** a whiteboard has three rendered pages and an MCP client requests images
- **THEN** the result contains page 1, 2, 3 image blocks in order
- **AND** a text manifest lists URLs and timestamps

#### Scenario: Stale/offline whiteboard

- **WHEN** the manifest is stale and no browser is connected
- **THEN** the tool returns the last manifest with `stale: true` and a notice
- **AND** it does not fail

### Requirement: Change feed

`list_changes` SHALL return note/revision lifecycle events since an ISO timestamp, including note id, revision id, type, actor, and timestamp. It SHALL be usable by clients that do not subscribe to resource updates.

#### Scenario: Poll changes

- **WHEN** a client calls `list_changes` with a timestamp
- **THEN** events created after it are returned in chronological order

### Requirement: MCP resources

The server SHALL expose read-only resources for note markdown, revisions, threads, backlinks, tags, and whiteboard page images. Whiteboard page resources SHALL return image blobs.

#### Scenario: Read a note resource

- **WHEN** a client reads `local-keep://notes/<id>`
- **THEN** the current markdown content is returned

#### Scenario: Read a page image

- **WHEN** a client reads `local-keep://whiteboards/<id>/pages/1`
- **THEN** an image blob is returned

### Requirement: Collaboration semantics

MCP writes SHALL use the same services and event bus as REST/WS, emit the same revision/archive events, and update the browser via WebSocket. Browser and MCP clients editing concurrently SHALL branch rather than lose data. The MCP token name SHALL identify the actor in revisions and notices.

#### Scenario: MCP edit visible in browser

- **WHEN** an MCP client edits a note open in the browser
- **THEN** the browser receives a revision notice
- **AND** the editor keeps its note identity and branches on the next save if stale

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

### Requirement: MCP tag administration

The server SHALL expose `add_tags` and `remove_tags` tools. Each SHALL accept one or more `note_ids`, one or more `tags`, an optional `dry_run`, and an optional `commit_mode`/`message`. Tags SHALL be normalised and validated using the shared tag rules. Adding SHALL only add missing tags; removing SHALL remove exact hierarchical matches and SHALL NOT remove a descendant when only the ancestor is requested. Both operations SHALL preserve fenced and inline code, create at most one revision per changed note with source `mcp`, and return compact per-note results containing `added` or `removed`, current `tags`, revision number, and `conflict` without the full content. Archived notes SHALL be skipped with `skipped: "note_archived"` and a restore guide.

#### Scenario: Add tags in bulk

- **WHEN** a client calls `add_tags` for two active notes with `tags: ["project/local"]`
- **THEN** each note receives one new revision
- **AND** each result reports `added: ["project/local"]` and the updated tag list
- **AND** neither result contains the full note body

#### Scenario: Dry run

- **WHEN** a client calls `add_tags` with `dry_run: true`
- **THEN** no revision is created
- **AND** the result reports the tags that would be added

#### Scenario: Hierarchical removal

- **WHEN** a note has `#area` and `#area/project` and the client removes `area`
- **THEN** only `#area` is removed
- **AND** `#area/project` remains

#### Scenario: Code preservation

- **WHEN** a note contains `#tag` inside a fenced code block
- **THEN** adding or removing tags does not change that code block

#### Scenario: Archived note

- **WHEN** a client adds tags to an archived note
- **THEN** the note is skipped with `note_archived`
- **AND** the guide tells the client to restore the note first

### Requirement: Archived cleanup tools

The server SHALL expose `purge_note` and `purge_archived`. Both SHALL permanently delete only archived notes, release image references, remove tags/links/search/embedding rows, emit the purge event, and close affected MCP sessions and drafts. `purge_note` SHALL preview unless `confirm: true` and MAY require `expected_title` to match. `purge_archived` SHALL preview by default; purging all archived notes SHALL require `confirm: true` plus an `expected_count` matching the preview, while an explicit `note_ids` subset SHALL require only confirmation. Active, missing, or still-open write-session cases SHALL fail without deleting anything. Results SHALL be compact summaries.

#### Scenario: Preview a single purge

- **WHEN** a client calls `purge_note` without `confirm`
- **THEN** the note still exists
- **AND** the result reports `mode: "preview"` with the note id, title, and revision number

#### Scenario: Confirm a single purge

- **WHEN** a client calls `purge_note` for an archived note with `confirm: true` and a matching `expected_title`
- **THEN** the note and its revisions are deleted
- **AND** a later `get_note` returns `note_not_found`

#### Scenario: Active note rejected

- **WHEN** a client calls `purge_note` for an active note
- **THEN** the request fails with `note_not_archived`
- **AND** the note is unchanged

#### Scenario: Bulk purge guard

- **WHEN** a client calls `purge_archived` with `confirm: true` but no `expected_count`
- **THEN** the request fails with `expected_count_required`
- **AND** no note is deleted

#### Scenario: Count mismatch

- **WHEN** a client calls `purge_archived` with an `expected_count` that differs from the current archived set
- **THEN** the request fails with `count_mismatch`
- **AND** the error lists the current archived notes
- **AND** no note is deleted

#### Scenario: Explicit subset

- **WHEN** a client calls `purge_archived` with archived `note_ids` and `confirm: true`
- **THEN** only those archived notes are deleted

### Requirement: Archived visibility in list and search

`search_notes` and `list_notes` SHALL include `archived_at` and `is_archived` in every summary. When `include_archived` is false, archived rows SHALL be absent and active rows SHALL report `archived_at: null` and `is_archived: false`. Clients SHALL NOT need to diff the active and all-note lists to identify archived notes.

#### Scenario: Identify an archived row

- **WHEN** a client lists notes with `include_archived: true`
- **THEN** archived rows have a non-null `archived_at` and `is_archived: true`
- **AND** active rows have `archived_at: null` and `is_archived: false`

### Requirement: Compact MCP note payloads

`edit_note`, `append_to_note`, `archive_note`, and `restore_note` SHALL return compact note/revision metadata by default. `include_content: true` SHALL return the full note and revision bodies for edit/append. `get_note` SHALL omit whiteboard `canvasData` and `thumbnail` unless `include_canvas: true`, and SHALL indicate omission with `canvas_omitted: true`. `get_whiteboard` remains the page-recall tool.

#### Scenario: Compact edit

- **WHEN** a client edits a large note without `include_content`
- **THEN** the result includes ids, revision number, tags, and content length
- **AND** it does not include the full note body

#### Scenario: Full edit when requested

- **WHEN** a client passes `include_content: true`
- **THEN** the result includes the full note and revision bodies

#### Scenario: Canvas payloads

- **WHEN** a client calls `get_note` for a whiteboard without `include_canvas`
- **THEN** `canvasData` and `thumbnail` are omitted
- **AND** `canvas_omitted` is true

### Requirement: Archived session errors and append/session fixes

Opening a write or read session on an archived note SHALL fail with `note_archived` and a guide to `restore_note`, distinct from `note_not_found`. `append_to_note` SHALL accept `message`, use it for the revision, and normalise blank lines between the existing content and the addition. `note_session close` SHALL report `draft_kept` from the persisted draft state, so a clean draft cleaned up after save reports `false`.

#### Scenario: Archived session open

- **WHEN** a client opens a write session on an archived note
- **THEN** the error code is `note_archived`
- **AND** the guide mentions restoring the note

#### Scenario: Append message and spacing

- **WHEN** a client appends content with `message` to a note ending in blank lines
- **THEN** the new revision uses that message
- **AND** the stored content has one normalized blank line between the old and new content

#### Scenario: Close after save

- **WHEN** a client saves a write session and then closes it
- **THEN** the close result reports `draft_kept: false`
