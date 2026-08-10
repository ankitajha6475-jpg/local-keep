## ADDED Requirements

### Requirement: Successful password verify issues a session cookie
The system SHALL issue a signed, opaque session ID in an `HttpOnly`, `SameSite=Strict` cookie (`local_keep_session`) upon a successful `POST /api/password/verify` or `POST /api/password/setup`. The cookie SHALL also be returned as `token` in the JSON response body for use in WebSocket authentication.

#### Scenario: Verify with correct password
- **WHEN** a client sends `POST /api/password/verify` with a matching password
- **THEN** the server responds `200` with `{ success: true, token: <sessionId> }`
- **AND** sets a `Set-Cookie: local_keep_session=<id>.<sig>; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/` header (and `Secure` when `NODE_ENV=production`)

#### Scenario: Setup creates a session
- **WHEN** a client sends `POST /api/password/setup` with a new password (≥ 4 chars)
- **THEN** the server stores the password hash and issues the same cookie + `token` as a verify call

### Requirement: Cookie is tamper-proof and bound to an active session
The cookie value SHALL be `<sessionId>.<hmac(sessionId)>` where the HMAC uses a server secret. The session ID SHALL be stored server-side (in-memory, hydrated from SQLite on startup) with `expiresAt`. A request SHALL be authenticated only if: the HMAC is valid, the session ID exists in the store, and `expiresAt > now`.

#### Scenario: Tampered cookie rejected
- **WHEN** a request arrives with a cookie whose HMAC does not match the session ID
- **THEN** the server treats the cookie as absent and returns `401 Unauthorized`

#### Scenario: Expired session cookie rejected
- **WHEN** a request arrives with a cookie referring to a session whose `expiresAt` has passed
- **THEN** the server removes the session from the store and returns `401 Unauthorized`

#### Scenario: Restart preserves active sessions
- **WHEN** the server restarts after sessions were issued
- **THEN** sessions persisted to the `sessions` table are hydrated into the in-memory store and remain usable until their `expiresAt`

### Requirement: REST requests accept cookie or session-bearing header
The `checkAuth` middleware SHALL accept the `local_keep_session` cookie OR an `X-Auth-Token` header carrying a valid session ID. The legacy behavior of accepting the raw password hash as a token SHALL be removed.

#### Scenario: Cookie-only REST request
- **WHEN** a browser sends `GET /api/notes` with a valid `local_keep_session` cookie and no `X-Auth-Token` header
- **THEN** the request is authorized

#### Scenario: Header session ID for non-browser clients
- **WHEN** a client sends `GET /api/notes` with `X-Auth-Token: <sessionId>` and no cookie
- **THEN** the request is authorized

#### Scenario: Legacy raw hash token rejected
- **WHEN** a client sends `X-Auth-Token: <passwordHash>` (pre-change format)
- **THEN** the server returns `401 Unauthorized`

### Requirement: WebSocket accepts the session ID via query string
WebSocket connections SHALL authenticate using `?token=<sessionId>` (the value returned by `/api/password/verify`). The token SHALL be validated against the same session store described above.

#### Scenario: WebSocket with valid session token
- **WHEN** a client connects to `/ws?token=<validSessionId>`
- **THEN** the WebSocket handshake completes and the client is added to the broadcast set

#### Scenario: WebSocket with invalid session token
- **WHEN** a client connects to `/ws?token=<invalidOrExpired>`
- **THEN** the server closes the socket with code `1008` and reason `Invalid token`

### Requirement: Auth status endpoint
The system SHALL expose `GET /api/auth/status` that reports whether the caller is currently authenticated using the cookie or header. The endpoint SHALL return `{ authenticated: boolean, expiresAt: number|null }` and SHALL NOT require authentication.

#### Scenario: Authenticated caller
- **WHEN** a client sends `GET /api/auth/status` with a valid cookie
- **THEN** the server returns `200 { authenticated: true, expiresAt: <epochMs> }`

#### Scenario: Unauthenticated caller
- **WHEN** a client sends `GET /api/auth/status` with no cookie or an invalid cookie
- **THEN** the server returns `200 { authenticated: false, expiresAt: null }`

### Requirement: Logout revokes the session
The system SHALL expose `POST /api/auth/logout` that deletes the session referenced by the caller's cookie (or `X-Auth-Token`) from the store and SQLite, and clears the cookie. The endpoint SHALL require an active session.

#### Scenario: Logout with valid session
- **WHEN** an authenticated client sends `POST /api/auth/logout`
- **THEN** the server removes the session row, responds `200 { success: true }`, and sets `Set-Cookie: local_keep_session=; Max-Age=0; Path=/`

#### Scenario: Subsequent request after logout
- **WHEN** the same client sends `GET /api/notes` with the previous cookie
- **THEN** the server returns `401 Unauthorized`

### Requirement: Client persists login across browser restarts
The frontend SHALL NOT store the token in `sessionStorage` or `localStorage`. On application mount the frontend SHALL query `GET /api/auth/status`; if `authenticated: true` it SHALL skip the password screen and load the app. On successful `verify`/`setup` the frontend SHALL read the JSON `token` into an in-memory variable for use in the WebSocket URL.

#### Scenario: Reload after browser restart
- **WHEN** the user reopens the browser within the session's max-age window
- **THEN** `/api/auth/status` returns `authenticated: true` and the app loads without prompting for the password

#### Scenario: Reload after session expiry
- **WHEN** the session has expired (past `expiresAt`)
- **THEN** `/api/auth/status` returns `authenticated: false` and the password screen is displayed

#### Scenario: Logout clears client state
- **WHEN** the user clicks logout
- **THEN** the frontend calls `/api/auth/logout`, clears the in-memory token, and shows the password screen
