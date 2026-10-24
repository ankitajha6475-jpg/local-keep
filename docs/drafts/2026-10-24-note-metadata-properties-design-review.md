# Review — Note Metadata as an Obsidian-Style Properties Section

Status: review note (companion to `2026-10-23-note-metadata-properties-design.md`)
Date: 2026-10-24
Reviewer stance: agree with the core reframing and Option C; the issues below are
tensions inside the draft that should be resolved before it becomes an OpenSpec
change.

> **Resolved**: every issue below and every §12 question is decided in
> `2026-10-24-note-metadata-properties-resolution.md`. §1, §2, §4, §5 and §6 were
> accepted as written; §3 (collab) and §7 (title) were extended — title is stored
> structurally rather than as a `title:` key. Read the resolution, not this note,
> for what to implement.

---

## Verdict

The core reframing — "a note is a file; properties are a section, not prose" —
resolves the `#tag` vs `#heading` conflict at the root instead of adding another
heuristic. Option C is clearly right: the codebase already solved this exact
problem once with the `note_tags` / `notes_fts` / `note_links` shadow-index
pattern, and reusing it means no new lifecycle. The design is implementable as
written. The issues below are real but tractable.

---

## 1. Q8 and Q9 contradict each other (highest priority)

- **Q9** says every property edit gets a revision ("file = truth").
- **Q8** says `add_tags` / `remove_tags` stop creating revisions.

If frontmatter is the source of truth and it lives *in*
`note_revisions.content`, then a tag change changes the file — so
`snapshot_hash` changes. Skipping the revision there breaks the §3.1 claim
("the history represents the whole file") exactly where it matters most.

**Resolution**: pick one rule — *every change to the file (body or properties)
is a revision* — and manage noise differently, e.g. tag revisions carry
`source: 'property'` so the history UI can collapse them. Do not make tags a
special case.

## 2. Versioning `color` conflicts with an existing decision

Gotcha 38 ("note colors are head metadata… don't bump `updatedAt`") exists for a
reason: picking a tint on the dashboard should not create a revision. Folding
color into the file flips that on an interaction that happens constantly in the
gallery. "Restore v2 restores v2's look" is defensible, but it is a visible
behavior regression.

**Resolution**: keep `color` as the one head-only exception even under the
properties model. The properties panel can show it as a *presentation* field,
not a file property. Soften Q3 to "version everything except color" — or accept
a revision per tint pick and change the dashboard interaction deliberately.

## 3. The Yjs draft layer is the hidden complexity

`note_text_docs` binds `content` as one `Y.Text` — and `meta.title` is already a
separate `Y.Map`. That suggests the natural collab shape: **body as `Y.Text`,
properties as a `Y.Map`**, with the fence serialized only at save time. But
`applyMarkdown()`'s single delete/insert and `GET /api/drafts`'s draft-vs-head
diffing must both operate body-only. If the fence ever leaks into the `Y.Text`,
two clients can produce a corrupt or duplicated frontmatter block mid-typing.

**Resolution**: add a §7 paragraph spelling out the collab contract
(`content` = body-only, `meta` = `Y.Map`, fence assembled on commit).

## 4. Tags silently drop out of semantic search

Today `#tag` markers live in the body, so they are embedded into vectors. After
migration they live in frontmatter — and if FTS/embedding inputs are body-only
(as the §4 diagram implies), retrieval quality changes overnight ("find notes
about project/alpha" stops matching).

**Resolution**: make it deliberate — prefix the embedding input with tags the
way the title already is, or include the frontmatter text in the chunk input.
Note this for `src/server/embeddings/chunk.js` and `services/embeddings.js`.

## 5. Migration has costs beyond the revision-history question

- Stripping `#tag` from bodies changes `content_hash` for effectively **every**
  note → the background indexer re-queues everything → a full embedding rebuild
  after migration.
- Old revisions stay fence-less forever, so the renderer/property-viewer needs a
  permanent "this version predates properties" fallback.
- `snapshot_hash` comparisons across the boundary are apples-to-oranges.

The "append one normalization revision per note" lean is still right vs.
rewriting history — just budget for the reindex and the legacy-format handling.

## 6. YAML is a trap unless a strict subset is pinned

The §5.1 typing table looks clean, but YAML scalars are adversarial:

- `no` / `on` / `yes` parse as booleans (the Norway problem);
- `2026-11-01` can parse as a Date and re-serialize as a timestamp;
- `3.0` becomes `3`;
- unquoted `#e2ece4` — the very hex-colour problem being escaped! — is a YAML
  comment, so `color: #e2ece4` truncates the value.

**Resolution** (decides Q5): a strict flow-style subset — one scalar per line,
strings quoted whenever they look like dates/numbers/colours, no anchors, no
multiline constructs. Use the `yaml` package with key order preserved. Round-trip
fidelity tests belong in the suite next to `editorSerialize.test.js`.

## 7. Smaller notes

- **Title dual-truth**: if frontmatter carries `title`, `notes.title` becomes a
  shadow index — fine, but define who wins on conflict (**frontmatter**), and
  note that folding `display_title` into `aliases` subtly changes `[[Title]]`
  resolution semantics.
- **Undersold payoff**: with Option C, "export note" becomes "write the file
  out" — a vault export works in Obsidian literally. That is a good acceptance
  test for Q5.
- **The chip editor can ship early**: the original ask ("tags are hard to
  add/change") can be solved with a chip editor writing to `note_tags` +
  content-rewrite via `addTagsToContent` *before* any of this lands. Derisks the
  UX while storage work proceeds.
- **Sequencing**: agree with §13 — finish `immutable-note-versions` first (it is
  at 10/12 tasks); §9's migration leans on the append-only contract it
  formalizes.

---

## Recommended answers to §12 open questions

| Q | draft lean | review lean |
|---|---|---|
| 1 Storage truth | C | **C** — strongly; it reuses the existing shadow-index pattern |
| 2 Title in properties | in | **in**, but frontmatter wins over the column on conflict |
| 3 Version everything | yes | **except color** — keep color head-only (gotcha 38) |
| 4 Provenance properties | generate | **generate** — never store derivable data |
| 5 Strict Obsidian round-trip | undecided | **strict YAML subset**, round-trip tests mandatory |
| 6 Inline `#tag` convenience | chips-only | **chips-only**; keep `parseTags` only as a migration-time stripper |
| 7 Global tag rename/delete | yes | **yes** — cheap under this model. *Decided 2026-10-24: nested slash paths stay the only hierarchy; TagSidebar gets operable rename/move/delete — design draft §8.1* |
| 8 Tag edits stop creating revisions | ? | **no** — contradicts §3.1 and Q9; see §1 above |
| 9 Revision per property edit | every | **every**, with tag revisions `source: 'property'` and collapsible |

The one to push hardest on: the Q8/Q9 contradiction. Everything in §3 ("the
history represents the whole file") hangs on keeping the revision rule absolute.

---

## Suggested follow-ups before the OpenSpec change

1. Resolve Q8/Q9 into one revision rule and update §8 accordingly.
2. Decide the color exception (Q3) and note the gotcha-38 change explicitly.
3. Add the collab contract paragraph to §7 (Y.Text body / Y.Map meta).
4. Pin the YAML subset in a new §5.6 with the quoting rules table.
5. Add "embedding input includes tags/title after migration" to §11's affected
   code list (`embeddings/chunk.js`).
