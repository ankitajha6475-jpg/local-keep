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
  "model": "BAAI/bge-m3",
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
- Changing the chunk size/overlap forces a re-index.

## Model-name partitioning

The model name is the partition key:

| Situation | Behavior |
|---|---|
| Same model name | Reuses the existing `embedding_models` row, vector table, and chunks |
| New model name | Creates a new vector table; old tables are preserved |
| Switch back | Reuses the original table and its indexed chunks |
| Same name, different dimensions | Rejected (`dimension_mismatch`); use a new model name |

Vector tables are named by a hash of the model name (`emb_<hash>`), so model names
are never interpolated directly into SQL. Metadata lives in
`embedding_chunks_emb_<hash>`; vectors live in a `sqlite-vec` `vec0` virtual table
`embedding_vec_emb_<hash>` using cosine distance.

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
- Indexing is queued per note and processed sequentially in a background worker.
  Head edits, canvas checkpoints, archive/restore, and note creation enqueue the
  note automatically. Archived/purged notes remove their chunks.
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

- No reranker yet (SiliconFlow also exposes rerank).
- No per-note permissions; semantic results respect the current head/archived/tag
  filters.
- Model tables are preserved indefinitely; explicit model deletion/pruning is a
  future admin operation.
- The embedding API key is decrypted only in the server process; never expose it
  through MCP or REST.
