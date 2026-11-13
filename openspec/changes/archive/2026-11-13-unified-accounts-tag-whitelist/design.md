# Design: Unified Accounts & Tag Whitelist

## Context

Local Keep supports multi-user authentication (`users`, `sessions`) and external API tokens (`api_tokens`). Currently, API tokens are largely decoupled from user accounts, and all authenticated sessions have uninhibited read/write access to the shared workspace. To support team environments and sandboxed AI agents, we unify tokens under user accounts and introduce a `.gitignore`-style tag whitelist.

## Goals / Non-Goals

**Goals:**
- Associate every API token with a specific `user_id` in SQLite.
- Provide a robust, pure tag pattern matcher supporting glob syntax, negative exclusions (`!`), and a special `:untagged` pseudo-tag.
- Apply caller tag whitelist boundaries across REST note endpoints, WebSocket note feeds, and MCP tool executions.
- Provide an admin UI to configure user tag whitelists and manage API tokens per user.
- Maintain seamless backwards compatibility for existing tokens via migration 016.

**Non-Goals:**
- Per-note individual ACLs (access control is strictly tag-based).
- Token-level tag overrides (tokens inherit the owning user's whitelist).
- Complex group/team role hierarchies (retains `admin` / `member` roles).

## Decisions

### D1: Pure Helper `src/shared/tagMatcher.js`
A pure module `createTagMatcher(patternText)` compiles `.gitignore`-style lines into a matcher function:
- Skips empty lines and `#` comments.
- Supports `!` negative prefixes.
- Converts glob syntax (`*`, `**`, `?`) into regexes handling path hierarchy (`/`).
- Translates empty tag sets into a virtual `[':untagged']`.
- Multi-tag rule: note is allowed if $\exists \text{tag} \in \text{note.tags}$ matching an allow pattern, and $\nexists \text{tag} \in \text{note.tags}$ matching a deny pattern.
- Used across client and server.

### D2: Unified Identity in `authenticate()`
`server.js`'s `authenticate(req)`:
- Bearer token: Look up `api_tokens` row -> look up `users` by `token.user_id`. Return `{ actor, token, user, authInfo }`.
- Session cookie: Look up `sessions` row -> look up `users` by `session.userId`. Return `{ actor, session, user, authInfo }`.
- In both cases, `authInfo.tagWhitelist` is set to `user.tag_whitelist` (or `null` if unrestricted admin).

### D3: Note Service Tag Filter Integration
`src/server/services/notes.js`:
- `listNotesIndex({ whitelist })`, `notesWindow(ids, { whitelist })`, `getNote(id, { whitelist })`.
- Where possible, pre-filter IDs via SQL queries on `note_tags` and `notes`.
- For single note lookups (`getNote`), return 404 (`Note not found`) if inaccessible, preventing information leakage.

### D4: Migration 016
- Backfill `api_tokens.user_id`:
  - `UPDATE api_tokens SET user_id = (SELECT id FROM users WHERE username = 'admin') WHERE created_by = 'user:admin' OR created_by LIKE '%admin%'`
  - `UPDATE api_tokens SET user_id = (SELECT id FROM users WHERE username = 'alex') WHERE user_id IS NULL`
- Add `tag_whitelist TEXT` column to `users`.
