## MODIFIED Requirements

### Requirement: Pages UI

The whiteboard header SHALL provide a Pages drawer showing ordered page thumbnails, page numbers, rendered timestamp, stale state, Render now, Copy markdown, and Download all. The note card SHOULD show the first page or thumbnail and a page-count badge when available. Page images SHALL load lazily and decode asynchronously.

#### Scenario: View pages

- **WHEN** a render exists
- **THEN** the drawer shows page 1..N in order
- **AND** Copy markdown produces ordered `![page N](/api/images/...)` refs

#### Scenario: Stale pages

- **WHEN** the canvas changed after the last render
- **THEN** the drawer shows a stale badge and offers Render now

#### Scenario: Page images load lazily

- **WHEN** the pages drawer renders its tiles
- **THEN** each page image declares `loading="lazy"` and `decoding="async"`
