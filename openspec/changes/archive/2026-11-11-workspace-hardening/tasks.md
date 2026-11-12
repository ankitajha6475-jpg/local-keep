## 1. Security headers

- [x] 1.1 Add a security-header middleware to `server.js`
- [x] 1.2 Set `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`
- [x] 1.3 Register it before the route handlers so it covers the API, the image routes, `/mcp`, and the static frontend
- [x] 1.4 Check that every content-bearing route sets a `Content-Type` (`nosniff` depends on it)

## 2. Host-bound session cookie

- [x] 2.1 Add a `secureCookies()` predicate to `src/server/sessionStore.js` that reads `NODE_ENV` and `COOKIE_SECURE` at call time
- [x] 2.2 Use `__Host-local_keep_session` when the cookie is `Secure`, and `local_keep_session` otherwise
- [x] 2.3 Make `cookieHeader()` and `sessionIdFromRequest()` use the same name
- [x] 2.4 Keep `Path=/` and never set a `Domain` attribute

## 3. Container queries for the workspace

- [x] 3.1 Make `main` a size query container (`container-type: inline-size`, `container-name: workspace`)
- [x] 3.2 Replace the workspace's `@media (max-width: 600px)` rule with `@container workspace (max-width: 600px)`
- [x] 3.3 Replace the tag sidebar's `@media (max-width: 600px)` rule with the same container query
- [x] 3.4 Remove the cross-file comment that documented the shared breakpoint
- [x] 3.5 Drop the dead `.notes-grid { grid-template-columns: 1fr }` rule — the column count is derived from the measured grid width in JavaScript

## 4. `content-visibility` on the card body

- [x] 4.1 Add `content-visibility: auto` and `contain-intrinsic-size` to `.note-content`
- [x] 4.2 Move `.presence-dot` out of `.note-content` so it stays anchored to the card
- [x] 4.3 Verify the card keeps its 380px height and the scroller its 396px row height

## 5. Verification and docs

- [x] 5.1 Add tests for the security headers
- [x] 5.2 Add tests for the cookie naming
- [x] 5.3 Add a source-level test that the workspace breakpoint is shared and cannot drift
- [x] 5.4 Run the full test suite
- [x] 5.5 Run the frontend build
- [x] 5.6 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 5.7 Run `openspec validate --strict`
