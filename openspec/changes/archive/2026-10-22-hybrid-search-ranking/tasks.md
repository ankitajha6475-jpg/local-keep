## 1. Server availability

- [x] 1.1 Add non-secret `search` availability to `GET /api/config`
- [x] 1.2 Require enabled settings, model/dimensions, and loaded sqlite-vec for `semanticEnabled`
- [x] 1.3 Add config API assertions

## 2. Hybrid dashboard requests

- [x] 2.1 Call `/api/search/hybrid` instead of `/api/search/semantic`
- [x] 2.2 Default the browser toggle to on when available, honoring a stored opt-out
- [x] 2.3 Disable the toggle when hybrid search is not configured
- [x] 2.4 Add a request sequence guard
- [x] 2.5 Keep keyword fallback and show hybrid notices
- [x] 2.6 Show whether the count is hybrid or keyword results

## 3. Ranking

- [x] 3.1 Preserve API id order instead of re-sorting by `updatedAt`
- [x] 3.2 Add a Relevance sort option and auto-select it for new searches
- [x] 3.3 Restore the previous sort when search is cleared
- [x] 3.4 Add `orderBySearchResults` helper and regression test

## 4. Search service tests

- [x] 4.1 Test hybrid RRF ordering across keyword and semantic lists
- [x] 4.2 Test semantic-only ordering when keyword has no match
- [x] 4.3 Test hybrid keyword fallback when embeddings fail

## 5. Embedding query instruction

- [x] 5.1 Prefix Qwen3-Embedding query inputs with the retrieval instruction
- [x] 5.2 Keep document chunks and rerank queries unprefixed
- [x] 5.3 Add a service test proving query/doc asymmetry
- [x] 5.4 Verify `云存储` ranks GCS/cloud-storage notes first against the live index

## 6. Scroll reset

- [x] 6.1 Reset the window to the notes grid top on search/tab/sort/tag changes
- [x] 6.2 Account for the sticky header and control/selection bar
- [x] 6.3 Re-apply after a frame for virtual-scroller spacer updates

## 7. Verification and docs

- [x] 7.1 Run the full test suite
- [x] 7.2 Run the production build
- [x] 7.3 Browser-test hybrid toggle, relevance order, keyword fallback, search clear, and scroll reset
- [x] 7.4 Update AGENTS/README/CHANGELOG and validate OpenSpec
- [ ] 7.5 Archive after review
