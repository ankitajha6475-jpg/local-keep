## Why

Notes are currently isolated. The wishlist needs documents to reference each other, references to open directly, a graph of those relationships, and hierarchical tags that provide browsable structure. The markdown renderer already provides a wiki-link hook; this change supplies storage, resolution, backlinks, graph data, and UI.

## What Changes

- Add wiki-link syntax:
  - `[[Title]]`, `[[Title|label]]`, `[[note:<id>|label]]`.
  - Links are parsed outside code fences/inline code.
- Add `note_links` storage and resolution:
  - title links resolve against head `title`/`display_title`;
  - explicit `note:<id>` links are stable;
  - unresolved/ambiguous/archived links are marked;
  - backlinks return source metadata and a context snippet.
- Add `GET /api/notes/:id/links`, `GET /api/notes/:id/backlinks`, and `GET /api/graph`.
- Add hierarchical tags:
  - inline `#tag` and `#area/project/topic`, parsed outside code;
  - `note_tags` storage, normalisation, dedupe, limits;
  - `GET /api/tags` returns a tree with direct/subtree counts;
  - note list/search accept `tag` (descendants by default) and `exactTag=1`.
- Add a tag sidebar with counts, tag chips on cards, tag filtering, and a graph view.
- Add a backlinks panel to the note editor.
- Rebuild tags/links on every head-moving revision; re-resolve title links when titles change.
- Add a migration that backfills tags/links for existing notes.
- Add parser/service/API tests.

## Capabilities

### New Capabilities

- `note-relationships`: Wiki-link parsing/resolution, backlinks, graph queries, and internal-link navigation.
- `note-tags`: Hierarchical tag parsing, storage, tag tree, filtering, and UI structure.

### Modified Capabilities

<!-- No existing spec covers relationships or tags. Markdown rendering already exposes the
     `[[...]]` hook; this change supplies the resolver and navigation. -->

## Impact

- **Database**: add `note_tags`, `note_links`, indexes; migration version 2 with backfill.
- **Server**: new tag/link services; revisions/notes services sync tags/links; list/search tag filters; graph/backlinks endpoints.
- **Client**: tag sidebar/chips/filter, backlinks panel, graph view, internal-link click navigation; `d3-force` dependency.
- **No change to note identity/revision semantics**; links/tags describe the head revision.
- **Image/MCP**: no direct change; the new services will be reused by the MCP change.
