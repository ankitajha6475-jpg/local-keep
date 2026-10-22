## Context

The markdown toolbar's Link and Wiki link tools currently call `window.prompt()`. The gallery search bar calls `/api/search?q=` with a 250 ms debounce and maps result ids back to the in-memory note list. The editor is either a contentEditable surface (Visual) or a textarea (Source), and the markdown serializer already knows how to turn anchors and `.note-link` spans into markdown.

## Goals / Non-Goals

**Goals:**
- Replace both native prompts with one modal that works in Visual and Source modes.
- Show live note suggestions while typing in wiki mode.
- Preserve the selection that existed before the modal opened.
- Keep wiki links stable (`note:<id>`) and preserve aliases.

**Non-Goals:**
- Changing search ranking, adding a new server search endpoint, or adding semantic wiki-link search.
- Editing existing links in place.
- Adding URL validation beyond a non-empty field.

## Decisions

### Decision 1: One dialog, two modes

`LinkDialog.vue` handles both modes. Regular mode shows Text + URL fields; wiki mode shows a search input and result list. The overlay is nested inside the note editor modal and closes with Escape without closing the note.

### Decision 2: Debounced note search, same endpoint as the gallery

The dialog receives a `search-notes` function prop. App implements it with `/api/search?q=` and maps ids to the in-memory notes list, excluding archived notes and the note being edited. An empty query returns recent active notes as suggestions. Search results are capped at 20 and requests are sequence-guarded so stale responses cannot replace newer ones.

### Decision 3: Typed titles remain valid targets

If the query does not exactly match a note title, the dialog appends a synthetic "Link to new title" option. Choosing it writes a title-based wiki link, preserving the existing unresolved-link workflow.

### Decision 4: Capture the selection before showing the dialog

Opening the dialog clones the Visual `Range` or records the Source textarea start/end plus selected text. Insertion later uses that captured selection rather than the dialog input's focus. Visual insertion creates an `<a>` or `.note-link` span; Source insertion uses the canonical markdown string built by `src/shared/linkMarkdown.js`.

### Decision 5: Stable ids and alias round-trip

Selecting an existing note writes `[[note:<id>|label]]`. The renderer now emits `data-note-target` alongside `data-note-label`, and the serializer uses both, so `[[Missing note|alias]]` survives editing instead of collapsing to `[[alias]]`.

## Risks / Trade-offs

- **[Risk] Search results lag typing** — 180 ms debounce and sequence guard; users can always submit the typed title as a new link.
- **[Risk] Selection is lost if the editor re-renders while the dialog is open** — the editor is not editable while the modal is open; a missing range falls back to the end of the document.
- **[Risk] Two overlays inside one modal** — Escape is handled by the dialog first, and the note-editor save shortcut still applies only after the dialog closes.

## Migration Plan

Pure frontend change. Existing notes and links are untouched.

## Open Questions

none.
