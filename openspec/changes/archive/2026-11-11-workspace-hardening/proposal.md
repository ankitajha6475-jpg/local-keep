## Why

The last audit findings touch the server and the workspace frame:

1. **No security headers.** `server.js` sets none: no
   `Content-Security-Policy`, no `X-Content-Type-Options`, no frame
   protection. The app renders untrusted note markdown through several
   `innerHTML` sinks.

2. **The session cookie is not host-bound.** It is `HttpOnly;
   SameSite=Strict; Path=/` with `Secure` in production, but it does not use
   the `__Host-` prefix, so a cookie set on a sibling host can shadow it.

3. **The workspace layout is coupled to the viewport.** The sidebar stacking
   breakpoint lives in two files and is measured against the viewport, while
   the space that matters is the workspace's content box. `main` has `2rem`
   of padding, so between a 600px and a 664px viewport the media query does
   not fire while the workspace is already too narrow.

4. **Card bodies are painted even when off-screen.** The hydrated card bodies
   inside the render buffer are still laid out and painted.

## What Changes

- `server.js` SHALL send a baseline set of security headers on every
  response: a `Content-Security-Policy` of
  `frame-ancestors 'none'; object-src 'none'; base-uri 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and
  `X-Frame-Options: DENY`.
- A strict `default-src` policy SHALL NOT be enabled: the Excalidraw React
  mount and the Vite dev server both depend on inline and blob resources.
  The deferred phase is report-only, and it is recorded in the design.
- The session cookie SHALL use the `__Host-` prefix whenever the cookie is
  `Secure`, which the prefix requires. The prefix additionally forbids the
  `Domain` attribute and locks the cookie to `Path=/`.
- The workspace SHALL be a size query container. The sidebar stacking
  breakpoint SHALL be measured against the workspace's content box instead of
  the viewport, so the layout reacts to the space it actually has.
- The card body SHALL skip layout and painting while it is off-screen, with
  an intrinsic size fallback so the row height stays stable.

## Capabilities

### New Capabilities

- `security-headers`: the baseline response header contract.

### Modified Capabilities

- `auth-session`: the session cookie is host-bound.
- `note-dashboard`: the workspace layout is container-driven, and off-screen
  card bodies skip rendering.

## Impact

- **Affected code**: `server.js`, `src/server/sessionStore.js`,
  `src/App.vue`, `src/components/TagSidebar.vue`,
  `src/components/DashboardNoteCard.vue`.
- **Behaviour**: the session rows in the database stay valid, but the cookie is
  renamed, so the first request after the deploy needs one re-login. The
  workspace stacks slightly earlier than before, because the breakpoint now
  measures the workspace rather than the viewport.
- **Risk**: medium. The cookie rename and the layout breakpoint are the two
  user-visible parts; the headers are additive.
