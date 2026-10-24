# Immutable Versioned Notes

## Why

Notes already keep an immutable revision history (`note_revisions` is append-only, restore/promote append rather than rewrite), but that immutability is neither surfaced nor exploited. The History button does not tell you which version you are on, cross-note wiki links always resolve to the mutable head (so a reference silently drifts when the target is edited), and a note's connection to its own version history exists only implicitly as a parent pointer. This change makes versions first-class: each version is a permanent, addressable snapshot; a reference pins the exact immutable version it was made to and keeps that reference unchanged; and every note is automatically linked to its own version history.

## What Changes

- The History button shows the current version number as a **bubble/badge** (e.g. a `3` badge next to "🕘 History").
- Cross-note wiki links become **version-pinned**: a link records the immutable revision it references and keeps that reference unchanged even after the target note is later edited. **BREAKING** to link-resolution semantics (see open question below on display behaviour).
- A **natural, automatically-added link** connects a note to each of its history revisions (the old→new version chain), surfaced alongside the existing history/backlinks views.
- (Staged/optional) text snapshots are content-addressed so a new version shares storage with its predecessor (CAS), matching the immutable-snapshot model.

## Open design questions (need confirmation before the model work is built)

These were the questions raised when scoping; the reviewer's answer determines the design. Design.md records the options and a recommended default for each.

1. **Reference display** — when note A links to note B and B is later edited, does A render B's *frozen* (pinned, immutable) version, or B's *latest* version with the pin kept as provenance?
2. **History-link form** — is the old→new version link a *structural* link (data-level, shown in history/graph) or a *content* wiki-link auto-inserted into the note body?
3. **Pin syntax** — are links auto-pinned to the target's revision at link time, or is the version written explicitly (e.g. `[[note:<id>@<rev>]]`)?

## Capabilities

### New Capabilities

- (none — the behaviours extend existing capabilities)

### Modified Capabilities

- `note-threads`: surface the current revision number as a version bubble on the History button; expose the automatic old→new version-chain link between a note and its history revisions; strengthen the immutability guarantee (revisions are permanent, addressable snapshots).
- `note-relationships`: version-pinned link targets — a wiki link records and keeps a reference to the specific immutable revision it targets, instead of always resolving to the mutable head.

## Impact

- `src/App.vue` — History button version bubble; rendering of version-pinned links (frozen vs. live target).
- `src/shared/links.js`, `src/server/services/links.js` — optional `@<rev>` pin syntax; `note_links.target_revision_id`; pinned resolution.
- `src/server/migrations/` — add `note_links.target_revision_id`; (optional) CAS blob tables keyed by `snapshot_hash`.
- `src/server/services/revisions.js` — auto-create version-chain links on commit; (optional) CAS dedup against the predecessor's `snapshot_hash`.
- MCP link/thread tools (`get_links`, `get_backlinks`, `get_graph`, `get_thread`) — expose version-pinned targets and version-chain links.
- `CHANGELOG.md` — user-visible behaviour entry.
