## ADDED Requirements

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
