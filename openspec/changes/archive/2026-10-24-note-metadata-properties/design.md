# Design — Note Metadata Properties

See `proposal.md` for motivation and `docs/drafts/2026-10-24-note-metadata-properties-resolution.md` for the full decision record (the vault model and rejected alternatives).

## Context

Canonical note content is markdown held in `notes.content` and `note_revisions.content`. Tags are parsed from body text (`src/shared/tags.js` `parseTags`) into `note_tags`; FTS (`src/server/fts.js`) and embeddings (`src/server/services/embeddings.js`) derive text from `content`. The editor keeps one canonical string (`newNoteContent`) with Visual/Source modes. Live text collab binds `content` as `Y.Text` and `meta` as `Y.Map` (`src/collab/textCollabManager.js`). `notes.color` is head-only presentation metadata.

## Goals / Non-Goals

**Goals**

- Properties section in canonical content; body becomes pure markdown.
- One revision rule for all file bytes; `source: 'property'` for metadata edits.
- Operable tag tree and a properties panel.
- Retrieval parity: tags and title still drive search after migration.
- Append-only migration with a permanent legacy-format path.

**Non-Goals**

- No property inheritance from tag paths.
- No folder entity (hierarchy stays slash paths).
- No inline `#tag` convenience parsing in steady state.
- No server-side whiteboard rendering changes.
- No per-note ACL or ownership.

## Decisions

### D1. Fence as a strict YAML subset, hand-parsed

The fence is written and read by `src/shared/noteMeta.js` (new): one `key: value` per line, flow lists, quoted scalars for ambiguous values. Parsing is line-oriented and dependency-free; there is no YAML library in the path.

*Why*: The round-trip requirement is byte-exactness for text we wrote, which a line-oriented writer trivially satisfies and a general YAML emitter does not (`3.0` → `3` is a valid YAML round-trip and a lossy note round-trip). A strict subset also means an adversarial fence cannot trigger YAML features (anchors, aliases, block scalars) at all.

*Alternative*: the `yaml` package end-to-end — rejected; it needs custom scalar typing to avoid coercion loss (`3.0` → `3` is a valid YAML round-trip and a lossy note round-trip), and it accepts constructs the spec forbids, so the filter would be the bug surface. A dependency-free subset parser also avoids syncing `node_modules` into the container.

### D2. Title and color stay head columns

`notes.title` and `notes.color` remain head-only. The panel renders them as rows; they are never serialized into the fence. `note_revisions.title` keeps its current meaning (the name in force at that revision), which is what pinned links render.

*Why*: renaming must not create a revision, and a `title:` fence key would make the title part of the file bytes — changing the hash and forcing a revision. Restore/promote copy the file but keep `notes.title` (the folder name is not file content).

### D3. `note_meta` shadow index, rebuilt on head move

New table `(note_id, key, value_text, value_num, value_type)` populated in the same post-commit path that rebuilds `note_tags` and `notes_fts`. Branch revisions never touch it.

*Why*: mirrors the existing shadow-index pattern (`note_tags` / `notes_fts` / `note_links`) so no new lifecycle is introduced; keeps property queries off the fence text.

### D4. Tags live in the fence; `note_tags` becomes a projection

`note_tags` keeps its schema and is rebuilt from the fence's `tags` list. `parseTags`/`addTagsToContent`/`removeTagsFromContent` remain for migration and for the pre-fence compatibility path, but the steady-state read path never scans body text.

*Why*: every consumer of tags (tree, filter, chips) already reads `note_tags`; only the sync source changes.

### D5. Embedding input and note hash both gain tags

`noteText()` strips the fence before `markdownToText`. Chunk input becomes `title\n\ntags\n\nchunk`. `noteHash()` includes the tags string.

*Why*: after migration tags are no longer in the body, so without this, tag-only edits would not reindex (hash unchanged) and tag retrieval would silently regress.

### D6. Collab: body in `Y.Text`, properties in `Y.Map`

The fence is never written into the shared body text. The properties panel writes to the `meta` map (as `meta.props`), and the fence is assembled at commit. Draft-vs-head comparison covers body and props.

*Why*: a fence inside `Y.Text` would let two clients interleave property lines and corrupt the block; `meta` is already a `Y.Map` used for the title.

### D7. Migration appends one normalization revision per note

Migration 015 derives the fence from `note_tags` + `display_title`, strips inline `#tag` markers from the head body, appends one revision (`source: 'property'`, message `metadata normalization`), and rebuilds indexes. Old revisions keep their fence-less content and the renderer treats missing fences as "no properties" permanently.

*Why*: preserves append-only history and honest `snapshot_hash` values; rewriting old revisions would break the contract `immutable-note-versions` establishes.

## Risks / Trade-offs

- **Full re-index after migration** (every `content_hash` changes) → run it through the existing background queue; gate on `embedding_settings.enabled`; no special bulk path.
- **Revision noise from tag renames** (one revision per affected note) → `source: 'property'` plus a shared message lets the history UI group them; grouping is display-only.
- **Restore no longer moves the title** is a behavior change → the pinned-link tests pin the desired semantics; if users want the old behavior it is one call-site change in `copyRevisionToHead`.
- **Fence leakage into search** → single choke point: all text derivation goes through `noteText()`/`indexNote()` which strip the fence.
- **Legacy revisions without fences** → renderer and property panel degrade to "no properties"; no data migration required.

## Migration Plan

1. Deploy code that reads fences if present and writes them on every save (idempotent: notes without fences still work).
2. Run migration 015 (backup, single transaction, fail closed, idempotent re-run).
3. Let the background indexer converge; no downtime.
4. Rollback: restore the pre-migration backup (`data/backups/`) and redeploy the previous build; the migration is additive so an older build reads the same tables.

## Open Questions

None that affect specs or tasks. History-grouping UI details (collapse presentation) are left to implementation taste; the data (`source` + shared message) is already specified.
