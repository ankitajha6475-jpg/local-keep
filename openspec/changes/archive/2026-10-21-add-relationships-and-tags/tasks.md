## 1. Shared parsers

- [x] 1.1 Move `transformOutsideCode` to `src/shared/markdownCode.js` and re-export/use it in the client renderer; verify markdown tests
- [x] 1.2 Add `src/shared/tags.js` with normalisation, code-aware parsing, hierarchy rules, dedupe/limits; verify parser tests
- [x] 1.3 Add `src/shared/links.js` with code-aware wiki-link parsing, labels, explicit ids, limits; verify parser tests

## 2. Schema and migration

- [x] 2.1 Add migration `002-relationships-and-tags` creating `note_tags`/`note_links` and indexes; verify migration test
- [x] 2.2 Backfill tags/links from existing head content and canvas text; verify legacy migration test
- [x] 2.3 Include migration 002 in the runner/tests and rehearse on a copy of the live DB; verify backup/version 2

## 3. Services

- [x] 3.1 Add tag service: sync note tags, tag tree with direct/subtree counts, batch tags-by-note, descendant filter; verify tests
- [x] 3.2 Add link service: sync source links, global title resolution, outgoing/backlinks with context, graph BFS; verify tests
- [x] 3.3 Integrate tag/link sync into create/commit/checkpoint; branches must not change head tags/links; verify tests
- [x] 3.4 Update archive/restore/purge to refresh/remove tags/links; verify tests
- [x] 3.5 Enrich note DTOs with tags and link/backlink counts; verify API tests

## 4. REST API

- [x] 4.1 Add `GET /api/tags` tree endpoint; verify test
- [x] 4.2 Add `tag`/`exactTag` filters to note list and search; verify test
- [x] 4.3 Add `GET /api/notes/:id/links` and `/backlinks`; verify test
- [x] 4.4 Add `GET /api/graph` with note/depth/tag/limit; verify test

## 5. UI

- [x] 5.1 Add `TagSidebar.vue` with collapsible tree, counts, untagged/archived filters; verify build
- [x] 5.2 Add tag chips to cards, tag filter breadcrumb, and search/tag combination; verify build
- [x] 5.3 Add a backlinks panel to the editor; verify build
- [x] 5.4 Add `GraphView.vue`/`GraphCanvas.vue` with `d3-force`, click-to-open, zoom/pan; verify build
- [x] 5.5 Wire internal-link clicks from gallery/editor/preview with unsaved-change confirmation; verify build

## 6. Verification and docs

- [x] 6.1 Run `npm test` and `npm run build`; verify pass
- [x] 6.2 Update `CHANGELOG.md`, `AGENTS.md`, and the architecture plan status
- [x] 6.3 Manually create links/tags, check backlinks, graph, tag tree/filter, and archived target behavior
- [x] 6.4 Check existing notes for false tags/links from code blocks
