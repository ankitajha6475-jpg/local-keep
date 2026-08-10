## 1. Server: session storage

- [x] 1.1 Add `sessions` table to SQLite schema: `(sessionId TEXT PK, hash TEXT, expiresAt INTEGER)`, created in `initDB()`
- [x] 1.2 Implement session store module (`SessionStore` class or factory): `issue(hash) -> { sessionId, expiresAt }`, `validate(sessionId) -> { hash, expiresAt } | null`, `revoke(sessionId)`, `hydrate()` (loads from `sessions` table on boot)
- [x] 1.3 Implement HMAC cookie signing helpers: `signCookie(sessionId) -> "<id>.<hmac>"`, `parseCookie(value) -> sessionId | null` (verifies HMAC). Use Node `crypto.createHmac('sha256', SECRET)` where `SECRET` is derived from an env var `LOCAL_KEEP_SECRET` or persisted to a `server_secret` table on first run

## 2. Server: auth endpoints

- [x] 2.1 Refactor `POST /api/password/verify` to create a session via `SessionStore.issue()` and respond `{ success: true, token: sessionId }` + `Set-Cookie: local_keep_session=<signed>; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/` (add `Secure` when `NODE_ENV=production`)
- [x] 2.2 Update `POST /api/password/setup` to also issue a session cookie (same shape as verify) after storing the password hash
- [x] 2.3 Add `GET /api/auth/status` returning `{ authenticated, expiresAt }` by checking cookie or header against the session store
- [x] 2.4 Add `POST /api/auth/logout` requiring an active session; revoke server-side and clear the cookie (`Max-Age=0`)

## 3. Server: middleware + WebSocket auth

- [x] 3.1 Add a cookie parser to incoming requests (parse `cookie` header; smallest possible impl, no new deps)
- [x] 3.2 Rewrite `checkAuth` middleware: accept cookie (via `parseCookie`) OR `X-Auth-Token` header carrying a session ID; validate against `SessionStore`. Remove acceptance of the raw password hash as a valid token
- [x] 3.3 Update WebSocket authentication (`/ws?token=`): validate the query `token` against `SessionStore.validate()` instead of comparing to stored hash; close with `1008` on failure
- [x] 3.4 Call `SessionStore.hydrate()` during server startup after `initDB()`

## 4. Frontend: cookie-based session

- [x] 4.1 Add an in-memory `runtimeToken` ref (module-scoped) replacing all `sessionStorage.getItem('local-keep-token')` / `setItem` calls
- [x] 4.2 In `onMounted`, replace the localStorage check with `GET /api/auth/status`; only show the password screen when `authenticated === false`; otherwise load the app
- [x] 4.3 In `login()` and `setupPassword()`, store `data.token` into `runtimeToken` (NOT sessionStorage) for WebSocket use; the cookie handles REST automatically
- [x] 4.4 In `logout()`, call `POST /api/auth/logout` then clear `runtimeToken`; show password screen
- [x] 4.5 Update `connectWebSocket()` to use `runtimeToken` for `?token=`; ensure reconnect logic re-derives from `runtimeToken`
- [x] 4.6 Keep `api()` helper setting `X-Auth-Token: runtimeToken` (harmless; useful for debugging) but stop relying on it for authorization

## 5. Manual verification

- [ ] 5.1 Verify login persists across browser restart (close/reopen browser within 30 days)
- [ ] 5.2 Verify logout clears the cookie and session (subsequent `GET /api/notes` returns 401)
- [ ] 5.3 Verify WebSocket still connects with `?token=<sessionId>` after reload
- [ ] 5.4 Verify tampered cookie (`local_keep_session=garbage.psi`) is rejected with 401
- [ ] 5.5 Verify container restart keeps sessions usable (re-auth not required)
- [ ] 5.6 Update `CHANGELOG.md` under `[Unreleased]` → `Changed`: "Login now persists across browser restart via signed cookie (30 days)"
