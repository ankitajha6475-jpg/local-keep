## Why

Embeddings were configured, but dashboard search did not behave like hybrid search:

- The UI called `/api/search/semantic`, so lexical matches were ignored.
- It mapped results to note ids and then re-sorted them by the selected dashboard sort (`Last Modified` by default), discarding the server's semantic/BM25/RRF order.
- The hybrid toggle defaulted to off, so a user had to discover and enable it manually.

The server already ranks semantic results by vector similarity and hybrid results by reciprocal rank fusion, with optional reranking. The dashboard needs to consume and preserve that ranking.

## What Changes

- Use `GET /api/search/hybrid` from the dashboard when hybrid search is available and enabled.
- Expose non-secret search availability in `GET /api/config`: semantic enabled, active model, rerank enabled.
- Default the per-browser hybrid toggle to **on** when embeddings are configured; honor a stored opt-out.
- Disable the toggle when hybrid search is not configured.
- Add a **Relevance** sort option and select it automatically for a new search.
- Preserve the exact id order returned by keyword, semantic, or hybrid search. Notes missing from the result list sort last.
- Keep keyword fallback and show the server's `notice` when semantic/hybrid search is unavailable.
- Show "hybrid" in the result count when hybrid ranking was used.
- Prefix **query** embeddings with the Qwen3-Embedding retrieval instruction; keep document embeddings unprefixed.
- Reset the dashboard scroll position when a search result set is rendered.
- Add regression tests for RRF ordering, semantic fallback, client-side relevance ordering, and Qwen3 query instruction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `semantic-search`: dashboard hybrid selection, availability, and relevance ordering.

## Impact

- **Server**: `/api/config` now includes a minimal `search` object; no secrets or keys.
- **Client**: search request path, toggle default, relevance sort, result-order preservation, result-count label, and scroll reset.
- **Embeddings**: Qwen3-Embedding query instruction (documents unchanged; existing index remains valid).
- **Tests**: search service RRF/fallback tests; dashboard ordering helper test; config API assertions; Qwen3 query-instruction test.
- **No schema or migration changes.**
