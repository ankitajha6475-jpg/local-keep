## Context

The server search service supports three modes:

- `keyword`: FTS5/BM25 order;
- `semantic`: vector cosine similarity, optionally reranked;
- `hybrid`: keyword + semantic with reciprocal rank fusion (RRF).

The dashboard previously requested semantic mode and stored only note ids. `filterDashboardNotes` filtered by those ids, then `sortDashboardNotes` sorted the surviving notes by `updatedAt` (or the selected sort). That second sort erased every ranking signal.

## Goals / Non-Goals

**Goals:**

- Dashboard search uses hybrid ranking whenever embeddings are available.
- Hybrid is on by default in the browser, while remaining easy to turn off.
- Search results are displayed in API order by default.
- Keyword-only search still works and also preserves FTS order.
- No secrets are exposed to non-admin users.

**Non-Goals:**

- Changing the RRF formula or vector scoring.
- Requiring a reranker. Vector similarity and RRF are the preliminary rankings.
- Server-side dashboard filtering/sorting outside search.
- Persisting the hybrid preference server-side per user.

## Decisions

### Decision 1: Dashboard uses the hybrid endpoint

When `semanticSearchEnabled` is true and the server reports semantic availability, the dashboard calls:

```
GET /api/search/hybrid?q=…&limit=50
```

and reads `results[].note_id` in returned order. It does not call the semantic-only endpoint.

If hybrid returns a `notice` (semantic failure) the UI keeps the keyword results, shows the notice, and labels the result count as keyword results. Hybrid responses include `semantic_count` and `keyword_count`; the UI only labels the count "hybrid" when at least one semantic result contributed.

### Decision 2: Availability comes from `/api/config`

`GET /api/config` returns:

```json
{
  "search": {
    "semanticEnabled": true,
    "model": "BAAI/bge-m3",
    "rerankEnabled": false
  }
}
```

`semanticEnabled` requires enabled settings, a configured model/dimensions, and a loaded `sqlite-vec` extension. No key, base URL, or masked key is returned.

The browser initializes the toggle to on when available unless `localStorage['local-keep-hybrid-search']` is `0`.

### Decision 3: Relevance is an explicit sort mode

The sort selector gains a **Relevance** option while a query is present. The first query for a search session:

- remembers the previous sort;
- switches to `Relevance`.

The user may then choose date/title sorting if desired. Clearing or closing search restores the remembered sort when it is still `Relevance`. Relevance ordering ignores the ascending/descending toggle and always displays best match first.

`orderBySearchResults(items, ids)` builds a rank map and sorts by it. Notes absent from `ids` sort last so tag filtering or stale index entries cannot break the order.

### Decision 4: Keyword fallback remains first-class

- If hybrid supports keyword-only fallback, the server returns keyword results with `notice`.
- If the request throws, the UI disables hybrid for the session, shows a notice, and retries keyword search.
- If keyword also fails, the result list is empty.

### Decision 5: Sequence guard

Search requests use a monotonically increasing sequence. Responses from an older query are ignored, so fast typing cannot overwrite a newer ranking.

### Decision 6: Qwen3 query instruction

Qwen3-Embedding is instruction-aware. The query embedding uses:

```
Instruct: Given a web search query, retrieve relevant passages that answer the query
Query: <user query>
```

Document chunks remain unprefixed. This is asymmetric by design and matches the model's retrieval guidance. Existing indexes stay valid because only query-time embeddings change. The instruction is applied only for model names containing `Qwen3-Embedding`; other providers keep the raw query.

Without the instruction, short queries (notably Chinese) produced compressed similarities around 0.5 and ranked unrelated proxy/key notes above cloud-storage notes. With it, `云存储` ranks the GCS/object-storage notes first without reindexing. Rerank still receives the raw user query, not the instruction-wrapped text.

### Decision 7: Scroll reset

Dashboard search results use `page-mode` scrolling on the window. On a result/tab/sort/tag change, the scroller's own position is reset and the window is scrolled to the notes grid top minus the sticky header and sticky control/selection bar. A second `requestAnimationFrame` pass handles the virtual scroller's spacer update when the result set shrinks.

## Risks / Trade-offs

- **[Risk] Index not built yet** — hybrid returns keyword matches; the UI still shows results and the toggle can remain on.
- **[Risk] Embedding provider errors** — server returns a notice; UI falls back to keyword and says so.
- **[Risk] User wants date sorting during search** — relevance is only the default; date/title remain selectable.
- **[Risk] localStorage unavailable** — defaults to on when available, otherwise off, with no persistence.

## Migration Plan

None. Existing users with embeddings configured get hybrid on by default on their next config load. A stored `0` opts out.

## Open Questions

None.
