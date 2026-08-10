## Context

Today the server stores a single global password (`password` table, `id=1`, value = `simpleHash(plaintext)`). `POST /api/password/verify` returns the hash back to the client as `token`, which the client persists in `sessionStorage`. On reload the client blindly trusts the `sessionStorage` value without re-verifying. Tabs closing or browser restart wipes the session, forcing re-entry of the password every time.

The token is the raw password hash, so anyone with it can authenticate but cannot derive the password. It is sent as a header (`X-Auth-Token`) for REST and as a query string for WebSocket (`/ws?token=`). There is no cookie support, no expiry, no revocation.

WebSocket clients cannot use cookies directly in the `ws` library's URL auth cleanly, and the existing query-string flow must keep working.

## Goals / Non-Goals

**Goals:**
- Login persists across browser restarts (~30 days) without re-entering the password.
- The persisted credential is an **opaque, short-lived, revocable session ID** — never the password hash.
- `HttpOnly` + `SameSite=Strict` + `Secure` (in production) cookie prevents JS/theft and CSRF.
- Existing WebSocket token-in-query-string flow keeps working unchanged.
- Logout actually invalidates the session server-side.
- Existing single-password model stays (no user accounts, no multiplexing).

**Non-Goals:**
- Replacing `simpleHash` with bcrypt/argon2 (tracked separately — out of scope here).
- Multi-user accounts, roles, or per-note permissions.
- Refresh tokens / sliding sessions (max-age is fixed; re-verify when it expires).
- Forcing HTTPS/Termination upgrade (cookie will set `Secure` only when `NODE_ENV=production`).

## Decisions

### Decision 1: Opaque server-stored session ID, signed via HMAC
Use a random 32-byte session ID rendered as hex, stored in a server `Map<sessionId, { hash, expiresAt }>`. Additionally attach an HMAC signature of the ID so the cookie is tamper-proof even if the in-memory store was wiped.

**Why not JWT** — JWTs aren't revocable without a server-side denylist, which defeats the purpose. Plain server-stored IDs are simpler and revocable.
**Why not just sign the password hash into the cookie** — that re-exposes the hash as a persistent credential; revocation is impossible.

### Decision 2: Dual authentication path in `checkAuth`
- Cookie first: if `req.cookies.local_keep_session` is present and HMAC-valid AND the session ID is in the active map AND `expiresAt > now` → authorize.
- Fallback to header: `X-Auth-Token` (could be either the legacy hash OR a session ID) — kept for WebSocket hand-off and backward compat.
- WebSocket handshake: parse `token` query string; accept the same values as the header path. The client will store the *session ID* (from the verify response body) in memory and pass it in `?token=`.

### Decision 3: In-memory store, persisted to SQLite for restart survival
Sessions survive container restart by writing the active session row into a new `sessions` table: `(sessionId TEXT PK, hash TEXT, expiresAt INTEGER)`. Writes are infrequent (on issue, on logout). Lookups always go to the in-memory `Map`; SQLite is just for hydration on boot.

### Decision 4: Token previously called "hash" → renamed "session" in API
- `POST /api/password/verify` returns `{ success, token: sessionId }` instead of `{ success, token: hash }`. Clients must use this `token` (session ID) for WS.
- The `X-Auth-Token` header now carries the session ID. Legacy hash-tokens are **rejected** (the `simpleHash` hash can still be derived from the password, but we no longer accept the raw hash as a credential — improves security posture).
  - **BREAKING** for any client still holding an old hash token: they'll be logged out once. Acceptable.

### Decision 5: New endpoints for client lifecycle
- `GET /api/auth/status` → checks the cookie (or header); returns `{ authenticated: true|false, expiresAt? }`. Lets the client skip the password screen on reload without making the user-visible "stored token" call.
- `POST /api/auth/logout` → delete server-side session row, send `Set-Cookie: local_keep_session=; Max-Age=0`.

### Decision 6: Frontend drops `sessionStorage`
- On `onMounted`: call `/api/auth/status`. If authenticated → load app. Else, show password screen.
- On `login`/`setupPassword`: read `data.token` (now the session ID), keep in memory only (`runtimeToken`), use for WS. No more `sessionStorage.setItem`.
- On `logout`: call `/api/auth/logout` (server clears cookie), clear in-memory token.
- Cookie automatically ships with REST requests → no header change needed for `api()` helper. (Header is harmless to keep setting, but optional.)

## Risks / Trade-offs

- **[Risk] Cookie not sent over WS** — WS handshake reads `?token=` only. → Client holds the session ID in memory and includes it in the WS URL. Cookie is used for REST; query string is used for WS. Documented and intentional.
- **[Risk] Cookie theft = full session hijack** — mitigated by `HttpOnly` (no JS access), `SameSite=Strict` (no CSRF), `Secure` in production, 30-day bounded lifetime, and revocation on logout.
- **[Risk] Container restart wipes in-memory store** — mitigated by persisting sessions to SQLite and hydrating on boot.
- **[Risk] Old hash tokens break** — acceptable one-time log-out on upgrading clients.
- **[Risk] `simpleHash` is reversible** — out of scope; this change does not make it worse and removes the raw-hash-as-credential pattern.

## Migration Plan

1. Ship the new session store + cookie issuance behind the existing `/api/password/verify` + `/api/password/setup`.
2. Frontend begins calling `/api/auth/status` on mount. On a session-restart during a 30-day window it skips the password screen.
3. Existing clients with old hash tokens in `sessionStorage` will get a 401 on `checkAuth` and silently bounce to the password screen exactly once.
4. Rollback: revert server changes + frontend. Old clients will re-use `sessionStorage`. Safe because we didn't change the `password` table schema.

## Open Questions

none — design is committed.
