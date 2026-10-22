## Why

Link insertion currently uses native `window.prompt()` dialogs. That blocks the UI, has no note suggestions, and cannot show what the wiki link will resolve to. Adding a wiki link to an existing note requires remembering its exact title or id.

## What Changes

- Replace both prompt-based link flows with a shared **LinkDialog** modal.
- Regular links get **Text** and **URL** fields prefilled from the editor selection.
- Wiki links get a notes search field with debounced results driven by the same `/api/search` endpoint used by the gallery search bar.
- Wiki results show note titles and types, support arrow-key navigation, and allow linking to a typed title that does not exist yet.
- Keep the insertion target stable: choosing an existing note writes `[[note:<id>|label>]]`; new titles write `[[title]]` or `[[title|label]]`.
- Preserve the editor or textarea selection while the dialog is open and insert exactly at that captured selection.
- Preserve wiki-link aliases through render → edit → serialize by adding a `data-note-target` attribute.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-editor`: link and wiki-link tools open a modal, and wiki-link search provides live note suggestions.
- `note-relationships`: wiki-link insertion can select an existing note by search or create a link to a new title, without losing the display alias.

## Impact

- **Affected code**:
  - `src/components/LinkDialog.vue` — new modal for regular and wiki links
  - `src/shared/linkMarkdown.js` — canonical markdown builders
  - `src/App.vue` — dialog state, selection capture, note search, insertion
  - `src/utils/editorSerialize.js` / `src/utils/markdown.js` — wiki target attribute round-trip
  - tests for link markdown and wiki-link serialization
  - `CHANGELOG.md`, `AGENTS.md`
- **No server, schema, or API changes.**
- **`window.prompt` is no longer used for link insertion.**
