# Note Metadata as Properties — Final Resolution

Status: **decided** (supersedes the open questions in the design draft and closes the
review; not yet an OpenSpec change)
Date: 2026-10-24
Inputs: `2026-10-23-note-metadata-properties-design.md`,
`2026-10-24-note-metadata-properties-design-review.md`, plus owner answers of 2026-10-24.

This document is the answer sheet. Where the design draft and the review disagree, the
decision below wins. Where the owner's metaphor overrode an option as literally worded,
the deviation is flagged inline.

---

## 0. TL;DR — the decisions

| # | Contention | Decision | Pref |
|---|---|---|---|
| 1 | Q8 vs Q9 (does a tag edit get a revision?) | **One absolute rule**: every change to the file is a revision; tag/property edits are revisions with `source: 'property'` and a shared batch `message` | 9/10 |
| 2 | Q3 (`color` versioned?) | **`color` is head-only** — the folder *icon*, not file content. Gotcha 38 stands unchanged | 9/10 |
| 3 | Title dual truth | **Title is a property of the *folder*, not of the file** — head-only, shown in the properties panel, renames create **no** revision; never a `title:` fence key (revised 2026-10-24, §4) | 9/10 |
| 4 | Retrieval after migration | **Embedding input = title + tags + body**; and `noteHash()` **must** include tags or tag-only edits never reindex | 9/10 |
| 5 | Migration strategy | **Append one normalization revision per note**; budget a full re-index and a permanent legacy-fence fallback | 9/10 |
| 6 | YAML dialect (Q5) | **Strict one-scalar-per-line subset**, quote anything date/number/bool/colour-like, `yaml` pkg, order preserved, round-trip tests mandatory | 9/10 |
| 7 | Sequencing | **Ship the chip editor + operable `TagSidebar` first** (today's content-rewrite semantics), storage migration second | 9/10 |

Two independent findings changed the shape of the answer and are not optional:

- **`noteHash()` excludes tags** (`src/server/services/embeddings.js:70`). Prefixing tags
  into the embedding input without adding them to the hash means tag edits produce an
  identical `contentHash`, the indexer skips the note, and search keeps serving vectors
  that no longer match the note. Decision 4 is a two-line change, not one.
- **The fence would leak into full-text and vector text.** `noteText()`
  (`embeddings.js:73`) and `indexNote()` (`src/server/fts.js:18`) both run
  `markdownToText(content)`. Unless the fence is stripped first, every property key and
  value (`tags:`, `status:`, …) becomes searchable prose and pollutes every chunk.

---

## 1. The Vault Model (the owner's ontology, formalised)

The owner's framing — *"history of revisions are like files in a folder, tag is the
folder path, property is folder property"* — is adopted as the governing model. It is
sharper than the draft's "a note is a file", because it says **what kind of thing each
concept is**, which is exactly what the seven contentions were arguing about.

| OS / vault concept | Local Keep concept | Consequence |
|---|---|---|
| **Inode** (stable handle) | `notes.id` | Never changes on rename/move/edit. Already a hard rule. |
| **Folder path** | tag path (`area/project/alpha`) | Hierarchy is the string; no folder entity, no folder ids. Already decided (§8.1). |
| **Hard link** (one file, several folders) | a note with multiple tags | A note with 3 tags is one file linked into 3 folders. Tags stay plural. |
| **File contents, versioned** | `note_revisions.content` (fence + body) | Append-only stack. Restore = check out an old version. |
| **File attributes** | properties section (the fence) | **Per file.** Not inherited from the path — see §5. |
| **File/folder name** | `notes.title` | Lives in the directory entry, not inside the file — so not versioned and not a revision trigger. See §4. |
| **Folder icon** | `notes.color` | Display attribute. Repainting an icon does not create a new version of the files. |
| **`mv`** | tag rename / move | Writes each affected file's path attribute → one revision per note, batch-collapsible. |

Three invariants fall straight out of the table and settle §2.2 of the review:

1. **The fence is the file.** If a byte of the fence changes, the file changed, so a
   revision happened. There is no metadata special case — that is decision 1.
2. **The icon is not the file.** `color` is not in the fence, therefore not in
   `snapshot_hash`, therefore not versioned. That is decision 2, and it is the *reason*
   gotcha 38 survives rather than an exception carved out of it.
3. **The name is not the contents.** Renaming is a directory-entry write. The frozen title
   in a pinned link `[[note:B@2]]` still comes from `note_revisions.title`, because the
   *revision row* records the name in force at that version. That is decision 3.

---

## 2. Decision 1 — one revision rule (resolves Q8/Q9)

**Decided: the absolute rule.** Every change to the file — body, tags, or any other fence
key — creates revision `n+1`. Metadata edits carry `source: 'property'`.

The rule is scoped to the file's *bytes*, which is what keeps it absolute. Two things sit
outside those bytes and are therefore not file changes: `color` (the folder icon, §3) and
`title` (the folder name, §4). Neither is a special case carved out of the rule — both are
excluded by definition, because neither is serialised into the fence.

The review's §1 is correct and the draft's Q8 is wrong. Q9 says the history represents
the whole file; Q8 says tag edits skip revisions. Under Option C the tags *are* in the
file, so Q8 would make §3.1 false precisely where the file's properties change. There is
no coherent rule in which "the fence is part of the file" and "fence edits are exempt"
both hold.

The metaphor makes the cost structure legible instead of hiding it: a tag rename is a
`mv`, and a `mv` legitimately touches every affected file. What must stay cheap is
**reading** history through that noise, and that is a UI problem:

- every metadata revision carries `source: 'property'`;
- a subtree rename writes the *same* `message` on every affected note, e.g.
  `tag rename: area/project → area/proj`;
- the history list groups consecutive revisions sharing `(source='property', message)`
  into one collapsible `mv` row, with the per-note revision still present underneath.

No schema change is needed. `source` is a free-form string in `createRevision`
(`src/server/services/revisions.js:88`, default `'ui'`); existing values are `ui`, `mcp`,
`mcp-open`, `checkpoint`, `restore`, `promote`, `migration`. `'property'` slots in.

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Absolute rule** (chosen) | **9/10** | Keeps §3.1 true, needs zero special cases, batches are reversible and auditable |
| Tags head-only (never in the fence; injected on export only) | 4/10 | Makes tag renames free, but breaks the Obsidian round-trip claim, breaks `[[note:B@2]]` property freezing, and reintroduces "properties are scattered" — the exact problem §1.2 exists to kill |
| Tag edits batched into the next body save | 2/10 | Produces revisions whose diff mixes an unrelated tag change with someone else's prose; makes revert meaningless |

---

## 3. Decision 2 — `color` stays head-only (resolves Q3)

**Decided: `color` is the folder icon. It is not in the fence, not in `snapshot_hash`,
not versioned.**

`setNoteColor` (`src/server/services/notes.js:274`) already does exactly this —
`UPDATE notes SET color = ?`, with the comment "Color is presentation metadata: do not
bump `updatedAt` or create a revision". Nothing changes there. Gotcha 38 stands, and it
now has a *model-level justification* rather than being an exception: the icon is not
file contents.

Consequences to state explicitly in the OpenSpec delta:

- **The properties panel shows `color` under a separate "Presentation" heading**, not
  among file properties. Otherwise users reasonably conclude it is versioned.
- **Restoring v2 does not restore v2's tint.** Accepted: the tint is a gallery affordance,
  and the gallery is where tints are chosen. A user who wants "how it looked" gets the
  body, which is what they actually meant.
- **Export does not write `color`.** Default export is a clean Obsidian file. An optional
  `include_app_metadata: true` may emit a namespaced `local-keep:` block; on import,
  read-if-present, never write a bare `color:` key (it collides with hex-colour syntax and
  is not an Obsidian property).

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Head-only** (chosen) | **9/10** | Zero UX regression, zero migration, and the metaphor supports it |
| Version everything literally | 3/10 | Every tint pick in the gallery would write a revision and bump `updatedAt`, flooding history with one-click actions and breaking gotcha 38 deliberately |
| Version but hide tint-only revisions from history | 5/10 | Worst of both: `snapshot_hash` churn and a history that lies about what changed |

---

## 4. Decision 3 — title is a property of the folder, not of the file (resolves Q2)

**Decided (revised 2026-10-24, superseding the earlier "structural name, rename =
revision" answer): title is a first-class property — and it is head-only. A rename creates
no revision.**

The first version of this resolution split the difference: title editable in the panel, but
still serialised structurally *and* still revision-creating. The owner rejected the
revision-creating half, and the owner is right — for a reason that follows from their own
second argument.

### Why the owner's argument settles it

> "the actual filename is the hash of content, which acts like node identifier too"

Take that seriously. In a content-addressed store the object's name **is** the hash of its
bytes. The fence is bytes in the file. So:

```
   notes.id  =  hash( bytes )          ← the inode / object name
                    ▲
                    │ what counts as "bytes"?
                    └── body  +  fence  +  every key inside the fence
```

If `title:` were a key in the fence, the title would be **inside the hash** — and changing
it would change the hash, which by the owner's own definition is a new object, i.e. a new
version. Goals 1 ("rename without a revision") and 3 ("title is a property") therefore
cannot both be met by a `title:` fence key.

So points 1 and 2 are not in tension: **point 2 is the proof of point 1.** The only
self-consistent reading of point 3 is:

**"Property" = a property of the *folder* (the history object), displayed in the
properties panel — not a key inside the file's hashed content.**

That is a real distinction, not a dodge:

```
┌─ folder: the note as a thing in the vault ─────────────────────┐
│  name: Q3 Plan              ← head-only; rename ≠ new version   │
│  icon: amber                ← head-only; repaint ≠ new version  │
│  ┌─ version 3, content-addressed by hash ────────────────────┐  │
│  │  ---                                                      │  │
│  │  tags: [project/alpha]      ← in the file, versioned      │  │
│  │  aliases: [Quarterly Plan]  ← in the file, versioned      │  │
│  │  ---                                                      │  │
│  │  # Project plan                                           │  │
│  │  body…                                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲                                                 ▲
   outside the hash                              inside the hash
   (rename ≠ new version)                   (edit ⇒ new version)
```

### What this changes

- **Renaming creates no revision.** No `source: 'property'` rename entries and no history
  noise from fixing a title typo. This is goal 1, achieved — and it is consistent with
  decision 1, because decision 1 is scoped to the file's bytes and the title is not among
  them.
- **`notes.title` is the single source of truth.** No dual truth, nothing to arbitrate: the
  review's "frontmatter wins on conflict" question dissolves because no competing copy is
  ever written.
- **`note_revisions.title` survives unchanged, as a commit-time snapshot.** It is *not* a
  versioned property the user edits; it records the name the version was published under.
  That is what makes `[[note:B@2]]` render a frozen title — asserted by
  `tests/versionPinnedLinks.test.js` ("frozen title must reflect the pinned version"), fed
  by the join at `src/server/services/links.js:139-161`. Since renames never touch
  `note_revisions`, old pins keep the old name. Correct by construction.
- **A rename leaves the head revision's `title` column stale.** Accepted and intended: that
  column answers "what was this version called?", not "what is this note called?". The live
  name is always `notes.title`.
- **No `title:` key is ever written.** A `title:` key found on import is folded into the
  name once and then dropped on the next save — a one-way compatibility read.
- **Export writes the name as the filename**, which is what makes "export a note → open it
  in Obsidian" work verbatim. In Obsidian the title *is* the filename; a `title:` key there
  is an inert user property that silently drifts.
- **`aliases` stays a fence key** (versioned). This asymmetry is deliberate and matches
  Obsidian literally: the name is the filename (outside the file), aliases are a property
  (inside it). `notes.display_title` becomes a shadow projection of `aliases[0]`, and
  `[[Title]]` resolution consults name → aliases — a superset of today's title →
  display_title behaviour.

### Restore / promote do not move the title

Necessary consequence, flagged because it is a behavior change: `copyRevisionToHead`
(`src/server/services/revisions.js:488`) currently passes `title: revision.title`, so
restoring v2 also restores v2's name. Under "the title is outside the file", restore is a
**content** operation — you check out a version's bytes, not its label. It becomes
`title: head.title`.

If that feels wrong in practice it is a one-line revert plus a spec tweak. The default here
is "restore changes contents, not the name", matching `git checkout <blob>` rather than
`git checkout <branch>`. Worth verifying against `tests/versionPinnedLinks.test.js` and
`tests/revisions.test.js` when implementing.

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Head-only property + commit-time snapshot** (chosen, revised) | **9/10** | Meets all three owner goals; stays consistent with decision 1 because the fence is untouched; pinned frozen titles keep working |
| Previous draft: structural name, rename = revision | 5/10 | Consistent, but fails the owner's stated goal for no benefit — the revision recorded nothing `notes.title` does not already track |
| `title:` fence key, versioned | 4/10 | Goal 1 dies (every rename is a revision); and by the owner's own hash argument the title would then live *inside* the content hash, i.e. cease to be a label |
| `title:` fence key, head-only | 2/10 | Recreates the Q8/Q9 contradiction verbatim — a key inside the file that does not create revisions when it changes — and makes `snapshot_hash` lie |

---

## 5. Decision 4 — retrieval keeps tags (review §4)

**Decided: embedding input = title + tags + body. Full-text = body only. Both strip the
fence first.**

Today `#project/alpha` sits in the body, so it is embedded. After migration it sits in the
fence. If the fence is stripped and nothing is added back, "notes about project/alpha"
stops matching the moment the migration lands — a silent retrieval regression that no test
would catch, because every vector is rebuilt and every query still "works".

Three changes, all in existing functions:

1. **Strip the fence** in `noteText()` (`src/server/services/embeddings.js:73`) and in
   `indexNote()` / `rebuildFts()` (`src/server/fts.js:18,29`) **before** `markdownToText`.
2. **Prefix tags like the title already is.** `embeddings.js:574-575` builds
   `` `${title}\n\n${chunk.content}` ``; it becomes `` `${title}\n\n${tags}\n\n${chunk.content}` ``
   with tags space-joined. Follows the existing "title prefixes the embedding input, not
   the stored chunk" rule.
3. **Add tags to `noteHash()`** (`embeddings.js:70`). Currently
   `hash(`${row.title}\n${text}\n${chunkSize}\n${chunkOverlap}`)`. Without tags in the
   hash, editing only tags leaves `contentHash` unchanged, the background indexer's
   "changed during embedding" guard and the revision-hash check both see a no-op, and
   stale vectors persist forever. This is the single most important line in this decision.

`note_tags` remains the queryable projection, so tag filtering and the `GET /api/tags`
tree are untouched.

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Title + tags + body** (chosen) | **9/10** | Preserves today's recall exactly, reuses the existing title-prefix pattern |
| Body only | 3/10 | Silent recall regression; the review's §4 is right to reject it |
| Body + raw fence text | 5/10 | Keeps recall but embeds YAML keys and values as prose in every chunk, diluting similarity |

---

## 6. Decision 5 — migration appends one normalization revision (review §5)

**Decided: append exactly one `source: 'property'` normalization revision per note.
Never rewrite old revisions.**

Steps, as migration `src/server/migrations/014-note-metadata.js` (next free number after
`013-note-color.js`), following the house rules — `VACUUM INTO` backup first, one
transaction, idempotent, fail closed:

1. Derive the fence from existing head-level data: `note_tags` → `tags`,
   `notes.display_title` → `aliases`. Two head columns are deliberately **not** migrated
   into the fence: `notes.color` *(head-only — the folder icon, §3)* and `notes.title`
   *(head-only — the folder name, §4)*.
2. Strip legacy inline `#tag` markers from the **head body** using the existing
   `parseTags` + `removeTagsFromContent` from `src/shared/tags.js`. `parseTags` survives
   as a migration-time stripper and for `addTagsToContent` during phase 1 — it is no
   longer part of the steady-state read path.
3. Write the stripped body + fence as revision `n+1`, message
   `metadata normalization`, `source: 'property'`.
4. Rebuild `note_tags`, `notes_fts`, `note_links` from the new head.

Costs to budget for, not to discover in production:

- **Every note's `content_hash` changes**, so the embedding indexer re-queues everything →
  one full re-index after migration. Sequence it deliberately (optionally gated on
  `embedding_settings.enabled`) rather than letting it stampede.
- **Old revisions stay fence-less forever.** The renderer and the properties viewer need a
  permanent "this version predates the properties model" fallback: no fence → no panel,
  body rendered as-is. Not a temporary shim.
- **`snapshot_hash` is not comparable across the boundary.** Do not build any logic that
  compares a pre-migration hash to a post-migration one; hashes are only ever compared to
  themselves for equality.

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Append one normalization revision** (chosen) | **9/10** | Preserves append-only, keeps `snapshot_hash` honest, re-runs are idempotent |
| Strip in place across head *and* all revisions | 1/10 | Rewrites history — violates the contract `immutable-note-versions` just established |
| Lazy strip on each note's next save | 5/10 | Zero migration risk but never converges; two rendering models coexist indefinitely and tag filtering is inconsistent for months |

---

## 7. Decision 6 — strict YAML subset (resolves Q5)

**Decided: a documented subset, mechanically enforced, with round-trip tests as a merge
requirement.** `yaml` is **not** currently a dependency (`package.json` has `marked`,
`turndown`, `turndown-plugin-gfm` only) — add it.

The serializer accepts only:

| Rule | Detail |
|---|---|
| One scalar per line | `key: value`. No nested mappings in v1. |
| Lists are flow style | `tags: [a, b]`, one line, scalars only. Matches Obsidian's own default. |
| No comments in the fence | `#` is a comment introducer outside quotes — never allow it bare |
| No anchors/aliases/tags | `&`, `*`, `!!` rejected |
| No block scalars | `>` and `|` rejected; multi-line text lives in the body |
| Key order preserved | `yaml` round-trips plain mapping order; assert it |
| Exactly one fence, at byte 0 | `---` opener and closer, LF-normalised, no trailing spaces |
| Unknown keys preserved | Stored as text when the type is unknown; never dropped on rewrite |

Quoting rules — every value matching a "looks like something else" pattern is quoted:

| Value | Written as | Trap avoided |
|---|---|---|
| `active` | `active` | — |
| `no`, `on`, `off`, `yes`, `y`, `n`, `null`, `~` | `'no'` | Norway problem: YAML 1.1 booleans |
| `2026-11-01` | `'2026-11-01'` | Date coercion → re-serialised as a timestamp |
| `3.0`, `0123`, `1e5` | `'3.0'` | Numeric coercion → `3` / `123` / `100000` |
| `#e2ece4` | `'#e2ece4'` | `#` starts a comment → `color:` truncates to empty — **the exact hex-colour bug this design exists to escape** |
| `''` | `''` | Never write a bare `key:` |

Enforcement: `serializeMeta(model)` → `parseMeta()` → deep-equal model, **plus**
`parseMeta(source)` → `serializeMeta()` → byte-identical `source` for every file the app
wrote. Test files live next to `tests/editorSerialize.test.js` and use the project's real
notes as fixtures.

### Alternatives considered

| Option | Pref | Why rejected |
|---|---|---|
| **Strict subset** (chosen) | **9/10** | Deterministic output, round-trip provable, no YAML 1.1 surprises |
| Full YAML, trust the library | 2/10 | `yaml` is *correct* and still fails the requirement: `3.0` → `3` is a lossless YAML round-trip and a lossy note round-trip |
| TOML / JSON fence | 3/10 | Kills the Obsidian claim outright |

---

## 8. Decision 7 — sequencing (review §7)

**Decided: phase 1 ships the UX on today's storage; phase 2 migrates storage.**

`immutable-note-versions` is 10/12 complete (`4.1` CAS snapshots and `5.1` changelog
remain open). The migration leans on the append-only contract that change formalizes, so
it gates phase 2 — but the original complaint ("tags are hard to change") does not.

**Phase 0 — chip editor (no storage change).** Properties-style chip editor writing
through the existing `addTagsToContent` / `removeTagsFromContent`, creating ordinary
content revisions. This is today's semantics, so gotcha 41 stays true and no contract
moves. Ships the actual ask, and shakes out the panel UX before it is load-bearing.

**Phase 1 — operable `TagSidebar`.** Rename / move / delete-subtree (§8.1 of the draft) on
top of phase 0's content rewrite. Verification: rename `area/project` → `area/proj`
rewrites `area/project` and `area/project/*` across notes, `GET /api/tags` re-derives,
archived notes are skipped (`note_archived`). This is the concrete stress test for
revision noise — run it *before* committing to decision 1's absolute rule, since it is the
cheapest moment to discover the history list needs grouping.

**Phase 2 — storage migration.** Fence + `note_meta` + fence strip in
`renderMarkdown`/`editorSerialize`/`indexNote`/`noteText` + revision rule +
`014-note-metadata.js`, after `immutable-note-versions` closes.

---

## 9. Consequences that need no separate decision

These follow mechanically; listed so the OpenSpec change does not re-litigate them.

**Collab contract (review §3).** `src/collab/textCollabManager.js:74-75` already has
`doc.getText('content')` and `doc.getMap('meta')` — the right shape exists. The rule:
**`content` is body-only; properties live in `meta`; the fence is assembled only at
commit time.** `applyMarkdown()` stays a single contiguous delete/insert on the body, and
`GET /api/drafts` diffs body-only so a draft is never reported as changed merely because a
property moved. The fence must never be inside the `Y.Text`, or two clients produce
duplicate or interleaved frontmatter mid-typing.

**Renderer.** `renderMarkdown` strips exactly one leading fence. No `transformOutsideCode`
tag parsing, no hex heuristics. A note without a fence (all pre-migration revisions)
renders as-is — the permanent legacy path.

**Editor.** `serializeEditorToMarkdown` returns body only; a separate `serializeMeta`
writes the fence; save concatenates. The body editor never contains the fence.

**MCP.** `add_tags`/`remove_tags` become property mutations (`set_properties` or a `meta`
map on `edit_note`); `get_note` returns `meta` + body, `include_frontmatter: true` for the
raw file. They **still create a revision** — decision 1 applies to MCP exactly as to the
UI. Gotcha 41's *mechanism* (go through `src/shared/tags.js`, never a raw regex append, and
never touch archived notes) survives even though its "content edit" framing does not.

**Renames (UI, MCP `set_title`, WS `title`, `[[Title]]` fixes).** No revision — but
`updatedAt` **is** bumped. The name feeds `[[Title]]` resolution, search, and the card
heading, so it is a user-visible change to how the note is found, unlike a tint.
`setNoteColor`'s no-`updatedAt` rule (`notes.js:274-282`) stays specific to color. Renames
must also leave `note_revisions` untouched so pinned frozen titles keep resolving
(`links.js:139-161`).

**Canvas notes.** Same file shape; the fence rides in `content`, the lean `canvas_data`
snapshots are untouched.

**Queries.** `note_meta(note_id, key, value_text, value_num, value_type)` as sketched in
draft §5.5; `note_tags` is retained as the projection the existing tree/filter code reads.

---

## 10. Non-goals (pinned deliberately)

- **No property inheritance from the tag path.** "Property is folder property" reads as
  *attributes of the object at that path*, not defaults cascading down `area/` →
  `area/project/`. Per-note only. If folder-level defaults are ever wanted, that is a new
  change, not an implication of this one.
- **No folder entity.** Hierarchy stays slash-path-only; no ids, no folder table, no
  empty folders.
- **No inline `#tag` convenience.** Chips only (review's Q6, accepted). `parseTags` survives
  only as a migration stripper.
- **No rewriting history.** Not even for the normalization pass.
- **No `title:` key** (decision 3), **no `color:` key** (decision 2).

---

## 11. Next step

Turn this into `openspec/changes/note-metadata-properties/` via the `openspec-propose`
skill, after `immutable-note-versions` is archived. Capability deltas:

- **new** `note-metadata` — the properties section, typing, panel, queries
- **modified** `note-tags` (tags become a property; drop content parsing; operable tree),
  `note-threads` (fence = file snapshot; `source: 'property'`; rename creates no revision;
  restore/promote no longer move `notes.title`), `markdown-editor` (fence
  strip/attach), `semantic-search` (title+tags+body input, tags in `noteHash`),
  `mcp-server` (property mutation semantics), `live-text-collab` (body-only `Y.Text`,
  `Y.Map` meta), `note-display-title` (folds into `aliases`)

`note-colors` is **not** modified — decision 2 leaves it entirely alone.

Gotchas to amend when phase 2 lands (not before): 38 gains the folder-icon rationale, 41two
new gotchas pin (a) "`noteHash()` must include any input that `noteText()`/title-prefixing
puts into the embedding" and (b) "the title lives outside the fence — renames create no
revision and must never be serialised as a `title:` key; restore/promote do not move it".
`CHANGELOG.md` gets the entry under `[Unreleased]` at phase 1, since the chip editor is the
HANGELOG.md` gets the entry under `[Unreleased]` at phase 1, since
the chip editor is the first user-visible behavior change.
