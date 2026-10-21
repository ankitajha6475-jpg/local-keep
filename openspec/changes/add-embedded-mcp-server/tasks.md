## 1. Tokens and auth

- [x] 1.1 Add migration `003-api-tokens` creating `api_tokens`; verify migration test
- [x] 1.2 Add token service (create/list/revoke/verify, hashing, last-used throttle); verify unit tests
- [x] 1.3 Extend `checkAuth` to accept bearer tokens and set actor; add `/api/mcp/tokens` routes; verify API tests
- [x] 1.4 Add CLI token create/list/revoke and npm script; verify commands

## 2. Search service

- [x] 2.1 Extract `src/server/services/search.js` with FTS, tag/type/date filters, timestamps, snippets, tags, link counts, render summary; verify tests
- [x] 2.2 Keep REST `/api/search` ID-array compatibility while using the shared query; verify API test

## 3. MCP server

- [x] 3.1 Add `src/mcp/createServer.js` with search/list/get/create/edit/append/thread tools; verify tool tests
- [x] 3.2 Add links/backlinks/graph/tags tools; verify tests
- [x] 3.3 Add whiteboard pages/render-request tools with image content blocks; verify tests
- [x] 3.4 Add change feed, archive/restore/promote tools; verify tests
- [x] 3.5 Add resources for notes/revisions/threads/backlinks/tags/whiteboard pages; verify resource tests
- [x] 3.6 Mount `/mcp` with MCP auth and `toNodeHandler`; add Vite proxy; verify `tools/list`/`tools/call`
- [x] 3.7 Add render-request waiter and actor/notice integration; verify browser/WS test

## 4. Client and docs

- [x] 4.1 Add MCP settings modal (list/create/revoke/copy token); verify build
- [x] 4.2 Add `mcp-stdio.js` adapter and npm script; verify startup
- [x] 4.3 Add `doc/mcp.md` with HTTP/stdio config examples and security notes; update README/AGENTS/CHANGELOG/plan
- [x] 4.4 Run `npm test` and `npm run build`; verify pass
- [ ] 4.5 Manually test search timestamps, thread tree, whiteboard images, concurrent branch notice via MCP Inspector/client
