# Session Log: Note metadata as properties, and the fence-duplication incident

- **Date**: 2026-10-24 17:51
- **Commit**: _pending_
- **Change**: `openspec/changes/note-metadata-properties/` (proposal → design → specs → tasks → implemented)

## Summary

Designed and shipped Obsidian-style properties sections for notes: a strict
YAML-subset fence holding typed metadata, with the body becoming pure markdown
again. Tags moved out of the body into the fence, the tag tree became operable
(rename/move/delete subtree), and the note title and colour became explicit
head metadata (folder name and folder icon under the vault model).

Then a live data-corruption bug in that same work was found and repaired.

## Changed Files

| File | Change |
|------|--------|
| `src/shared/noteMeta.js` | **New** — strict fence subset: parse/serialise/split/join, byte-exact round-trip |
| `src/server/migrations/015-note-metadata.js` | **New** — `note_meta` shadow index + append-only normalization revision per note |
| `src/server/services/noteMeta.js` | **New** — property shadow index, rebuilt on head move |
| `scripts/repair-fences.js` | **New** — collapse stacked fences, import-safe, dry-run gated |
| `openspec/changes/note-metadata-properties/` | **New** — proposal, design, tasks, and eight delta specs |
| `docs/drafts/2026-10-24-note-metadata-properties-design-review.md` | **New** — pre-implementation design review (predicted the draft/fence leak) |
| `docs/drafts/2026-10-24-note-metadata-properties-resolution.md` | **New** — resolution notes for the review findings |
| `docs/drafts/2026-10-23-note-metadata-properties-design.md` | Design updated from frontmatter-in-body to the head-metadata properties model |
| `src/server/services/textCollab.js` | Draft is body-only; properties ride `meta.props` |
| `src/server/services/mcpEditing.js` | Reassemble fence at commit; body-only baseline comparison |
| `src/server/services/notes.js` | `setProperties()` tag/property mutations; fence split on read, join on commit |
| `src/server/services/revisions.js` | Property edits record `source: 'property'`; restore/promote copy properties, not the title |
| `src/server/services/tags.js` | Tags parse from the properties list; subtree rename/move/delete |
| `src/server/services/embeddings.js` | Retrieval text is fence-stripped; `noteHash()` covers tags so tag-only edits re-index |
| `src/server/services/{fts}.js` | Fence stripped before FTS indexing |
| `src/mcp/createServer.js` | Tag tools become property mutations; `set_properties`; `get_note` returns `meta` |
| `src/App.vue` | Properties panel (folded by default), title+colour row, live tint |
| `src/components/TagSidebar.vue` | Operable tree: rename / move / delete subtree |
| `src/utils/markdown.js` | Strip one leading fence before rendering |
| `server.js` | Wire `noteMeta` into notes/revisions, `PATCH /api/tags`, register migration 015 |
| `mcp-stdio.js` | Register migration 015 for the stdio adapter |
| `tests/noteMeta.test.js` | **New** — parse/serialise round-trip, strictness, quoting rules |
| `tests/tags.test.js` | **New** — tag extraction from properties and subtree operations |
| `tests/textCollab.test.js` | Fence-duplication regression: draft stays body-only across saves |
| `tests/helpers/testDb.js` | Include migration 015 in fresh and legacy test databases |
| `tests/migration.test.js` | Migration 015 normalization expectations |
| `tests/migrationAuth.test.js` | Migration list now ends with 015 |
| `tests/markdown.test.js` | Leading-fence rendering coverage |
| `tests/mcp.test.js`, `tests/mcpAdministration.test.js` | Tag tools/property mutation expectations |
| `tests/notesApi.test.js` | DTO expectations with `props` + body |
| `tests/relationships.test.js`, `tests/relationshipsApi.test.js` | Tags now arrive via properties |
| `AGENTS.md` | Gotchas 54–60 (fence subset, body-only draft, `:where()` fallbacks, import-safe scripts) |
| `CHANGELOG.md` | Added/Changed/Fixed entries for properties, tags, and the corruption repair |

## Mistakes made (so we do not repeat them)

### 1. The shared draft stored the whole file — real data corruption

**What happened.** `textCollab.js` seeded the Yjs `content` text with
`head.content` (fence + body) while the editor held `parsed.body`. Every save
through the draft path then called `buildNoteContent(props, body)` where `body`
already contained the fence, so a second fence was prepended. One note reached
**four stacked fences**. The same mismatch also made `hasUnsavedChanges()` true
for untouched notes, producing a phantom "save draft?" prompt on every close.

**Why it survived.** When splitting canonical content into `props` + `body`, I
updated FTS, embeddings, markdown, notes, revisions, tags and MCP — and missed
`textCollab`, which *stores* the shape rather than rendering it. All 157 tests
passed while data was corrupting, because the save-through-draft path had no
coverage. The design review had literally predicted this in §3 and I shipped it
anyway.

**Rules.** See AGENTS.md gotchas 57 and 58. Cross-cutting data-shape changes
need an enumerated consumer audit (reads *and* writes, including persistence),
not a search-and-replace; and the regression test ships in the same commit as
the fix.

### 2. The repair script mutated the database on import

**What happened.** `scripts/repair-fences.js` had top-level database writes with
no main-module guard. A command that merely *imported* it to reuse its exported
`collapseFences()` ran the repair against live data, bypassing the `--dry-run`
gate I had carefully built. The outcome was correct and verified, but the
process was not.

**Why it mattered.** A dry-run flag is worthless if importing ignores it. The
script now wraps its side effects in `main()` gated on
`import.meta.url === pathToFileURL(process.argv[1]).href`, and the guard is
verified by importing the module and asserting nothing is written.

### 3. A `:where()` fallback that was not zero-specificity

**What happened.** The editor modal's tint never applied. I had wrapped the
card's defaults in `:where(.note-card)` but left the modal's fallback as plain
`.note-form-modal { --card-surface-start: #ffffff; … }` — same specificity as
`.note-color-amber`, and later in the sheet, so it won by source order and the
surface stayed white.

**Rule.** When declaring a default that must lose to a modifier class, wrap
*every* fallback declaration in `:where()`. One unwrapped default on the same
element silently defeats the whole scheme. Verify in the built CSS.

### 4. A turn degenerated into a narration loop

**What happened.** One turn produced `OK. / Writing. / Let me go.` on repeat —
prose with zero tool calls — while the real bug sat underneath.

**Why.** Those phrases are a degenerate fixed point: short tokens that imply
action while committing to nothing, and prose self-conditions, so the most
probable continuation after that sequence is the same sequence. A tool call
breaks the loop because a result comes back. Underneath it was verification
paralysis (re-confirming a finding already established) and no completion
criteria, so no turn could look finished.

**Rule.** Reaching the same conclusion twice is a signal to write code, not to
look again. State the fix as a bounded list of edits before starting, so there
is a definition of done.

## Verification

- `npm test` 157/157 (154 prior + 3 fence-duplication regression tests)
- `npm run build` clean
- `openspec validate --all --strict` 24/24
- Corruption verified repaired: 88 notes scanned, 1 stacked fence found and
  collapsed; body intact; `v6 | property | repair duplicated properties fence`
  appended with history v1–v5 untouched
- `scripts/repair-fences.js --dry-run` now reports 0 needing repair, and
  importing the module writes nothing
