# Semantic Search / Embeddings

Local Keep supports optional vector search over text notes and whiteboard text.
It uses an **OpenAI-compatible** `POST /embeddings` API; the default provider is
SiliconFlow (`https://api.siliconflow.cn/v1`, e.g. `BAAI/bge-m3`).

The feature is **admin-configured**. When an admin saves a valid base URL, API key,
and model, indexing starts in the background and existing notes are queued.

## Configure

Avatar menu → **✨ Semantic search** (admin only), or:

```http
GET /api/admin/embeddings
PUT /api/admin/embeddings
POST /api/admin/embeddings/test
POST /api/admin/embeddings/reindex
```

Example configuration:

```json
{
  "enabled": true,
  "baseUrl": "https://api.siliconflow.cn/v1",
  "apiKey": "sk-...",
  "model": "Qwen/Qwen3-Embedding-8B",
  "dimensions": 4096,
  "chunkSize": 1200,
  "chunkOverlap": 180
}
```

- The API key is encrypted at rest with AES-256-GCM using a key derived from
  `data/server_secret`; the API only returns `hasApiKey` and a mask.
- Saving probes the model once to detect dimensions. If dimensions are supplied,
  they must match the model's actual output.
- `Test connection` does not save anything.
- `Rebuild index` re-queues every note with `force`.
- `Reset index` drops all embedding chunk/vector tables, clears model/index metadata, and reindexes with the current model/variant. It does not delete the note database or the embedding key.
- Changing the chunk size/overlap forces a re-index.
- `dimensions` defaults to 4096 for `Qwen/Qwen3-Embedding-8B` (2560 for 4B, 1024 for 0.6B). Qwen3 accepts 64–4096 depending on the model; for other models leave it empty and use the native dimensions from the connection probe.

## Rerank (optional)

Rerank is configured in the same admin dialog. It is **optional**:

- If disabled (default), semantic search uses vector similarity only.
- If enabled, the vector candidates are reordered by a `/rerank` call before the
  results are returned.
- If the reranker fails, search gracefully falls back to vector order and includes
  a `rerank.error` in the response; it does not fail the search.

Typical values:

```json
{
  "rerankEnabled": true,
  "rerankBaseUrl": "",
  "rerankApiKey": "",
  "rerankModel": "BAAI/bge-reranker-v2-m3"
}
```

- Empty rerank base URL/key means “use the embedding base URL/key”.
- A separate rerank key is encrypted at rest the same way as the embedding key.
- `Test rerank` verifies the endpoint without saving.
- Hybrid search keeps the RRF combination; rerank improves the semantic half.
- The rerank model does not partition vector tables; only the embedding model does.

## Model-name partitioning

The model name is the partition key:

| Situation | Behavior |
|---|---|
| Same model + same dimensions | Reuses the existing `embedding_models` row, vector table, and chunks |
| Same model + different dimensions (variant) | Creates a separate vector table keyed by model + dimensions |
| New model name | Creates a new vector table; old tables are preserved |
| Switch back | Reuses the original model/variant table and its indexed chunks |

Vector tables are named by a hash of `model + variant` (`emb_<hash>`), so neither
model names nor variants are interpolated directly into SQL. `variant` is the
dimensions string, so the same model at 4096 and 1024 dimensions has independent
tables. Metadata lives in `embedding_chunks_emb_<hash>`; vectors live in a
`sqlite-vec` `vec0` virtual table `embedding_vec_emb_<hash>` using cosine distance.

Switching models does not delete the old table. This is deliberate: switching back
is instant for unchanged notes, and deleting a model should be an explicit admin
operation in a future version.

## Chunking and indexing

- Text notes: markdown is converted to plain text, then chunked by paragraphs.
- Whiteboards: canvas text is extracted and chunked the same way.
- Defaults: `1200` characters per chunk with `180` characters overlap; configurable
  from 200–4000 chars.
- Each embedding input is prefixed with the note title for context; the stored
  chunk body does not include the prefix.
- Chunk rows record note/revision, chunk index, content, char count, and content
  hash.
- Indexing is queued per note and processed by a bounded background worker pool.
  Each note's chunks are sent as **array inputs** (`input: ["...", "..."]`) in
  batches, and batches/notes run in parallel according to the Advanced
  indexing values stored in `embedding_settings`. Head edits, canvas checkpoints,
  archive/restore, and note creation enqueue the note automatically. Archived/
  purged notes remove their chunks.
- Qwen3 dimensions: `Qwen/Qwen3-Embedding-8B` defaults to 4096; the API also accepts
  64–4096. Changing dimensions creates a new variant table and requires a re-index.
- Runtime batch controls are stored in SQLite (`embedding_settings`) and are
  editable under **Semantic search → Advanced indexing**:

  - `batch_size` (1–128): inputs per request
  - `concurrency` (1–8): parallel requests within a note
  - `note_concurrency` (1–8): parallel notes
  - `max_batch_chars`: character budget per request

  Defaults for Qwen3-Embedding-8B are `64 / 2 / 1 / 80000`. Saving the admin
  form applies new batch/concurrency values to the **next note without restarting**;
  `note_concurrency` applies to the next background run.
  There is no separate tuning JSON file or environment layer to manage.

  Total in-flight requests are roughly `note_concurrency × concurrency`. Lower
  them if the provider returns `429`/TPM limits.
- The SiliconFlow embeddings endpoint accepts an array of strings in one request;
  each item is still subject to the model's per-input token limit (e.g. 512 for
  `BAAI/bge-large-*`, 8192 for `BAAI/bge-m3`). Keep the chunk size within that
  limit; batching does not make an overlong individual chunk valid.
- `429` and `5xx` responses are retried with `Retry-After`/exponential backoff.
- If the note changes while embeddings are in flight, the result is discarded and
  the note is queued again.
- Old vectors remain searchable until the new transaction commits, so a provider
  outage does not erase the existing index.

## Search

### UI

Click the ✨ button in the search field to use semantic search; otherwise search
remains keyword/FTS. If semantic search is not configured or the provider fails,
the UI falls back to keyword search and shows a notice.

### REST

```http
GET /api/search/semantic?q=...
GET /api/search/hybrid?q=...
```

### MCP

- `search_notes` supports `mode: "keyword" | "semantic" | "hybrid"` (default keyword).
- `semantic_search` is a dedicated vector-search tool.
- Results include note/revision timestamps, tags, links, chunk index, and
  `semantic_score` where applicable.

Hybrid search uses reciprocal rank fusion (RRF) over keyword and semantic result
lists; it is usually the best default for mixed exact terms and concepts.

## Recommended defaults

- Model: `BAAI/bge-m3` (multilingual, long context) or a Qwen3 embedding model.
- Chunk size: 1000–1500 chars; overlap 15–20%.
- Use hybrid search for everyday queries; semantic-only for paraphrase/recall.
- Keep the embedding model stable. Changing models is supported, but each model
  has its own table and requires a re-index.

## Limits / future work

- Rerank is optional and currently applies to the semantic candidate list; it does
  not replace the keyword index or RRF.
- No per-note permissions; semantic results respect the current head/archived/tag
  filters.
- Model tables are preserved indefinitely; explicit model deletion/pruning is a
  future admin operation.
- The embedding API key is decrypted only in the server process; never expose it
  through MCP or REST.
