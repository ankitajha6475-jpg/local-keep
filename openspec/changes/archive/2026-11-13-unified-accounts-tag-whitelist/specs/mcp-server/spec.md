# MCP Server Spec Delta

## Purpose

Enforces the owning user's tag whitelist on all MCP requests, tool executions, and resource accesses.

## ADDED Requirements

### Requirement: MCP user binding and tag whitelist

The `/mcp` endpoint SHALL authenticate requests via bearer tokens or session cookies. Authentication SHALL identify both the token and the owning user. The request context SHALL carry the user's effective `tag_whitelist`.

#### Scenario: MCP token inherits user tag whitelist

- **WHEN** an MCP tool is called using a bearer token owned by user `alex`
- **THEN** notes outside `alex`'s `tag_whitelist` are excluded from tool output
- **AND** operations attempting to access or modify excluded notes return `note_not_found`

### Requirement: Tool execution tag boundary enforcement

MCP tools (`list_notes`, `get_note`, `search_notes`, `edit_note`, `append_to_note`, `set_properties`, `archive_note`, `purge_note`, etc.) SHALL filter and restrict actions according to the authenticated user's `tag_whitelist`.

#### Scenario: Read tools omit inaccessible notes

- **WHEN** an MCP client calls `list_notes` or `search_notes`
- **THEN** only notes matching the user's whitelist are returned in the results

#### Scenario: Mutation tools reject inaccessible notes

- **WHEN** an MCP client calls `get_note`, `edit_note`, or `archive_note` on a note excluded by the tag whitelist
- **THEN** the server returns `note_not_found` (404-equivalent) rather than revealing the note's existence
