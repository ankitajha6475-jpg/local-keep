## Context

This is a documentation retrofit for behavior already shipped in commits after the last archived OpenSpec change. The existing main specs are the baseline; `mcp-server` and `markdown-editor` are extended in place, while live text, semantic search, and whiteboard metadata get new capability specs. Runtime code, tests, and migrations are the source of truth for the requirements.

## Goals / Non-Goals

**Goals:**

- Make the main specs describe the behavior agents and maintainers actually depend on.
- Keep deltas small enough to review and testable as scenarios.
- Preserve existing capability names/paths so archive/sync does not rewrite history.
- Record the MCP state compatibility rule (`writes` authoritative, `write` legacy).

**Non-Goals:**

- No runtime, API, database, or dependency changes.
- No rewrite of unrelated historical specs.
- No new requirement for behavior that is not already implemented and tested.
- No attempt to document every internal helper; specs stay behavioral.

## Decisions

### D1: Retrofit through a normal OpenSpec change

Use a normal change with proposal/specs/design/tasks and archive it after syncing. Alternatives: edit `openspec/specs/` directly (loses the audit trail) or leave the specs stale (rejected because the next change would start from incorrect requirements).

### D2: Extend the existing MCP capability instead of splitting it

Keep `mcp-server` as the single capability. Persistent sessions, admin tokens, and session limits are part of the same transport/auth/tool contract, so splitting them would make cross-cutting scenarios harder to follow.

### D3: Model live text and semantic search as new capabilities

Both have distinct invariants (Yjs draft-vs-revision; index partition/freshness) and are independently testable. New capability files keep the MCP spec focused on the machine-facing facade.

### D4: Treat whiteboard title/cover as metadata, not page rendering

The existing `whiteboard-pages` spec owns page planning/export/manifests. Title and cover durability are note-metadata concerns with their own WebSocket and persistence rules, so they get `whiteboard-metadata`.

### D5: Backward-compatible MCP state shape

Specify `state.writes` as the authoritative list and retain `state.write` as the first write for older clients. This avoids breaking existing agents while allowing multiple sub-agents to share a token.

## Evidence

- Live text: `tests/textCollab.test.js`, `tests/textCollabApi.test.js`
- Semantic search: `tests/embeddings.test.js`, `tests/embeddingsApi.test.js`, `tests/embeddingsClient.test.js`
- MCP sessions/tokens: `tests/mcp.test.js`, `tests/mcpEditing.test.js`, `tests/adminTokensApi.test.js`, `tests/tokens.test.js`
- Whiteboard title/cover: `tests/whiteboardRevisions.test.js`
- Markdown/editor: `tests/markdown.test.js`, `tests/editorSerialize.test.js`
- Migrations: `tests/migration.test.js`, `tests/migrationAuth.test.js`

## Risks / Trade-offs

- **Specs describe code that may drift again** → Keep the OpenSpec task list in the normal workflow; update specs with each future behavior change.
- **Too much detail in specs** → Requirements describe observable contracts; implementation details stay in design/tasks and docs.
- **Delta merge loses context** → For modified requirements, copy the complete existing requirement block and edit it, rather than adding contradictory fragments.
- **Retrofit hides missing tests** → Link each scenario to an existing test suite during review; add tests only if a scenario has no acceptance evidence.

## Migration Plan

1. Validate the change with `openspec validate`.
2. Sync the delta specs into `openspec/specs/`.
3. Archive the change under `openspec/changes/archive/`.
4. Use the synced specs as the baseline for the next change.

Rollback: restore the previous `openspec/specs/` files and move the archived change back; no runtime state is affected.
