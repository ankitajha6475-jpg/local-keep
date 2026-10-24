## 1. Version bubble (D1)

- [x] 1.1 Add a version badge to the History button in the editor header showing the current `revision_no`; verify it displays the head version (e.g. `3`) when a note is opened
- [x] 1.2 Verify the badge advances on save/restore/promote and reflects a remote revision (WS `text-saved`/`note-revised`), not a client-side counter

## 2. Version-pinned references (D2)

> Confirm the reference-display semantic (frozen vs. live — see design.md D2/Open Questions) before implementing 2.4. Pinning (`target_revision_id`, 2.1–2.3) is required either way.

- [x] 2.1 Migration: add nullable `note_links.target_revision_id`; backfill existing resolved links to their target's current `head_revision_id`; verify it is idempotent and follows AGENTS.md migration conventions (backup, single transaction, fail-closed)
- [x] 2.2 Parser: support explicit `[[note:<id>@<rev>]]` and auto-pin bare `[[note:<id>]]`/title links at link-creation time; verify `parseWikiLinks` unit tests cover pin and auto-pin
- [x] 2.3 Link sync: record `target_revision_id` on insert; verify the pin is unchanged after the target is edited to a new revision
- [x] 2.4 Rendering: resolve/render the pinned revision (frozen) with a "show latest" affordance; verify `resolveWikiLink`/`renderMarkdown` behaviour and add tests — server-side frozen resolution (targetRevisionId + frozen title) and client pin-marking (`data-note-revision`) done + tested; follow-up: render the frozen title inline for auto-pins, open the pinned revision on click, and add a "show latest" affordance

## 3. Version-chain links (D3)

- [x] 3.1 On commit, create an explicit version link from each new revision to its `parent_revision_id` (old→new); verify no text is added to the note body and that restore/promote also produce links
- [x] 3.2 Surface version-chain links in the history/backlinks/graph views; verify they appear and are clickable; add tests

## 4. Content-addressed text snapshots (D4, staged/optional)

- [ ] 4.1 Deduplicate a new revision's text snapshot against its predecessor by `snapshot_hash` (CAS); verify shared blobs remain readable while referenced and are retained by ref-tracking

## 5. Documentation & validation

- [ ] 5.1 Add a `CHANGELOG.md` entry under Unreleased describing the version bubble, version-pinned references, and version-chain links; verify it follows the changelog format (the version-bubble entry is added; extend once 2–3 ship)
- [x] 5.2 Run `npm test` and verify all tests pass
- [x] 5.3 Run `openspec validate --all --strict --no-interactive --report findings` and verify a clean result
