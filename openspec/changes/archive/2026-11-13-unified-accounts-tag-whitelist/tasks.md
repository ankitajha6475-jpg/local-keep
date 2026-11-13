# Tasks: Unified Accounts & Tag Whitelist

## 1. Pattern Matcher Pure Helper

- [x] 1.1 Create `src/shared/tagMatcher.js` implementing `.gitignore` syntax matching, negative rules (`!`), comments, globs (`*`, `**`), and `:untagged` pseudo-tag support
- [x] 1.2 Add unit test suite in `tests/tagMatcher.test.js` covering multi-tag notes, untagged notes, and negation

## 2. Schema and Migration

- [x] 2.1 Add migration `016-unified-accounts-tag-whitelist.js` adding `tag_whitelist` to `users` and `user_id` to `api_tokens`
- [x] 2.2 In migration 016, backfill existing tokens (`user:admin` -> admin, unassigned -> alex) and enforce foreign key
- [x] 2.3 Update `src/server/schema.js` and `src/server/services/tokens.js` to include `user_id` in token creation and querying
- [x] 2.4 Verify with migration unit tests

## 3. Authentication & Service Enforcement

- [x] 3.1 Update `authenticate()` in `server.js` and `src/server/services/users.js` so bearer token resolution returns the owning user and their tag whitelist
- [x] 3.2 Update `src/server/services/notes.js` to enforce the caller's tag whitelist on index, window, get, and search paths
- [x] 3.3 Update `src/mcp/createServer.js` and MCP tool handlers to respect the owning user's tag whitelist
- [x] 3.4 Update WebSocket notes broadcasting and note presence to only broadcast allowed notes to restricted clients

## 4. API & UI Administration

- [x] 4.1 Update `/api/admin/users` endpoints to get and update `tag_whitelist`
- [x] 4.2 Update `/api/mcp/tokens` to list and create tokens tied to the authenticated user's ID
- [x] 4.3 Update `UsersModal.vue` / admin settings UI to edit a user's `tag_whitelist`
- [x] 4.4 Update token modal to show token owner and allow users to manage their own tokens

## 5. Verification & Tests

- [x] 5.1 Add integration tests in `tests/tagWhitelist.test.js` verifying access enforcement across REST, MCP, and search
- [x] 5.2 Run full test suite (`npm test`) and build check (`npm run build`)
- [x] 5.3 Update `CHANGELOG.md` and `AGENTS.md`
