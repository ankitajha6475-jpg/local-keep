## 1. Config definitions and file

- [x] 1.1 Add shared bounded UI field definitions and defaults
- [x] 1.2 Add `config.json` with the wider note editor default
- [x] 1.3 Add `LOCAL_KEEP_CONFIG`-aware loader with safe fallbacks

## 2. Runtime settings

- [x] 2.1 Add migration 12 for `app_settings`
- [x] 2.2 Add `uiSettings` service with validation, persistence, and reset
- [x] 2.3 Wire migration/service into `server.js` and test helpers

## 3. API and live updates

- [x] 3.1 Add authenticated `GET /api/config`
- [x] 3.2 Add admin `GET/PUT/DELETE /api/admin/config`
- [x] 3.3 Broadcast config updates and send config on WS connect

## 4. Client UI

- [x] 4.1 Apply config as CSS variables on `#app`
- [x] 4.2 Use variables in note modal, link dialog, graph, and links panel
- [x] 4.3 Fetch config after login and update from WS
- [x] 4.4 Add the admin Interface dialog with save/reset

## 5. Verification and docs

- [x] 5.1 Add config parsing, service, and API tests
- [x] 5.2 Update migration expectations
- [x] 5.3 Run `npm test` and `npm run build`
- [x] 5.4 Update `CHANGELOG.md`, `AGENTS.md`, and config documentation
- [x] 5.5 Run `openspec validate --strict` and archive the change
