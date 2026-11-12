# security-headers Specification

## Purpose
Defines the workspace hardening baseline: the security response headers every request carries, the host-bound session cookie, the container-driven workspace layout, and the off-screen card bodies that skip rendering.

## Requirements

### Requirement: Baseline security response headers

Every HTTP response from the server SHALL carry `Content-Security-Policy:
frame-ancestors 'none'; object-src 'none'; base-uri 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and
`X-Frame-Options: DENY`.

The headers SHALL be applied before the route handlers, so that they cover
the REST API, the image routes, the MCP endpoint, and the static frontend.

#### Scenario: An API response carries the headers

- **WHEN** a client requests `GET /api/auth/status`
- **THEN** the response carries `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`

#### Scenario: The document cannot be framed

- **WHEN** the app is loaded in an iframe
- **THEN** the browser refuses to render it

#### Scenario: The content type is not sniffed

- **WHEN** a response is served
- **THEN** the browser uses the declared `Content-Type` and does not guess

#### Scenario: The referrer does not leak

- **WHEN** the app navigates to another origin
- **THEN** the request carries no referrer

### Requirement: The content policy does not constrain the app's own resources

The `Content-Security-Policy` SHALL NOT contain a `default-src` directive and
SHALL NOT constrain the `script-src`, `style-src`, `img-src`, `connect-src`,
`font-src`, or `worker-src` sources. The app embeds the Excalidraw React
component, loads Excalidraw fonts, and serves exported images from `blob:`
URLs, none of which a strict policy would allow.

A strict policy SHALL only be introduced after the document's inline and blob
resources are accounted for, and it SHALL first be deployed in report-only
mode.

#### Scenario: The whiteboard still renders

- **WHEN** a whiteboard note is opened
- **THEN** the Excalidraw bundle loads and the fonts resolve

#### Scenario: An exported image still displays

- **WHEN** a whiteboard page is exported and shown in a note
- **THEN** the image renders from its `blob:` URL
