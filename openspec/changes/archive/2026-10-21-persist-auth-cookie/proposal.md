## Why

The login token is currently stored only in `sessionStorage`, so every browser/tab restart forces the user to re-enter the password. On a single-user local app this is friction without security benefit. We need login to persist across browser restarts via a signed, long-lived cookie, while keeping the existing token header flow working for WebSocket and REST.

## What Changes

- Add a signed, tamper-proof session token (opaque random ID mapped server-side to the current password hash), distinct from the password hash itself.
- Issue this session token as an `HttpOnly`, `SameSite=Strict` cookie on successful `/api/password/verify` (and on `/api/password/setup`). Cookie has a configurable max-age (~30 days).
- Validate incoming requests by accepting the cookie **or** the existing `X-Auth-Token` header, so WebSocket (which passes the token via query string) keeps working and the browser automatically sends the cookie for REST requests.
- Add a `/api/auth/logout` endpoint that clears the cookie and revokes the session server-side.
- Frontend: stop storing the token in `sessionStorage`. On reload, rely on the cookie being present; only show the password screen when the server reports "no valid session" (a new `/api/auth/status` check). Keep an in-memory token for the WebSocket query string.
- Add a server-side session store (in-memory `Map<sessionId, { hash, expiresAt }>`, optionally persisted to SQLite for restart survival).

## Capabilities

### New Capabilities
- `auth-session`: Server-side session management and signed-cookie-based authentication that persists across browser restarts, including session issuance, validation, expiry, and logout.

### Modified Capabilities
<!-- None - authentication behavior currently has no spec, this introduces it. -->

## Impact

- **Affected code**:
  - `server.js`: `checkAuth` middleware (~line 558), `/api/password/verify` (~541), `/api/password/setup` (~530), WS auth block (~722-742). New `/api/auth/status`, `/api/auth/logout` endpoints. New session store + signing helpers.
  - `src/App.vue`: `onMounted` token check (~630), `login` (~776), `logout` (~792), `api()` helper (~346), `connectWebSocket` (~383). Replace `sessionStorage` reads/writes with cookie-reliant status check + in-memory token.
- **API additions**: `GET /api/auth/status`, `POST /api/auth/logout`. `verify`/`setup` now also `Set-Cookie`.
- **Dependencies**: None new (cookie signing via Node `crypto` HMAC; cookie parsing via small manual parser or existing approach).
- ** backwards compatibility**: Existing `X-Auth-Token` header still accepted (needed for WS query string token). Old sessionStorage behavior becomes obsolete but won't break upgrades.
- **Migration**: Existing single-password setup remains; a verify with the password issues the new session cookie.
