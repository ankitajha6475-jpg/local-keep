## Context

UI dimensions were embedded in component CSS (note modal 620px, link dialog 520px, graph 1100×760, links panel 1100×780). There is no general application config layer: MCP limits and embedding settings have dedicated tables and services, but no shared UI configuration.

## Goals / Non-Goals

**Goals:**
- Raise the note editor default to a comfortable width.
- Load defaults from a human-editable file.
- Allow admins to change dimensions at runtime without restarting or editing code.
- Apply changes to open browsers.
- Keep validation central and bounded.

**Non-Goals:**
- Per-user preferences or per-note sizes.
- Configuring colors, fonts, or unrelated server settings.
- Hot-reloading the config file on disk; a restart re-reads it. Runtime overrides do not need a restart.

## Decisions

### Decision 1: One typed field list shared by client and server

`src/shared/uiConfig.js` defines every field (key, label, min, max, step, default). The config loader clamps file values with the same bounds; the admin service rejects invalid runtime values with a 400 instead of silently clamping.

### Decision 2: File defaults plus database overrides

`config.json` is read at startup from `LOCAL_KEEP_CONFIG` or `process.cwd()/config.json`. `app_settings(key='ui')` stores a JSON patch of admin overrides. Effective config is `{...fileDefaults, ...overrides}`. Deleting the key restores file defaults.

### Decision 3: CSS custom properties

The client applies effective values to `#app` as CSS variables:
`--note-modal-width`, `--note-modal-height`, `--link-dialog-width`,
`--graph-width`, `--graph-height`, `--links-panel-width`, `--links-panel-height`.
Components use `min(var(--x, fallback), viewport)` so large values still fit small screens. Manual note-modal resizing continues to use inline styles and wins until the modal closes.

### Decision 4: REST + WebSocket

`GET /api/config` is available to every authenticated user. Admin read/write/reset live under `/api/admin/config`. Successful writes and resets broadcast `{ type: 'config', config: { ui } }`; clients also receive the effective config during the WebSocket handshake.

### Decision 5: Admin-only runtime UI

The account menu gains **🎛 Interface** for admins. It shows file path, file parse errors, all bounded fields, Save and Reset-to-file actions. Changes apply to all users because the workspace is shared.

## Risks / Trade-offs

- **[Risk] An admin sets an extreme width** — bounds are 480–2400 px, and CSS still caps at 94–96vw.
- **[Risk] Config file is invalid** — startup falls back to built-in defaults and the admin dialog reports the parse error.
- **[Risk] Two sources of truth** — the effective value is always shown in the admin form; overrides are stored separately and can be reset.
- **[Risk] File edits do not hot reload** — documented; runtime UI is the no-restart path.

## Migration Plan

Migration 12 creates `app_settings`; no data backfill. Existing installs immediately use the 960px default from `config.json` and can override it at runtime.

## Open Questions

none.
