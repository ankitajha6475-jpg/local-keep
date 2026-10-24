# Semantic Search — Delta

## MODIFIED Requirements

### Requirement: Background index freshness

The system SHALL index note heads in the background. Note create, edit, checkpoint, archive, restore, and configuration changes SHALL enqueue work. The note's index identity hash SHALL cover every input that affects its embedding, including the title, tags, and body, so a property-only change re-indexes the note. In-flight results SHALL be discarded if the note changed during embedding. Failed embedding calls MUST NOT delete previous vector rows.

#### Scenario: Tag-only edit re-indexes

- **WHEN** a note's tags change and its body does not
- **THEN** the note is enqueued for indexing
- **AND** its vectors are replaced with tag-aware vectors

#### Scenario: Changed during embedding

- **WHEN** the note changes while an embedding request is in flight
- **THEN** the stale vectors are discarded
- **AND** the note is enqueued again

#### Scenario: Edit a note while indexing

- **WHEN** a note changes while an earlier indexing result is in flight
- **THEN** the stale result is discarded
- **AND** the newer content is indexed

#### Scenario: Provider failure

- **WHEN** the embedding provider fails while reindexing a note
- **THEN** the previous vectors remain searchable
- **AND** the error is recorded for the admin

#### Scenario: Archive removes vectors

- **WHEN** a note is archived or purged
- **THEN** its chunks are removed from the active index

## ADDED Requirements

### Requirement: Metadata excluded from retrieval text

Chunk and full-text index inputs SHALL exclude the properties fence. Fence keys and values MUST NOT appear as searchable prose in chunks or in the FTS index.

#### Scenario: Fence is not searchable prose

- **WHEN** a note declares `status: active` in its fence
- **THEN** a keyword search for `status` does not match the note on account of that key
- **AND** the chunk text contains no fence lines

### Requirement: Tags contribute to retrieval

The embedding input for each chunk SHALL prefix the note's tags alongside the title, so tag-only retrieval keeps working after tags move out of the body. Full-text search SHALL include the tag paths as searchable text.

#### Scenario: Search by tag term

- **WHEN** a note declares `tags: [project/alpha]` and the query is `project alpha`
- **THEN** the note is retrievable by semantic search
- **AND** keyword search matches the tag paths
