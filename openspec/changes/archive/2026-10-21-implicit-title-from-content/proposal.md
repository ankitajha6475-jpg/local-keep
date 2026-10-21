## Why

The note create/edit flows currently **block saving a note when the body is empty** (`addNote`/`saveEdit` early-return if `newNoteContent.value.trim()` is empty), so a note that has only a title can never be saved, and the list view shows nothing meaningful for notes that exist without a meaningful title. Per user requirement: notes without a title SHOULD derive a display title from the leading characters of their content, and notes with a title use only the actual title.

## What Changes

- Remove the "content required" early-return guard in `addNote` and `saveEdit` (allow notes with a title only, content only, both, or — defensively — neither).
- Introduce a **display title derivation** helper (`getDisplayTitle(note)`): returns the stored `title` if non-empty; otherwise returns the leading characters (first ~50 characters collapsed to a single line) of `content`; otherwise returns a localized fallback ("Untitled").
- Use this helper everywhere the title is rendered (gallery card, editor header), so the derived title is consistent across UI surfaces without storing it.
- Strip base64/markdown image syntax and excess whitespace when deriving the implicit title, so the preview is readable.
- Persisted schema unchanged: the derived title is a pure view-layer derivation, never written to the database.

## Capabilities

### New Capabilities
- `note-display-title`: Rules for deriving a note's display title (`title` field, or leading content characters, or fallback) used consistently by all UI surfaces.

### Modified Capabilities
<!-- None - no existing spec governs note display/title. -->

## Impact

- **Affected code**:
  - `src/App.vue`: `addNote` (~927) remove the `if (!newNoteContent.value.trim()) return` guard; `saveEdit` (~1019) same; gallery card template (~206) replace direct `note.title` rendering with `getDisplayTitle(note)`; also used by any sort comparators that currently reference `note.title` directly.
- **Server**: no changes — server already accepts empty `title` and `content` (`POST /api/notes` line 578, `PUT /api/notes/:id` line 611).
- **No data migration** — purely a view-layer change.
- **Search**: `notes_fts` already indexes title and content; implicit-title notes remain searchable.
