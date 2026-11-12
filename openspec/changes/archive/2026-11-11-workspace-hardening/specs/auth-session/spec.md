## ADDED Requirements

### Requirement: The session cookie is bound to the host

When the session cookie carries the `Secure` attribute, its name SHALL use
the `__Host-` prefix. The cookie SHALL use `Path=/` and SHALL NOT carry a
`Domain` attribute, as the prefix requires.

The `Secure` attribute and the `__Host-` prefix SHALL be decided by the same
condition, so a prefixed cookie is always `Secure` and a `Secure` cookie is
always prefixed. A request SHALL be authenticated by a cookie only when the
cookie's name is the current session cookie name.

#### Scenario: The secure cookie is host-bound

- **WHEN** the server issues a session cookie with the `Secure` attribute
- **THEN** the cookie name starts with `__Host-`
- **AND** the cookie has `Path=/`
- **AND** the cookie has no `Domain` attribute

#### Scenario: The insecure cookie keeps the plain name

- **WHEN** the server issues a session cookie without the `Secure` attribute
- **THEN** the cookie name is `local_keep_session`

#### Scenario: A renamed cookie is not accepted

- **WHEN** a request arrives carrying the pre-rename cookie name
- **THEN** the server treats the cookie as absent

## MODIFIED Requirements

### Requirement: Successful password verify issues a session cookie

The system SHALL issue a signed, opaque session ID in an `HttpOnly`, `SameSite=Strict` cookie upon a successful `POST /api/password/verify` or `POST /api/password/setup`. The cookie SHALL also be returned as `token` in the JSON response body for use in WebSocket authentication.

The cookie's name SHALL be `__Host-local_keep_session` when the cookie carries the `Secure` attribute, and `local_keep_session` otherwise. The name used to set the cookie SHALL be the name used to read it.

#### Scenario: Verify with correct password

- **WHEN** a client sends `POST /api/password/verify` with a matching password
- **THEN** the server responds `200` with `{ success: true, token: <sessionId> }`
- **AND** sets a `Set-Cookie: __Host-local_keep_session=<id>.<sig>; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/; Secure` header when the cookie is `Secure`
- **AND** sets `Set-Cookie: local_keep_session=<id>.<sig>; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/` otherwise

#### Scenario: Setup creates a session

- **WHEN** a client sends `POST /api/password/setup` with a new password (≥ 4 chars)
- **THEN** the server stores the password hash and issues the same cookie + `token` as a verify call

### Requirement: REST requests accept cookie or session-bearing header

The `checkAuth` middleware SHALL accept the session cookie OR an `X-Auth-Token` header carrying a valid session ID. The legacy behavior of accepting the raw password hash as a token SHALL be removed.

The cookie accepted by the middleware SHALL be the current session cookie name, whether or not it carries the `__Host-` prefix.

#### Scenario: Cookie-only REST request

- **WHEN** a browser sends `GET /api/notes` with a valid session cookie and no `X-Auth-Token` header
- **THEN** the request is authorized

#### Scenario: Header session ID for non-browser clients

- **WHEN** a client sends `GET /api/notes` with `X-Auth-Token: <sessionId>` and no cookie
- **THEN** the request is authorized

#### Scenario: Legacy raw hash token rejected

- **WHEN** a client sends `X-Auth-Token: <passwordHash>` (pre-change format)
- **THEN** the server returns `401 Unauthorized`

### Requirement: Logout revokes the session

The system SHALL expose `POST /api/auth/logout` that deletes the session referenced by the caller's cookie (or `X-Auth-Token`) from the store and SQLite, and clears the cookie. The endpoint SHALL require an active session.

The cookie that is cleared SHALL use the same name as the cookie that was issued.

#### Scenario: Logout with valid session

- **WHEN** an authenticated client sends `POST /api/auth/logout`
- **THEN** the server removes the session row, responds `200 { success: true }`, and sets `Set-Cookie: __Host-local_keep_session=; Max-Age=0; Path=/; Secure` (or the unprefixed equivalent)

#### Scenario: Subsequent request after logout

- **WHEN** the same client sends `GET /api/notes` with the previous cookie
- **THEN** the server returns `401 Unauthorized`
