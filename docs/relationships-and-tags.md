# Relationships and Tags

Local Keep notes can reference each other and carry hierarchical tags. Relationships are
materialised for the current head of each note; branches do not change the head's links or
tags.

## Wiki links

```markdown
See [[Another note]].
See [[Another note|shown text]].
Stable form: [[note:1785652483902-7avcmlwy0|shown text]].
```

- Title links resolve against the head `title` or derived `display_title`.
- Exactly one match resolves; zero is `unresolved`; multiple are `ambiguous`.
- Use `note:<id>` for stable references (the note id never changes).
- Links inside fenced or inline code are ignored.
- Clicking a resolved link opens the target (with an unsaved-changes confirmation); broken
  links show a notice.
- `GET /api/notes/:id/links` and `/backlinks` expose the data; the editor has a Backlinks
  drawer.

The graph view (header 🕸 or the note editor's Graph button) uses `d3-force`. It supports
a neighbourhood (`noteId` + depth 1–3), tag filtering, and an unresolved toggle.

## Tags

```markdown
#project
#project/local-keep
#项目/设计
```

- Tags are code-aware; `#e2ece4` (hex colour), `#tag` inside code, and URL fragments are
  ignored.
- Tags are NFKC-normalised to lowercase, deduped, max 64 chars, max 100/note.
- The sidebar shows a collapsible tree. Parent selection includes descendants
  (`#project` matches `#project/local-keep`); counts are unique-note counts.
- Card chips filter the gallery; the control bar shows a removable tag breadcrumb.
- API: `GET /api/tags`, `GET /api/notes?tag=project&exactTag=1`,
  `GET /api/search?tag=project`.

Existing notes were backfilled by migration 002. Most technical notes have `#`/`[[` only
inside code, so an empty tag tree for an old corpus is expected.
