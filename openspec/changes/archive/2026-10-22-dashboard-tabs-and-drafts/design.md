## Context

The dashboard currently keeps active and archived notes in one `notes` array and filters with a boolean `showArchived`. Text notes already have a shared Yjs draft in `note_text_docs`; it survives reconnects, is used by MCP write sessions, and becomes a revision only on an explicit Save. The browser, however, has no way to close the editor while keeping that draft, and no view that lists pending drafts.

## Goals / Non-Goals

**Goals:**
- Make Notes and Archived completely separate views.
- Expose the existing shared draft to browser users through a Drafts tab and a Draft action.
- Keep the current revision/head semantics: only Save commits.
- Make the unsaved-changes choices explicit and equally prominent.

**Non-Goals:**
- Drafts for notes that do not exist yet (new-note drafts).
- Per-user/private drafts; the workspace draft stays shared per note.
- Automatic background save of a draft as a revision.
- Draft search indexing, MCP tool changes, or a new draft table.

## Decisions

### Decision 1: A dashboard tab state replaces the archived toggle

`dashboardTab` is `notes`, `archived`, or `drafts`. `sortedNotes` filters active notes for Notes and archived notes for Archived. `dashboardNotes` returns:
- Notes: the read-only Quick Shortcuts virtual card plus `sortedNotes`.
- Archived: only `sortedNotes` (archived).
- Drafts: only mapped drafts.

The tab strip lives in the sticky control bar and shows counts. Switching tabs clears the selection and closes the color picker, so a selection can never leak across views. Search/tag filters and sorting apply to the active list.

### Decision 2: Derive drafts from `note_text_docs`

`textCollab.listDrafts()` joins persisted shared documents to active notes, applies each update to a temporary `Y.Doc`, and compares the draft title/content with the head. Rows identical to the head are omitted, so a just-saved note does not linger as a draft. Archived notes and corrupt rows are skipped. `GET /api/drafts` exposes the list; no migration is needed.

### Decision 3: Draft cards are read-only projections

The Drafts tab maps each API draft to a card-like object (`isDraft: true`) with the draft title/content, head-derived tags/color, and the draft timestamp. Draft cards use the normal `.note-preview` scrollbar, show a **Draft** badge, and hide the checkbox, color picker, copy, and delete/restore actions. Clicking one opens the real note; `startTextCollab` then loads the shared draft. Draft cards are not selectable and are not part of `notes`.

### Decision 4: Draft is an editor close action, not a new store

The title/content watchers already write every edit into the shared Yjs document. The **Draft** action simply closes the editor without calling `discardDraft`; `text-leave` persists the document. **Discard** keeps the existing behavior: discard the shared document if this is the last editor, then close. **Save** commits a revision and moves the draft base as before. Because drafts are keyed by a note id, the Draft action is shown for existing notes only; new notes still use Add Note/Discard.

### Decision 5: Four equal unsaved-dialog actions

The dialog offers Save, Draft, Discard, and Continue. All four buttons share flex sizing, padding, font size, and weight; only their color treatment differs. For a new note, the Draft action is hidden because there is no shared document yet.

### Decision 6: Refresh strategy

Drafts are loaded after notes, when the Drafts tab is selected, after a save/discard/draft close, on `text-saved`/`text-discarded`, and via the refresh button. Draft edits from another browser or MCP session are not pushed on every keystroke; the tab shows the persisted state on refresh/selection.

## Risks / Trade-offs

- **[Risk] Stale draft counts** — a remote MCP draft edit is not pushed to the dashboard. The refresh button and tab switch reload the persisted list.
- **[Risk] Draft title on open** — the editor auto-focuses the title input. Initial snapshots now apply the shared title immediately instead of deferring it as `pendingRemoteTitle`; remote changes while typing still defer.
- **[Risk] Archived separation breaks tag/search behavior** — archived search results remain empty until the API supports archived search; the tab still lists all archived notes and supports sorting/tag filters from the in-memory list.
- **[Risk] Draft cleanup race** — after Save, the draft row may persist briefly; `listDrafts` compares against the new head and omits it anyway.

## Migration Plan

None.

## Open Questions

None.
