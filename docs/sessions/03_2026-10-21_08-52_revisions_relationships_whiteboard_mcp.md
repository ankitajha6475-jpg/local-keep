# Session Log: revisions, relationships, tags, whiteboard pages, and embedded MCP

- **Date**: 2026-10-21 08:52
- **Commit**: `1e4de5195c71a359782aac9c7519e24eb274d2c6` — feat: add revisions, relationships, tags, whiteboard pages, and MCP

## Changed Files

| File | Change |
|------|--------|
| `server.js` | Split schema/service wiring; revision/archive/tag/link/graph/render/MCP routes; bearer auth |
| `package.json`, `package-lock.json` | Markdown, d3-force, MCP SDK, zod, jsdom dependencies; test/MCP scripts |
| `vite.config.js` | Proxy `/mcp` to the Express backend |
| `AGENTS.md`, `README.md`, `CHANGELOG.md` | Document the new architecture, commands, features, and gotchas |
| `mcp-stdio.js` | Optional stdio MCP adapter using the shared services |
| `scripts/mcp-token.js` | CLI for creating/listing/revoking MCP tokens |
| `docs/mcp.md` | MCP endpoint, token, client config, tools/resources, security guide |
| `docs/relationships-and-tags.md` | Wiki-link/tag syntax and usage guide |
| `docs/whiteboard-pages.md` | Page rendering algorithm, UI, API, and MCP behavior |
| `docs/plan-docs/2026-10-21-relationships-tags-history-mcp-plan.md` | Original architecture plan, updated with implementation status and backups |
| `src/server/db.js`, `src/server/schema.js`, `src/server/events.js`, `src/server/fts.js`, `src/server/images.js`, `src/server/canvas.js` | Database/migration runner, backup, base schema, event bus, FTS, image store, canvas hashing/lean data |
| `src/server/migrations/001-note-threads.js`, `002-relationships-and-tags.js`, `003-api-tokens.js` | Revision/head backfill, tag/link backfill, MCP token table |
| `src/server/services/notes.js`, `revisions.js`, `imageRefs.js` | Head CRUD, immutable revisions/branches, archive/purge, history, revision-aware image refs |
| `src/server/services/tags.js`, `links.js`, `search.js`, `renders.js`, `tokens.js` | Tag tree/filter, wiki-link resolution/backlinks/graph, rich search, page manifests/staleness, MCP tokens |
| `src/shared/notesText.js`, `markdownCode.js`, `tags.js`, `links.js` | Server/client-safe display text, code-aware transform, tag/wiki-link parsers |
| `src/utils/notes.js` | Compatibility re-export of shared note text |
| `src/utils/markdown.js`, `editorSerialize.js`, `whiteboardTiles.js` | Sanitised renderer/Turndown, contentEditable serialiser, reading-order page planner |
| `src/components/TagSidebar.vue`, `GraphView.vue`, `GraphCanvas.vue`, `BacklinksPanel.vue` | Tag tree/filter, relationship graph, backlinks drawer |
| `src/components/WhiteboardEditor.vue` | Page export/upload/manifest, Pages drawer, render requests, checkpoint on leave |
| `src/collab/collabManager.js` | Checkpoint, render-request/render-updated callbacks |
| `src/App.vue` | Stable editing identity, history/archive UI, tag chips/sidebar, graph/backlinks, markdown modes, MCP settings |
| `src/mcp/createServer.js` | MCP tools/resources for search, notes, revisions, threads, links, tags, graph, whiteboards, changes, archive/restore/promote |
| `tests/editorSerialize.test.js`, `markdown.test.js`, `notesText.test.js`, `parsers.test.js`, `whiteboardTiles.test.js` | Renderer/serialiser, text, parser, and page-planner unit tests |
| `tests/migration.test.js`, `revisions.test.js`, `tokens.test.js`, `renders.test.js`, `relationships.test.js` | Migration, revision/branch, token, render, tag/link service tests |
| `tests/notesApi.test.js`, `relationshipsApi.test.js`, `rendersApi.test.js`, `whiteboardRevisions.test.js`, `mcp.test.js` | HTTP/WS/MCP integration tests |
| `tests/helpers/testDb.js`, `tests/helpers/serverProcess.js` | Temp DB/service and ephemeral server helpers |
| `openspec/changes/add-note-threads-and-revisions/{proposal.md,design.md,tasks.md,specs/note-threads/spec.md,.openspec.yaml}` | Stable identity/revision/history/archive change |
| `openspec/changes/add-markdown-editor-modes/{proposal.md,design.md,tasks.md,specs/markdown-editor/spec.md,.openspec.yaml}` | Markdown renderer/modes/paste change |
| `openspec/changes/add-relationships-and-tags/{proposal.md,design.md,tasks.md,specs/note-relationships/spec.md,specs/note-tags/spec.md,.openspec.yaml}` | Wiki links/backlinks/graph/tags change |
| `openspec/changes/add-whiteboard-page-rendering/{proposal.md,design.md,tasks.md,specs/whiteboard-pages/spec.md,.openspec.yaml}` | Whiteboard page planner/export/manifest change |
| `openspec/changes/add-embedded-mcp-server/{proposal.md,design.md,tasks.md,specs/mcp-server/spec.md,.openspec.yaml}` | Embedded MCP transport/auth/tools/resources change |

## Details

This is the full implementation of the five OpenSpec slices derived from the wishlist:
note threads/revisions, markdown editor modes, relationships/tags, whiteboard page
rendering, and embedded MCP.

Key behaviors:

- `notes.id` is the stable document identity; `note_revisions` is append-only. Text saves
  create revisions, stale bases branch by default, and `take_head` is the explicit
  override. Deletion archives by default; `?purge=1` is permanent.
- The live database was migrated through versions 1–3. The 89 existing notes became 89
  revision-1 rows with unchanged content. Backups:
  `data/backups/pre-note-threads-2026-10-20T23-51-12-328Z.db` and
  `data/backups/pre-migration-v2-2026-10-21T00-24-54-697Z.db`.
- Text notes use a sanitised marked+DOMPurify renderer and Write/Markdown/Preview modes.
  Rich paste is converted with Turndown; `data:image` refs are uploaded and rewritten.
- Wiki links are code-aware, resolve by unique title or explicit `note:<id>`, and expose
  backlinks, a d3-force graph, and a stable link status. Tags are hierarchical, code-aware,
  and shown in a tree with unique-note counts and descendant filtering.
- Whiteboards are planned into reading-order pages (bands + x-sort, greedy packing),
  exported sequentially in the browser, and stored as ordered manifests with staleness.
- `/mcp` is mounted on the same Express server using MCP SDK v2. Bearer tokens are hashed
  in `api_tokens`, named `mcp:<name>` actors, and can be managed via REST/CLI/UI. Tools
  cover search (timestamps), notes/revisions, thread trees, links/tags/graph, whiteboard
  images, change feed, and archive/restore/promote. A stdio adapter is included.

Verification:

- `npm test`: 55/55 passing.
- `npm run build`: passing.
- `openspec validate --strict`: all five changes valid.
- Real MCP endpoint smoke-tested with `tools/list` and `search_notes` through both
  `:5173/mcp` and the Vite `:5174/mcp` proxy.
- Remaining unchecked OpenSpec tasks are manual browser acceptance items (visual paste,
  graph/pages UI, and MCP Inspector flows), not missing functionality.
