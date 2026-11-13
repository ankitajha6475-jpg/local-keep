# Change: Unified Accounts & Tag Whitelist

## Why

Currently, human user accounts (`users`) and MCP/API tokens (`api_tokens`) exist in separate silos. API tokens have an optional `created_by` string, but they are not strictly owned by a user account. Furthermore, all accounts have global workspace access with no way to limit what notes a given user or agent token can see or modify.

By unifying API tokens under user accounts and providing `.gitignore`-style tag whitelisting per user account (with explicit support for untagged notes via `:untagged`), administrators can partition workspace notes across users and automation agents with precise, hierarchical access control.

## What Changes

1. **Unify API Tokens under User Accounts**:
   - `api_tokens` requires a `user_id` foreign key referencing `users(id)` with cascade deletion.
   - Migration 016 backfills existing tokens: tokens created by `user:admin` are linked to `admin`; unassigned legacy tokens are linked to member `alex`.
   - Token authentication resolves the owning `user`, inheriting the user's role and tag access boundaries.

2. **Tag Whitelisting with `.gitignore` Pattern Syntax**:
   - Add `tag_whitelist` (TEXT) to `users`.
   - Pattern syntax supports glob wildcards (`*`, `**`), directory nesting (`work/*`, `work/**`), comments (`#`), and negative negation (`!`).
   - Pseudo-tag `:untagged` matches notes that have no tags.
   - For notes with multiple tags, access is granted if **at least one** tag is permitted and **no tag** matches an explicit exclusion (`!pattern`).
   - Admin accounts are unrestricted by default when `tag_whitelist` is empty; non-admin accounts or explicitly configured admins are bounded by their whitelist.

3. **Access Enforcement Across Workspace**:
   - REST API note listing (`/api/notes/index`, `/api/notes/window`), note retrieval (`GET /api/notes/:id`), search (`/api/search/*`), graph (`/api/graph`), and tags tree (`/api/tags`) filter out inaccessible notes.
   - Note creation, modification, and property updates ensure that users cannot assign tags outside their whitelist or create notes they are forbidden from viewing.
   - MCP server tools (`list_notes`, `get_note`, `search_notes`, `edit_note`, etc.) enforce the owning user's tag whitelist.

4. **UI & Token Management**:
   - User administration modal allows editing a user's `tag_whitelist`.
   - API tokens management is unified under user accounts: users can create and manage their own MCP tokens, bounded by their account's tag whitelist.

## Capabilities

### Modified Capabilities
- `auth-session`: User data model includes `tag_whitelist`; API tokens belong to a `user_id`.
- `mcp-server`: MCP request authentication resolves the owning user and enforces their tag whitelist on all tool invocations and resource lookups.
- `note-tags`: Tag tree, list, and note filtering enforce the caller's effective tag whitelist rules.
