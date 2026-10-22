## Why

Archived notes are currently mixed into the normal gallery when the Archived toggle is enabled. The dashboard also has no web entry point for the shared Yjs draft that MCP sessions already use, so browser users can only Save (commit a revision) or Discard when they leave the editor.

## What Changes

- Replace the Archived toggle with three mutually exclusive dashboard tabs: **Notes**, **Archived**, and **Drafts**.
- Keep archived notes out of the Notes tab; keep active notes out of the Archived tab.
- Add a draft listing API and a Drafts tab showing notes with uncommitted shared drafts.
- Add a **Draft** action to the editor's bottom actions and keep the existing shared draft when closing. Rename the bottom Cancel action to **Discard**.
- Add Draft to the unsaved-changes dialog, rename **Continue Editing** to **Continue**, and give all four dialog actions equal size and weight.
- Show a Draft badge on normal cards that have a pending draft.

## Capabilities

### New Capabilities

- `dashboard-drafts`: tabbed Notes/Archived/Drafts views, shared-draft listing, and the browser draft actions.

### Modified Capabilities

None.

## Impact

- **Affected code**:
  - `src/server/services/textCollab.js` — list persisted, non-clean drafts.
  - `server.js` — `GET /api/drafts`.
  - `src/App.vue` — `dashboardTab`, tab strip, archived/draft filtering, draft cards, editor Draft/Discard actions, unsaved dialog.
  - `tests/textCollab.test.js`, `tests/textCollabApi.test.js`.
  - `AGENTS.md`, `CHANGELOG.md`.
- **No schema changes.** Drafts remain `note_text_docs` rows.
- **Drafts apply to existing notes.** A new, unsaved note has no note id or shared document to attach a draft to.
- **Draft does not commit a revision or move the head.**
