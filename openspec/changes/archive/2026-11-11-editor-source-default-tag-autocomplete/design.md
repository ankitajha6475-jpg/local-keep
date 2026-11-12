## Context

The editor keeps a single canonical markdown string (`newNoteContent`) plus the
properties section in `noteProps`. Tags are a list-valued `tags` property edited
through chips in the properties panel. The tag tree is already loaded from
`GET /api/tags` for the sidebar.

## Goals / Non-Goals

**Goals:**

- Source is the default mode in every editor entry point.
- New notes never inherit tags or property drafts from a previous editor session.
- Tag input suggests existing paths as the user types, ranked usefully, without
  preventing new tag creation.

**Non-Goals:**

- Persisting the last-used editor mode per browser/user.
- Server-side tag suggestion or search APIs.
- Creating a tag just because it was suggested.

## Decisions

### Decision 1: One `DEFAULT_EDITOR_MODE` constant

`editorMode` is local UI state, not note content. It is reset by
`openNewNoteModal`, global paste, `startEditing`, and `closeModal` through a
single `DEFAULT_EDITOR_MODE = 'plain'` constant. Visual mode is unchanged and
still renders/hydrates on demand.

### Decision 2: Reset editor-local properties on every new-note path

`resetNoteProps()` clears `noteProps`, `tagDraft`, `propKeyDraft`, and the tag
suggestion state. It is called whenever the editor is reset for a new note and
on close. Existing notes continue to load their parsed fence into `noteProps`.
This is a client state bug fix; no server change is involved.

### Decision 3: Fuzzy matching lives in `src/shared/tags.js`

`matchTags(query, tags, { limit, exclude })` normalises both sides, then ranks:

1. exact path
2. whole-path prefix
3. path-segment prefix (`proj` → `area/project`)
4. substring
5. in-order character subsequence

Ties prefer the shorter path, then alphabetical order. The function is pure and
unit-testable in Node without a DOM.

### Decision 4: Suggestions are advisory

The input keeps its existing commit behaviour: Enter/comma/blur adds the typed
tag. Arrow keys move a highlight and Enter accepts a highlighted suggestion;
clicking a row inserts it with `mousedown.prevent` so the input never blurs.
Empty input produces no dropdown. Already-applied tags are excluded.

## Risks / Trade-offs

- **[Risk] A very broad query suggests many paths** — the list is capped at 8 and
  excluded paths are filtered out.
- **[Risk] Arrow-key handling conflicts with the editor shortcuts** — the
  suggestion keys are scoped to the tag input and use `preventDefault`; Escape
  only stops propagation while the dropdown is open.
- **[Risk] A leaked-property regression returns** — `resetNoteProps()` centralises
  the reset so future new-note paths reuse it.

## Migration Plan

None.

## Open Questions

None.
