## 1. Capability specs

- [x] 1.1 Write `live-text-collab` delta covering shared drafts, explicit saves, presence, reset/discard, caret handling, and protocol; verify `openspec validate --strict`
- [x] 1.2 Write `semantic-search` delta covering provider config, model/dimension partitions, index freshness, search modes, rerank, and reset; verify `openspec validate --strict`
- [x] 1.3 Write `whiteboard-metadata` delta covering title persistence, cover preservation, and WebSocket events; verify `openspec validate --strict`
- [x] 1.4 Extend `mcp-server` with stable sessions, multiple write leases, state shape, admin limits, token governance, and save semantics; verify modified blocks match the existing requirement names
- [x] 1.5 Extend `markdown-editor` for Visual/Source, dirty-only serialization, Mermaid, and save/image failure behavior; verify no Preview-mode requirement remains

## 2. Evidence and consistency

- [x] 2.1 Map each new scenario to an existing test suite or documented manual check; record gaps in the change notes
- [x] 2.2 Run `npm test` and `npm run build` to confirm the documented behavior is the shipped behavior
- [x] 2.3 Run `openspec validate retrofit-recent-runtime-specs --strict` and fix any delta/format errors
- [x] 2.4 Confirm no runtime, API, schema, or dependency changes are included in this change

## 3. Sync and close

- [x] 3.1 Sync the delta specs into `openspec/specs/` with the OpenSpec sync workflow
- [x] 3.2 Update stale capability purposes where the delta schema does not carry a Purpose section (notably `markdown-editor`)
- [x] 3.3 Archive the change and verify `openspec list --json` shows no active change
- [x] 3.4 Verify the archived change and updated main specs are present under `openspec/changes/archive/` and `openspec/specs/`
