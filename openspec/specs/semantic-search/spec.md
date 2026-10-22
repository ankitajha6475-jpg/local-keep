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

### Requirement: Dashboard hybrid search

The dashboard SHALL use hybrid search when embeddings are configured and the hybrid toggle is enabled. Hybrid availability SHALL be exposed through `GET /api/config` without returning API keys, base URLs, or other secrets. The browser toggle SHALL default to on when hybrid search is available, SHALL honor a per-browser opt-out, and SHALL be disabled when hybrid search is not configured.

#### Scenario: Hybrid is available

- **WHEN** embeddings are enabled, a model/dimensions are configured, and sqlite-vec is loaded
- **THEN** `/api/config` reports `search.semanticEnabled: true`
- **AND** the dashboard toggle starts on unless the browser stored an opt-out
- **AND** a search calls `/api/search/hybrid`

#### Scenario: Hybrid is unavailable

- **WHEN** embeddings are disabled or the vector extension is not loaded
- **THEN** `/api/config` reports `search.semanticEnabled: false`
- **AND** the dashboard toggle is disabled
- **AND** searches call the keyword endpoint

#### Scenario: Hybrid fallback

- **WHEN** the hybrid endpoint returns a `notice`, the request fails, or `semantic_count` is zero
- **THEN** the dashboard shows the notice when present
- **AND** keyword results remain visible
- **AND** the result count is not labelled hybrid

### Requirement: Search result relevance ordering

Search results SHALL be displayed in the order returned by the search API by default. The dashboard SHALL expose a **Relevance** sort option, select it automatically for a new search, and preserve the API order when it is selected. Clearing or closing the search SHALL restore the sort that was active before relevance was selected. Choosing another sort during a search SHALL continue to work and SHALL NOT be overwritten by later keystrokes.

#### Scenario: Hybrid ranking is visible

- **WHEN** hybrid search returns ids in RRF order
- **THEN** the dashboard renders those notes in the same order
- **AND** it does not re-sort them by last-modified time

#### Scenario: Keyword ranking is visible

- **WHEN** keyword search returns FTS rank order
- **THEN** the dashboard preserves that order while Relevance is selected

#### Scenario: User chooses another sort

- **WHEN** the user selects Last Modified during a search
- **THEN** the results are sorted by date
- **AND** subsequent keystrokes keep the chosen sort

#### Scenario: Clear search

- **WHEN** the user clears or closes the search while Relevance is selected
- **THEN** the previous sort is restored

### Requirement: Preliminary ranking without reranking

Semantic search SHALL order candidates by vector similarity when no reranker is configured. Hybrid search SHALL combine keyword and semantic ranks with reciprocal rank fusion. The dashboard MUST display this preliminary ranking even when reranking is disabled.

#### Scenario: No reranker

- **WHEN** reranking is not configured
- **THEN** semantic results are ordered by cosine similarity
- **AND** hybrid results are ordered by RRF
- **AND** the dashboard displays that order

### Requirement: Instruction-aware embedding queries

For Qwen3-Embedding models, semantic and hybrid search SHALL prefix the **query** embedding with the retrieval instruction `Given a web search query, retrieve relevant passages that answer the query` in the form `Instruct: ...\nQuery: ...`. Document chunks SHALL remain unprefixed. Existing indexes SHALL remain valid because only query-time embeddings change. Rerank requests SHALL continue to use the raw user query. Other embedding models SHALL receive the raw query.

#### Scenario: Chinese query follows the instruction

- **WHEN** the active model is `Qwen3-Embedding` and the user searches `云存储`
- **THEN** the query sent to `/embeddings` includes the retrieval instruction
- **AND** the cloud-storage/GCS notes rank above unrelated proxy/key notes
- **AND** no reindex is required

#### Scenario: Document indexing stays asymmetric

- **WHEN** a note is indexed for a Qwen3-Embedding model
- **THEN** its document chunks are embedded without the instruction prefix

#### Scenario: Non-Qwen model

- **WHEN** the active model is not Qwen3-Embedding
- **THEN** the query and documents use the model's normal raw input

### Requirement: Search result scroll reset

When a new search result set, dashboard tab, sort, or tag filter changes the rendered note list, the dashboard SHALL reset the viewport to the top of that list. The reset SHALL account for the sticky header and the sticky control/selection bar. It SHALL remain correct when the new result set is shorter than the previous one.

#### Scenario: Search from a scrolled dashboard

- **WHEN** the user has scrolled down the notes list and enters a search query
- **THEN** the viewport moves so the first result row is visible below the sticky controls
- **AND** the search results are not left mid-scroll or below the fold

#### Scenario: Shorter result set

- **WHEN** the search returns fewer rows than the previous list
- **THEN** the scroll position is reset after the virtual scroller updates its spacers
