## Why

The note editor opens at 620px wide, which is cramped for markdown editing, tables, and the expanded toolbar. Interface dimensions are hard-coded across several components, so changing them requires code edits.

## What Changes

- Widen the default note editor modal to 960px and make its height configurable.
- Add a JSON config file (`config.json`, overridable with `LOCAL_KEEP_CONFIG`) for interface defaults.
- Add runtime admin overrides persisted in the database and exposed through `GET /api/config` and `/api/admin/config`.
- Broadcast runtime changes over WebSocket so open clients apply new dimensions immediately.
- Add an admin **🎛 Interface** dialog for editing and resetting dimensions.
- Apply the same configuration to the link dialog, relationship graph, and selection-links panel.
- Add migration 12 (`app_settings`) for persisted overrides.

## Capabilities

### New Capabilities

- `interface-config`: config-file defaults, runtime admin overrides, live broadcast, and configurable UI dimensions.

### Modified Capabilities

- `markdown-editor`: the note editor modal uses the configured default width/height.

## Impact

- **Affected code**:
  - `config.json` — committed defaults (`960×760` note editor)
  - `src/shared/uiConfig.js` — field definitions, defaults, clamping
  - `src/server/config.js` — config file loader (`LOCAL_KEEP_CONFIG`)
  - `src/server/services/uiSettings.js` — persisted runtime overrides
  - `src/server/migrations/012-app-settings.js` — `app_settings` table
  - `server.js` — routes, WS config push, service wiring
  - `src/App.vue` — CSS variables, config fetch, admin dialog
  - `GraphView.vue`, `LinkDialog.vue`, `SelectionLinksPanel.vue` — consume CSS variables
  - tests for config parsing, service persistence, and API
  - `CHANGELOG.md`, `AGENTS.md`
- **No changes to note data or existing APIs.**
- **Config file changes require a restart; runtime overrides apply immediately.**
