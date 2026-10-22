# semantic-search Specification

## Purpose
Adds optional semantic retrieval over text notes and whiteboard text while keeping configuration, indexing, and model isolation under workspace-admin control.

## Requirements

### Requirement: Admin-configured embedding provider

Semantic search SHALL be optional and disabled until an admin enables it. The admin SHALL configure an OpenAI-compatible base URL, API key, model, dimensions, chunk size/overlap, and indexing tuning. The API key MUST be encrypted at rest and MUST NOT be returned by any API or rendered in the UI.

#### Scenario: Configure a provider

- **WHEN** an admin saves a valid embedding base URL, key, model, and dimensions
- **THEN** the settings are stored in SQLite
- **AND** the API returns only whether a key exists and a masked value
- **AND** the next indexing run uses the new settings without a process restart

#### Scenario: Test failure is visible

- **WHEN** the provider probe fails
- **THEN** the admin sees the error and existing vectors are not deleted

### Requirement: Model and dimension partitions

Embedding tables SHALL be isolated by model and dimensions. The partition key SHALL be derived from both values so the same model at different dimensions, or different models, cannot mix vectors. Switching back to a previously used model/dimension pair SHALL reuse its existing tables.

#### Scenario: Change dimensions

- **WHEN** the active model stays the same but dimensions change from 4096 to 1024
- **THEN** a new chunk/vector table partition is created
- **AND** 4096-dimension vectors are never queried against the 1024-dimension table

#### Scenario: Switch back

- **WHEN** the admin switches back to the earlier model/dimension pair
- **THEN** the original partition is reused

### Requirement: Background index freshness

Note creation, text edits, canvas checkpoints, archive, restore, and configuration changes SHALL enqueue indexing. Indexing MUST run in the background with bounded concurrency and batches. A note's chunks SHALL be replaced atomically only after all embeddings succeed; a failed request MUST NOT delete the previous vectors. Results for an outdated note hash SHALL be discarded.

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

### Requirement: Search modes and fallbacks

The system SHALL expose keyword, semantic, and hybrid search over REST and MCP. Hybrid search SHALL combine lexical and vector results with reciprocal rank fusion. Semantic search SHALL be available through dedicated API/MCP entry points, and MCP keyword search MUST continue to work when embeddings are disabled.

#### Scenario: Hybrid search

- **WHEN** a client searches in hybrid mode with embeddings enabled
- **THEN** results include both lexical and vector matches
- **AND** ranking combines both result lists by RRF

#### Scenario: Semantic search disabled

- **WHEN** a client requests semantic search while embeddings are disabled
- **THEN** the request returns a clear configuration error
- **AND** hybrid search falls back to keyword results with a notice

#### Scenario: UI fallback

- **WHEN** the UI semantic toggle fails
- **THEN** the UI shows a notice and returns keyword results

### Requirement: Optional reranking

The system SHALL optionally call an OpenAI-compatible rerank endpoint for semantic candidates. Reranking MUST be optional and MUST NOT make search depend on it. On failure, the system SHALL return vector order and expose the rerank error. The reranker MAY reuse the embedding key or use a separate encrypted key.

#### Scenario: Rerank candidates

- **WHEN** a reranker is configured and semantic search returns multiple candidates
- **THEN** the candidates are reordered by the reranker
- **AND** results expose the rerank score and model

#### Scenario: Reranker failure

- **WHEN** the rerank call fails
- **THEN** vector order is returned
- **AND** the response includes `rerank.error`

### Requirement: Admin rebuild and reset

The admin UI/API SHALL provide status, model/partition info, index queue, rebuild, and reset operations. Rebuild SHALL force-queue notes. Reset SHALL drop the active embedding tables and start a clean index. Previously used model partitions SHALL be preserved unless an explicit reset removes them.

#### Scenario: Rebuild index

- **WHEN** an admin clicks Rebuild index
- **THEN** all eligible notes are queued
- **AND** progress is visible in the admin dialog

#### Scenario: Reset index

- **WHEN** an admin confirms Reset index
- **THEN** active embedding tables are dropped
- **AND** indexing restarts with the current settings
