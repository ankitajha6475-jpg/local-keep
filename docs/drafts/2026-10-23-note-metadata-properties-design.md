# Note Metadata as an Obsidian-Style Properties Section — Design Draft

Status: exploratory draft (contemplation, not yet an OpenSpec change)
Date: 2026-10-23
Context: started as "tags are hard to add/change", evolved into "make a general
metadata section that can represent the whole history of the file, content is a
bit like properties of Obsidian".

---

## 1. Problem statement

### 1.1 The `#tag` vs `#heading` conflict

Tags are currently inline in the note body: `parseTags` in `src/shared/tags.js`
scans the content for `#tag` / `#area/project` markers outside code. This
collides with markdown itself: `#` means heading. A line like:

```markdown
#project/alpha
```

is simultaneously a tag (for filtering) and an `<h1>project/alpha</h1>` when
rendered. Parsing tags out of "wild" markdown is fragile by construction: code
blocks, headings, hex-colour lookalikes (`#e2ece4`), and prose `#` all have to be
defended against with heuristics (`transformOutsideCode`, hex rejection,
character-class rules). The user's conclusion: **treat tags independent of
content.**

### 1.2 Metadata is scattered

Today a note's "properties" live in several unrelated places:

| thing | where today |
|---|---|
| title | `notes.title` |
| display title | `notes.display_title` |
| tags | inline `#tag` in body + materialized `note_tags` |
| color | `notes.color` (head-only, not versioned) |
| links | parsed from body into `note_links` |
| created/updated/actor | `notes.*` timestamps, `note_events`, revision rows |

Each has its own semantics (versioned or not, in-content or not, synced how).
There is no single place to ask "what are this note's properties?".

### 1.3 There is a tag viewer/filter, but no tag editor

From earlier exploration: `DashboardNoteCard` renders read-only `tag-chip`
buttons (click filters the dashboard), `TagSidebar` is a filter tree, and the
only ways to change a note's tags are typing `#tag` into the body or MCP
`add_tags`/`remove_tags` (which edit content). The chip-based editor is the
original UX ask; the metadata section is its natural foundation.

---

## 2. Core idea

A note is a **file**, not "content plus bolted-on fields". The file has two
structurally distinct parts:

```
┌────────────────────────────────────────────────────────────┐
│  FILE (the unit of identity AND history)                   │
│                                                            │
│  ┌─ METADATA SECTION (properties) ───────────────────────┐ │
│  │ title:   Q3 Plan                  ← system            │ │
│  │ tags:    [project/alpha, area/ops]← system            │ │
│  │ color:   amber                    ← system            │ │
│  │ status:  active                   ← user, typed       │ │
│  │ due:     2026-11-01               ← user, date        │ │
│  │ aliases: [Quarterly Plan]         ← user, list        │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌─ BODY (pure markdown) ────────────────────────────────┐ │
│  │ # Project plan                                        │ │
│  │ Note: # means heading here again. No tag soup.        │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

Obsidian Properties is the reference UX: a delimited block (conventionally YAML
frontmatter between `---` fences) at the top of the file, rendered as a typed
property table above the note body. Key compatibility insight: **"independent of
content" and "properties of Obsidian" do not conflict.** The metadata section is
a *section*, not prose. Even when serialized into the same file, it is
structurally separate: every markdown tool (Obsidian included) strips exactly one
leading `--- … ---` fence before rendering. The body becomes pure markdown again,
and `#` is unambiguously a heading.

---

## 3. "It can represent the whole history of the file" — three readings

The requirement phrase maps to three capabilities. The design should cover all
three.

### 3.1 Metadata is versioned with the file

If the canonical file is `frontmatter + body`, then every row in
`note_revisions` becomes a **complete file snapshot** — the history literally
represents the whole file, properties included, at every point in time.
Restoring revision 2 restores revision 2's properties too.

This dovetails with the in-progress version-pinned links work
(`openspec/changes/immutable-note-versions`): `[[note:B@2]]` freezes B at
revision 2 — under this model that freeze covers properties as well as text.

### 3.2 The metadata section can *describe* history (provenance properties)

The revision machinery already computes provenance (`note_revisions`,
`note_events`, `snapshot_hash`, `parent_revision_id`). A uniform metadata shape
makes it expressible as first-class properties, either on export or in the panel:

```yaml
created: 2026-10-21T09:00:00Z
created_by: ui
updated: 2026-10-23T01:20:13Z
updated_by: mcp:claude
version: 3
parent: 8f2a1c…
content_hash: sha256:9c3…
source: checkpoint
```

These can be **generated** (read-only projections of existing tables) rather than
stored twice; the point is that the metadata model gives history a uniform
shape.

### 3.3 Property changes are diffable across history

"when did `status` flip to `done`?" becomes answerable the same way text diffs
are: compare the property section between two revisions. Requires (3.1).

---

## 4. Storage: where does the section live?

### Option A — YAML frontmatter in the file (source of truth)

The note's canonical text is `frontmatter + body`. Properties are edited through
a panel, serialized into the fence.

- Pro: literal Obsidian fidelity (round-trips on export/import).
- Pro: versioning is free — it *is* the file (reading 3.1 for free).
- Con: SQL queries on property values need a materialized index.
- Con: the body editor must never rewrite the fence (needs discipline, but see
  §7 — the fence is never inside the body editor's DOM).

### Option B — sidecar record as source of truth (`notes.meta` JSON / `note_meta` rows)

Properties live only in the DB; frontmatter is synthesized on export.

- Pro: native queries, trivial separation from content.
- Con: versioning needs its own snapshot column alongside `canvas_data` etc.
- Con: Obsidian fidelity is emulation, not reality; import/export must translate.

### Option C (recommended) — frontmatter as truth + materialized shadow indexes

The codebase already solved this exact problem once: `notes.content` is the
source of truth and `note_tags`, `notes_fts`, `note_links` are materialized
indexes rebuilt when the head moves (`links.syncNote`, tag sync, FTS upsert).
Apply the same pattern:

```
   source of truth            materialized indexes (queryable)
 ┌──────────────────┐        ┌─────────────────────────────┐
 │ frontmatter+body │───────▶│ note_tags   (tag filter)    │
 │  (versioned file)│  sync  │ note_meta   (key → value)   │
 └──────────────────┘        │ notes_fts   (body only)     │
                             └─────────────────────────────┘
```

- Versioned, portable, Obsidian-native **and** queryable.
- Sync points already exist (head-move hooks in `commitInternal`'s post-commit
  path); no new lifecycle.
- Branch revisions (stale-save branches) keep their file snapshot intact while
  only the head's indexes are materialized — consistent with how links/tags
  already behave ("branches do not affect head links").

### Comparison

| | A · frontmatter | B · sidecar | C · frontmatter + indexes |
|---|---|---|---|
| Obsidian round-trip | literal | synthesized | literal |
| Versioned with history | free | extra column | free |
| SQL queries | poor | good | good |
| Renderer work | strip one fence | none | strip one fence |
| Migration effort | medium | medium | medium |
| Fits existing patterns | partial | partial | **yes** |

---

## 5. Data model

### 5.1 Property values and typing

Obsidian infers types from the YAML value. Mirroring that keeps the file format
clean (no type hints in the text):

| YAML value | inferred type | panel control |
|---|---|---|
| `active` | text | text input |
| `2026-11-01` | date | date picker |
| `3` / `1.5` | number | number input |
| `true` / `false` | checkbox | checkbox |
| `[a, b]` | list | chip list (tags, aliases) |
| `[[Some Note]]` | wikilink | link chip (resolves like wiki links) |

### 5.2 System vs user properties

- **System** (schema-owned, panel always shows, semantics defined by the app):
  `title`, `tags`, `color`, `type`, plus generated provenance (`created`,
  `updated`, `version`, `content_hash`, …).
- **User** (free-form keys, any of the inferred types): `status`, `due`,
  `aliases`, anything the user adds.

Unknown keys must survive round-trips even if the app never displays them
(Obsidian plugins add arbitrary keys).

### 5.3 The title/identity question

Obsidian titles are filenames and properties are secondary; here `notes.id` is
the stable identity and `title` is display + link resolution. Two sub-options:

1. `title` is a **system property** editable in the panel (frontmatter carries
   it), while `notes.id` remains the identity. `display_title` folds into
   `aliases` / `display_title` property.
2. `title` stays **structural** (never in the properties section); the section
   holds only secondary metadata.

Leaning: (1) — the file is self-contained (`title` in frontmatter), identity is
still `notes.id` (links `[[note:<id>]]` unaffected).

### 5.4 Example canonical file

```markdown
---
title: Q3 Plan
tags: [project/alpha, area/ops]
color: amber
status: active
due: 2026-11-01
aliases: [Quarterly Plan]
---

# Project plan

Body is pure markdown. `#project/alpha` here would be plain text (or a
heading if at line start) — never a tag.
```

### 5.5 Shadow index sketch (SQL)

```sql
note_meta (
  note_id TEXT NOT NULL,
  key TEXT NOT NULL,            -- normalized property key
  value_text TEXT,              -- canonical string form
  value_num REAL,               -- numeric projection for sorting/filtering
  value_type TEXT NOT NULL,     -- text|number|date|checkbox|list|link
  PRIMARY KEY (note_id, key)
)
```

`note_tags` continues to exist (tags are just a list-valued property projected
for the existing filter/tree code).

---

## 6. Versioning semantics

- **File snapshot = frontmatter + body.** `note_revisions.content` stores the
  whole file; `snapshot_hash` covers properties too (change a property → new
  hash → new revision is meaningful).
- **Everything versioned?** Obsidian semantics say yes. Today `notes.color` is
  head-only (AGENTS.md gotcha: not revisioned, survives edits). If color becomes
  a property inside the file, it versions — arguably more honest ("restore v2
  restores v2's look"), but it is a behavior change to decide deliberately.
- **Restore/promote/branch** need no special property handling: they copy file
  snapshots (existing `copyRevisionToHead` path).
- **Version-pinned links** freeze the full file, so pinned rendering shows the
  pinned properties alongside the pinned body.

---

## 7. Renderer and editor contract

This is where the `#tag` conflict dies completely.

- `renderMarkdown` (and `htmlToMarkdown`, MCP previews) strip exactly **one**
  leading `--- … ---` fence before rendering. No `transformOutsideCode` tag
  parsing, no hex-colour heuristics, no "is `#` a heading or a tag".
- **The body editor never contains the section.** The note modal gets a
  **Properties panel** (chips + typed fields) above the content editor; the
  contentEditable/textarea holds body-only markdown. Serialization re-attaches
  the fence on save (`serializeEditorToMarkdown` output is body; a small
  `serializeMeta` writer produces the fence).
- Import paths (paste, `htmlToMarkdown`) treat a pasted `---` block as content
  unless pasted into the Properties panel — or, friendlier: pasting a whole
  Obsidian file into the body detects and splits the fence once (explicit
  confirm).
- Whiteboard (`type: canvas`) notes use the same file shape; the body is
  represented by `canvas_data` but the fence is identical.

---

## 8. API / MCP surface

- `add_tags` / `remove_tags` become **property mutations** (edit the tags
  property + shadow index), no longer content rewrites (changes current MCP
  semantics — see the note in AGENTS.md about tag edits creating revisions;
  under this model they would not).
- `get_note` returns a structured `meta` object plus `content` (body-only), and
  `include_frontmatter: true` returns the raw file.
- **New capability**: structured queries — "notes where `status: active`", "notes
  where `due` before X" — currently impossible. Could extend `search_notes` with
  a `where` clause or expose `query_meta`.
- `edit_note` / `append_to_note` keep editing the body only; a new
  `set_properties` (or `edit_note` gaining a `meta` map) edits properties.
- The tag filter tree (`GET /api/tags`) is unchanged (it reads `note_tags`).

---

## 9. Migration (the delicate part)

Existing notes have `#tag` markers baked into bodies *and* rows in
`note_tags`. Steps:

1. **Fold existing metadata into properties**: `note_tags` → `tags` list,
   `notes.color` → `color`, `notes.display_title` → `display_title`/`aliases`.
2. **Strip legacy `#tag` markers from bodies** so they stop rendering as
   headings / stop being ambiguous.
3. **Rebuild shadow indexes** from the new sections (idempotent).

Step 2 collides with immutability (the `immutable-note-versions` model just
built). Options:

| option | effect on history |
|---|---|
| strip `#tag` in-place across head **and** revisions | clean everywhere, but **rewrites history** (violates append-only) |
| append one "metadata normalization" revision per note | history stays append-only; each note gains one revision |
| leave legacy `#tag` in old bodies | no history change; legacy notes keep rendering tags as headings until next edit |

Leaning: **append one normalization revision per note** (immutability preserved,
`snapshot_hash`/CAS semantics stay honest). Per AGENTS.md conventions: one
transaction, `VACUUM INTO` backup first, idempotent re-runs, fail closed.

Optionally: strip legacy `#tag` lazily on each note's next natural save instead
of a bulk pass (slower convergence, zero migration risk).

---

## 10. Canvas notes

`type: canvas` notes get the same properties section (title, tags, color, custom
keys). The lean canvas revision snapshots (`canvas_data` + `revision_image_refs`)
are unchanged; the fence rides along in `content` or in a parallel `meta` blob
per revision, matching whichever storage option wins in §4.

---

## 11. Affected code (if implemented)

- `src/shared/tags.js` — retire `parseTags`-from-content; keep normalization +
  hierarchy helpers (`normalizeTag`, `tagAncestors`).
- `src/utils/markdown.js` — fence strip/attach; `renderMarkdown` contract.
- `src/utils/editorSerialize.js` — body-only serialization + meta writer.
- `src/server/services/notes.js`, `revisions.js` — file snapshots, meta sync on
  head-move (like `links.syncNote`).
- `src/server/services/tags.js`, `links.js`, `fts.js` — index rebuild hooks.
- `src/server/migrations/` — `note_meta` table + backfill + normalization pass.
- `src/App.vue` — Properties panel (chips, typed fields) above the editor.
- `src/mcp/createServer.js` — `add_tags`/`remove_tags` semantics, `set_properties`,
  `get_note` shape.
- `openspec/specs/` — `note-tags`, `note-threads`, `markdown-editor`, `mcp-server`
  deltas; likely a new `note-metadata` capability.

---

## 12. Open questions (with my lean)

1. **Storage truth**: frontmatter (A) vs sidecar (B) vs hybrid (C)? — **lean C**.
2. **Title in the properties section**, or structural? — **lean in** (self-contained
   file; identity stays `notes.id`).
3. **Version everything** (color included) or keep head-only exceptions? —
   **lean version everything** (matches "whole history of the file").
4. **Provenance properties** (§3.2): generate read-only on export/panel, or store?
   — **lean generate** (single source: the revision tables).
5. **Strict Obsidian round-trip required?** (YAML style, `tags: [a, b]` vs block
   list, quoting rules.) — worth deciding before the serializer is written.
6. **Inline `#tag` convenience**: typing `#tag` in the body silently adds the
   property (body keeps the text)? — **lean strictly chips-only** for a clean
   separation; easy to add later.
7. **Global tag rename/delete** from `TagSidebar` (rename `proj/alpha` →
   `project/alpha` across all notes) — in scope? — **lean yes**, it's cheap under
   this model (one property key rewrite).
8. **MCP `add_tags`/`remove_tags` stop creating revisions** — acceptable
   behavior change?
9. **When does a property edit get a revision?** Every edit (file changed) vs.
   batched with the next body save? — **lean every edit** (file = truth) unless
   revision noise becomes annoying.

---

## 13. Shape of the eventual OpenSpec change

Suggested change name: `note-metadata-properties` (or `unify-note-metadata`).

- New capability: `note-metadata` (the properties section, types, panel, queries).
- Modified: `note-tags` (tags become a property; drop content parsing),
  `note-threads` (file snapshots include frontmatter), `markdown-editor` (fence
  handling in render/serialize), `mcp-server` (property mutation semantics),
  `image-storage`/`note-colors` if color folds in.
- Sequencing: this change should land **after** (or carefully alongside)
  `immutable-note-versions`, since the migration strategy (§9) depends on the
  append-only revision contract that change formalizes.

---

## Appendix A — Why not keep inline tags and just "make them nicer"?

Because the ambiguity is unresolvable: `#` is markdown's heading character. Any
inline tag syntax either shadows headings (current behavior — surprising renders)
or requires escaping (syntax noise). Separation is the only fix that makes both
markdown and tags work *by their own rules*. The properties section gets
structure; the body gets its grammar back.

## Appendix B — Glossary

- **File**: the versioned unit = metadata section + body (or canvas payload).
- **Properties section**: the delimited metadata block (frontmatter).
- **Body**: pure markdown, no metadata markers.
- **Shadow index**: materialized, queryable projection of the section
  (`note_tags`, future `note_meta`, `notes_fts`).
- **Provenance properties**: generated metadata describing the file's history
  (created/updated/version/hash/parent).
