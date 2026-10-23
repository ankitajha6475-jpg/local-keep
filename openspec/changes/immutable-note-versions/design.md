# Design — Immutable Versioned Notes

## Context

`note_revisions` is already append-only (immutable) with `parent_revision_id` forming a version tree and monotonically increasing `revision_no`; the head (`notes`) is a mutable materialized copy of the latest revision. `note_links.target_note_id` resolves to the head only — there is no version-pinned link target. Images are content-addressed (`data/images/<sha256>` + `revision_image_refs`); text snapshots are duplicated per revision even though `snapshot_hash` is already computed. `editingRevisionNo` is tracked in the client but not shown anywhere outside the history overlay. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Surface the current version number on the History button.
- Make cross-note references version-pinned and stable against target edits.
- Give each note an explicit, automatic link to its own version history (old→new chain).
- Keep every version permanently addressable (immutability is user-visible and load-bearing).

**Non-Goals:**
- Changing the stable note-identity contract (`notes.id` stays the document id).
- Rewriting the head/branch concurrency model (branch-on-stale-save stays).
- Auto-inserting wiki-links into note bodies (would pollute canonical markdown).
- Server-side CAS re-architecture of the whole storage layer in the first iteration.

## Decisions

### D1. Version bubble on the History button
Show `revision_no` as a small badge on the existing History button (e.g. "🕘 History" with a `v3`/`3` bubble). Source the number from `editingRevisionNo` (already tracked). Rationale: pure display of existing data, no schema change. Alternative: show the version on the dashboard card too — deferred (keeps the change small).

### D2. Version-pinned cross-note references (immutable, stable)
Add `note_links.target_revision_id` (nullable FK → `note_revisions.id`). A wiki link records the immutable revision it references and keeps that reference unchanged when the target later gets a new version. Pin syntax: support explicit `[[note:<id>@<rev>]]`, and auto-pin a bare `[[note:<id>]]`/title link to the target's head revision at link-creation time (so "refer to previous version" holds without requiring the author to know revision numbers).

Display semantics: render the **pinned (frozen)** revision — matches "refer to previous version … keep their reference unchanged." Rationale: the whole point of immutability is that a referenced version is permanent and unchanging. Alternative considered: **live** display (render the target's latest version, keep the pin only as provenance). This is a one-line resolution change and is the lower-risk, non-breaking default; it is the primary open question for the reviewer (see below).

### D3. Automatic old→new version-chain link
On every commit that appends a revision, create an explicit **structural** version link from the new revision to its `parent_revision_id` (the old→new chain). Surfaced as version links in the history tree / backlinks / graph. Rationale: `parent_revision_id` already encodes the chain; making it an explicit, surfaced link satisfies "a natural link … automatically added" without touching note bodies. Alternative: auto-insert a `[[prev-version]]` content wiki-link — rejected (pollutes canonical markdown and breaks the Visual/Source round-trip).

### D4. Content-addressed text snapshots (staged/optional)
Deduplicate a new revision's text snapshot against its predecessor by `snapshot_hash` (CAS-style), matching the immutable-snapshot model and the "save CAS between new node and its predecessor" note. Staged behind the core work; images are already CAS. Alternative: keep inline `title`/`content` per revision — simplest, but duplicates storage across versions.

## Risks / Trade-offs

- **Frozen references change link-display semantics** (a link to note B shows B's pinned version, not B's latest) → this is **BREAKING** relative to today. Mitigation: migrate existing links to pin their current target's head revision, and offer a "show latest" affordance so the frozen default is reversible.
- **Reviewer may prefer live display** → the display mode is isolated in resolution (`resolveRow`/`resolveWikiLink`); switching frozen↔live is a contained change, and pinning (`target_revision_id`) is needed either way.
- **Migration complexity** (new column + backfill) → follow AGENTS.md migration conventions: `VACUUM INTO` backup, single transaction, fail-closed; `target_revision_id` is additive and nullable.
- **CAS dedup couples revisions to shared blobs** → garbage-collection must keep any blob referenced by a live revision; staged behind the core work and protected by `revision_image_refs`-style ref tracking.

## Migration Plan

1. Migration adds `note_links.target_revision_id` (nullable). Backfill: for each existing link with a resolved `target_note_id`, set `target_revision_id` to that note's current `head_revision_id` (pin the present version). Idempotent; runs after the note-threads/relationships migrations per AGENTS.md ordering.
2. Deploy: server reads/writes the pin; clients render the pinned version (or latest, per D2 resolution). No change to note identity or the head/branch model.
3. Rollback: `target_revision_id` is additive/nullable — a rollback can ignore it (links fall back to head resolution) or drop the column.

## Open Questions

- Exact badge styling/placement for the version bubble (purely cosmetic).
- Whether CAS text dedup (D4) ships in the first iteration or is staged after the reference/link work.
- **Reviewer decision requested:** reference display — frozen (recommended, matches the stated requirement) vs. live (lower-risk default). This does not block the version bubble but should be confirmed before building D2/D3.
