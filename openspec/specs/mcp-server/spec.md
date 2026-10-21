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

MCP requests MUST be authenticated by a bearer token (`Authorization: Bearer lk_mcp_...`) or a valid session cookie. Tokens SHALL be stored as SHA-256 hashes with a name, scopes, creation time, last-used time, and revocation time. The raw token SHALL be shown once at creation. The token name MUST become the revision actor `mcp:<name>`. No anonymous MCP access SHALL be allowed.

#### Scenario: Create and use a token

- **WHEN** a user creates an MCP token named `Claude`
- **THEN** the raw token is returned once
- **AND** an MCP call with that token succeeds
- **AND** revisions created by it have actor `mcp:Claude`

#### Scenario: Revoked token

- **WHEN** a token is revoked and then used
- **THEN** the request is rejected with an auth error

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

The server SHALL expose `get_links`, `get_backlinks`, `get_graph`, and `list_tags`. Graph results SHALL support note/depth, tag filtering, limits, and unresolved inclusion. Tag results SHALL include the tree with direct/subtree counts and untagged count.

#### Scenario: Backlinks over MCP

- **WHEN** note A is linked from note B and a client requests A's backlinks
- **THEN** B is returned with its title/type/context

#### Scenario: Tag tree over MCP

- **WHEN** a client lists tags
- **THEN** the tree includes hierarchical paths and counts

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

The system SHALL provide token create/list/revoke via REST, CLI, and UI. It SHOULD provide a `mcp-stdio.js` adapter for stdio-only hosts; the adapter MUST use the same services/permission model (direct DB with WAL or the REST facade).

#### Scenario: Manage tokens

- **WHEN** the user opens MCP settings
- **THEN** existing token names/metadata are listed
- **AND** a new token can be created once and copied
- **AND** a token can be revoked
