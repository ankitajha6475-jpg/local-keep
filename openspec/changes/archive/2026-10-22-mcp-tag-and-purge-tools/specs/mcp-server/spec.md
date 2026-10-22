## ADDED Requirements

### Requirement: MCP tag administration

The server SHALL expose `add_tags` and `remove_tags` tools. Each SHALL accept one or more `note_ids`, one or more `tags`, an optional `dry_run`, and an optional `commit_mode`/`message`. Tags SHALL be normalised and validated using the shared tag rules. Adding SHALL only add missing tags; removing SHALL remove exact hierarchical matches and SHALL NOT remove a descendant when only the ancestor is requested. Both operations SHALL preserve fenced and inline code, create at most one revision per changed note with source `mcp`, and return compact per-note results containing `added` or `removed`, current `tags`, revision number, and `conflict` without the full content. Archived notes SHALL be skipped with `skipped: "note_archived"` and a restore guide.

#### Scenario: Add tags in bulk

- **WHEN** a client calls `add_tags` for two active notes with `tags: ["project/local"]`
- **THEN** each note receives one new revision
- **AND** each result reports `added: ["project/local"]` and the updated tag list
- **AND** neither result contains the full note body

#### Scenario: Dry run

- **WHEN** a client calls `add_tags` with `dry_run: true`
- **THEN** no revision is created
- **AND** the result reports the tags that would be added

#### Scenario: Hierarchical removal

- **WHEN** a note has `#area` and `#area/project` and the client removes `area`
- **THEN** only `#area` is removed
- **AND** `#area/project` remains

#### Scenario: Code preservation

- **WHEN** a note contains `#tag` inside a fenced code block
- **THEN** adding or removing tags does not change that code block

#### Scenario: Archived note

- **WHEN** a client adds tags to an archived note
- **THEN** the note is skipped with `note_archived`
- **AND** the guide tells the client to restore the note first

### Requirement: Archived cleanup tools

The server SHALL expose `purge_note` and `purge_archived`. Both SHALL permanently delete only archived notes, release image references, remove tags/links/search/embedding rows, emit the purge event, and close affected MCP sessions and drafts. `purge_note` SHALL preview unless `confirm: true` and MAY require `expected_title` to match. `purge_archived` SHALL preview by default; purging all archived notes SHALL require `confirm: true` plus an `expected_count` matching the preview, while an explicit `note_ids` subset SHALL require only confirmation. Active, missing, or still-open write-session cases SHALL fail without deleting anything. Results SHALL be compact summaries.

#### Scenario: Preview a single purge

- **WHEN** a client calls `purge_note` without `confirm`
- **THEN** the note still exists
- **AND** the result reports `mode: "preview"` with the note id, title, and revision number

#### Scenario: Confirm a single purge

- **WHEN** a client calls `purge_note` for an archived note with `confirm: true` and a matching `expected_title`
- **THEN** the note and its revisions are deleted
- **AND** a later `get_note` returns `note_not_found`

#### Scenario: Active note rejected

- **WHEN** a client calls `purge_note` for an active note
- **THEN** the request fails with `note_not_archived`
- **AND** the note is unchanged

#### Scenario: Bulk purge guard

- **WHEN** a client calls `purge_archived` with `confirm: true` but no `expected_count`
- **THEN** the request fails with `expected_count_required`
- **AND** no note is deleted

#### Scenario: Count mismatch

- **WHEN** a client calls `purge_archived` with an `expected_count` that differs from the current archived set
- **THEN** the request fails with `count_mismatch`
- **AND** the error lists the current archived notes
- **AND** no note is deleted

#### Scenario: Explicit subset

- **WHEN** a client calls `purge_archived` with archived `note_ids` and `confirm: true`
- **THEN** only those archived notes are deleted

### Requirement: Archived visibility in list and search

`search_notes` and `list_notes` SHALL include `archived_at` and `is_archived` in every summary. When `include_archived` is false, archived rows SHALL be absent and active rows SHALL report `archived_at: null` and `is_archived: false`. Clients SHALL NOT need to diff the active and all-note lists to identify archived notes.

#### Scenario: Identify an archived row

- **WHEN** a client lists notes with `include_archived: true`
- **THEN** archived rows have a non-null `archived_at` and `is_archived: true`
- **AND** active rows have `archived_at: null` and `is_archived: false`

### Requirement: Compact MCP note payloads

`edit_note`, `append_to_note`, `archive_note`, and `restore_note` SHALL return compact note/revision metadata by default. `include_content: true` SHALL return the full note and revision bodies for edit/append. `get_note` SHALL omit whiteboard `canvasData` and `thumbnail` unless `include_canvas: true`, and SHALL indicate omission with `canvas_omitted: true`. `get_whiteboard` remains the page-recall tool.

#### Scenario: Compact edit

- **WHEN** a client edits a large note without `include_content`
- **THEN** the result includes ids, revision number, tags, and content length
- **AND** it does not include the full note body

#### Scenario: Full edit when requested

- **WHEN** a client passes `include_content: true`
- **THEN** the result includes the full note and revision bodies

#### Scenario: Canvas payloads

- **WHEN** a client calls `get_note` for a whiteboard without `include_canvas`
- **THEN** `canvasData` and `thumbnail` are omitted
- **AND** `canvas_omitted` is true

### Requirement: Archived session errors and append/session fixes

Opening a write or read session on an archived note SHALL fail with `note_archived` and a guide to `restore_note`, distinct from `note_not_found`. `append_to_note` SHALL accept `message`, use it for the revision, and normalise blank lines between the existing content and the addition. `note_session close` SHALL report `draft_kept` from the persisted draft state, so a clean draft cleaned up after save reports `false`.

#### Scenario: Archived session open

- **WHEN** a client opens a write session on an archived note
- **THEN** the error code is `note_archived`
- **AND** the guide mentions restoring the note

#### Scenario: Append message and spacing

- **WHEN** a client appends content with `message` to a note ending in blank lines
- **THEN** the new revision uses that message
- **AND** the stored content has one normalized blank line between the old and new content

#### Scenario: Close after save

- **WHEN** a client saves a write session and then closes it
- **THEN** the close result reports `draft_kept: false`
