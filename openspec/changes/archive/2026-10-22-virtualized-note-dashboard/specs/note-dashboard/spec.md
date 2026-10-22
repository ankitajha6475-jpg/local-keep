## ADDED Requirements

### Requirement: Lightweight dashboard index

The dashboard SHALL load a lightweight note index containing every note's identity, title, display title, type, revision, archived state, timestamps, color, tags, and link counts. The index SHALL NOT include note bodies or canvas scene data. All dashboard ordering, tab counts, search-result filtering, tag filtering, link resolution, draft metadata, and Select All SHALL use the index so they remain complete without loading every note body.

#### Scenario: Large library

- **WHEN** the dashboard loads a library with many notes
- **THEN** it requests the index once
- **AND** it does not request every note body or canvas payload

#### Scenario: Link resolution outside the visible range

- **WHEN** a visible card contains a wiki link to a note that is not cached
- **THEN** the link resolves from the index
- **AND** it opens the target note by id

#### Scenario: Archived notes

- **WHEN** archived notes are included in the index
- **THEN** the Archived tab and archived link status remain correct
- **AND** archived cards are not loaded as active cards

### Requirement: Virtualized responsive rows

The dashboard SHALL render notes in rows sized to the measured column count and SHALL mount only the visible rows plus a fixed render buffer. Each row SHALL have a fixed height equal to the card height plus the grid gap. The column count SHALL be derived from the container width and the minimum card width. Quick Shortcuts, Drafts, archived notes, note colors, presence, and card actions SHALL render through the same card component.

#### Scenario: Resize

- **WHEN** the dashboard width crosses a column breakpoint
- **THEN** the row chunking and column count update
- **AND** the virtual list keeps a stable row height

#### Scenario: Long library

- **WHEN** the dashboard has thousands of notes
- **THEN** the DOM contains only the buffered row range
- **AND** scrolling mounts and unmounts rows

#### Scenario: Quick Shortcuts and drafts

- **WHEN** the Notes tab shows Quick Shortcuts or the Drafts tab shows draft cards
- **THEN** both are included in the virtual item ordering
- **AND** they keep their read-only controls

### Requirement: Bounded on-demand card details

The dashboard SHALL hydrate card bodies in ordered batches as rows enter the visible range. Each batch SHALL request at most 30 note ids. The client SHALL keep a sliding detail cache with a hard cap of 120 notes, SHALL prefetch one batch on each side of the visible range, and SHALL evict entries outside the padded range. The currently editing note SHALL NOT be evicted. Until a detail arrives, the card SHALL show index metadata and a skeleton preview.

#### Scenario: Initial viewport

- **WHEN** the dashboard first renders
- **THEN** the visible cards hydrate immediately
- **AND** they render their markdown or canvas thumbnail
- **AND** cards outside the buffer are not mounted

#### Scenario: Scroll to a new region

- **WHEN** the user scrolls to an unloaded region
- **THEN** the client requests the missing detail batches
- **AND** skeleton cards remain until the batches arrive
- **AND** already-cached cards do not refetch

#### Scenario: Fixed cache

- **WHEN** the user scrolls through many regions
- **THEN** cached details outside the padded visible range are evicted
- **AND** the cache stays bounded

#### Scenario: Open a note

- **WHEN** the user opens a card whose detail is cached
- **THEN** the editor opens immediately
- **WHEN** the detail is missing
- **THEN** the full note is fetched first
- **AND** whiteboards fetch their canvas data before rendering

### Requirement: Index-backed live updates

The WebSocket bulk `notes` message SHALL carry index summaries. The client SHALL update the index and invalidate cached details whose revision, timestamp, or title changed. Targeted note events and pending updates while the editor is open SHALL continue to work.

#### Scenario: Remote edit

- **WHEN** another client saves a note
- **THEN** the index receives the new revision and timestamp
- **AND** any cached card detail for that note is invalidated
- **AND** the visible card rehydrates if needed

#### Scenario: Editor open

- **WHEN** an index update arrives while the editor is open
- **THEN** it is buffered until the editor closes

### Requirement: Batched note-card endpoint

`POST /api/notes/window` SHALL accept an ordered array of note ids and return card DTOs in that order. It SHALL limit the batch to 200 ids, include up to 12,000 characters of text content with a `contentTruncated` flag, include canvas thumbnails, and omit canvas scene data. Unknown ids SHALL be omitted.

#### Scenario: Ordered batch

- **WHEN** the client requests ids `[b, a]`
- **THEN** the response returns note `b` followed by note `a`

#### Scenario: Canvas card

- **WHEN** a canvas note is included in a detail batch
- **THEN** its thumbnail is returned
- **AND** its `canvasData` is omitted
