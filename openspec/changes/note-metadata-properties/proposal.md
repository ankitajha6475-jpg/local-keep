# Note Metadata as Obsidian-Style Properties

## Why

Tags live inline in the note body, where `#` is also markdown's heading character. The current escape hatches (`transformOutsideCode`, hex-colour rejection, character-class rules) are heuristics fighting an ambiguity that cannot be won: `#project/alpha` is simultaneously a tag and an `<h1>`. Metadata is also scattered (`notes.title`, `notes.display_title`, inline `#tag` + `note_tags`, `notes.color`, `note_links`) with no single place to ask "what are this note's properties?". There is a tag viewer but no tag editor.

The fix is structural, not another heuristic: a note is a **vault file** — a properties section (the fence) plus a body of pure markdown. The body gets its grammar back (`#` means heading again), and metadata gets structure. Full decisions, alternatives, and the governing metaphor are recorded in `docs/drafts/2026-10-24-note-metadata-properties-resolution.md`.

## What Changes

- **Properties section (the fence)**: a strict, one-scalar-per-line YAML subset at the top of canonical note content. Round-trips literally through Obsidian. Unknown keys survive round-trips.
- **Tags become a property**, not body text. `parseTags`-from-content leaves the steady-state read path and survives only as a migration stripper.
- **Body becomes pure markdown** — the renderer strips exactly one leading fence; no tag parsing, no hex heuristics.
- **One absolute revision rule**: every change to the file's bytes (body or fence) creates a revision, metadata edits carrying `source: 'property'`. Batch operations (tag rename/move) share a `message` so the history UI can collapse them.
- **`title` and `color` are properties of the *folder*, not of the file** — head-only, never a fence key, renames and tint picks create no revision. `display_title` folds into a versioned `aliases` list property.
- **Operable tag tree**: `TagSidebar` gains rename / move / delete-subtree across all notes, using exact-path helpers in `src/shared/tags.js` (never raw regex).
- **Tag chip editor**: `DashboardNoteCard` / note modal get a real properties panel with typed fields and chips — the original UX ask.
- **Retrieval keeps its recall**: embedding input is title + tags + body (tags prefixed like the title already is), `noteHash()` gains tags so tag-only edits reindex, and the fence is stripped before FTS/vector text so YAML keys never become searchable prose.
- **Migration appends one normalization revision per note** — never rewrites history — followed by a full re-index and a permanent legacy-format fallback for pre-migration revisions.

**BREAKING**: `add_tags` / `remove_tags` stop rewriting the body and become property mutations. They still create a revision (metadata edits are file edits). Restore/promote no longer move `notes.title` — restore is a content operation.

## Capabilities

### New Capabilities

- `note-metadata`: the properties section — fence format (strict YAML subset), value typing, system vs user properties, the properties panel, structured property queries, and the `note_meta` shadow index.

### Modified Capabilities

- `note-tags`: tags become a list-valued property; inline content parsing is retired; the tag tree becomes operable (rename / move / delete subtree across notes).
- `note-threads`: file snapshots include the fence; `source: 'property'` for metadata edits; rename creates no revision; restore/promote do not move the title.
- `markdown-editor`: fence strip/attach in render and serialize; the body editor never contains the fence.
- `semantic-search`: embedding input includes tags and title; the note hash covers tags; fence text is excluded from chunk and FTS input.
- `mcp-server`: `add_tags` / `remove_tags` become property mutations; `set_properties` added; `get_note` returns structured `meta`.
- `live-text-collab`: `content` is body-only `Y.Text`, properties ride `Y.Map meta`, the fence is assembled at commit; `/api/drafts` diffs body-only.
- `note-display-title`: folds into the `aliases` list property; `[[Title]]` resolution consults name → aliases.

## Impact

- **Server**: `src/server/services/notes.js`, `revisions.js`, `tags.js`, `links.js`, `fts.js`, `embeddings.js`, `mcpEditing.js`, `textCollab.js`; new `src/server/services/noteMeta.js`; new migration `src/server/migrations/015-note-metadata.js`.
- **Shared**: `src/shared/tags.js` (retire content parsing from the read path), new `src/shared/noteMeta.js` (fence serialize/parse, strict subset), `src/shared/notesText.js`.
- **Client**: `src/App.vue` (properties panel), `src/components/DashboardNoteCard.vue`, `src/components/TagSidebar.vue` (operable tree), `src/utils/markdown.js`, `src/utils/editorSerialize.js`, `src/collab/textCollabManager.js`.
- **MCP**: `src/mcp/createServer.js`.
- **Dependencies**: none — the fence subset is parsed by `src/shared/noteMeta.js` (no YAML library).
- **Docs**: `AGENTS.md` gotchas 38/41/44/45 amended, two new gotchas (`noteHash` must cover tags; title lives outside the fence); `CHANGELOG.md`.
