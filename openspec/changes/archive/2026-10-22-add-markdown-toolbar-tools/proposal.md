## Why

The note editor exposes only Bold, Italic, Link, and Checkbox. Most everyday markdown constructs (headings, lists, quotes, code, tables, rules) require switching to Source and typing syntax. Keyboard shortcuts are not discoverable, and existing toolbar tooltips hard-code shortcut text (`Ctrl+B`) instead of adapting to the platform.

## What Changes

- Replace the four-button formatting row with a grouped markdown toolbar covering inline formatting, block formatting, and insertion.
- Support every tool in both **Visual** and **Source** modes, operating on the DOM selection or the textarea selection respectively.
- Add platform-aware keyboard shortcuts for the tools and a shared matcher in `src/shared/editorTools.js`.
- Holding **Alt/Option** replaces each button's tooltip with its shortcut, so shortcuts are discoverable without leaving the editor.
- Keep image upload as the existing right-aligned toolbar action.
- Preserve selection when a toolbar button is pressed (`mousedown` is prevented).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-editor`: adds a full markdown formatting toolbar, Source-mode formatting commands, and discoverable keyboard shortcuts.

## Impact

- **Affected code**:
  - `src/shared/editorTools.js` — tool definitions and shortcut matcher
  - `src/components/MarkdownToolbar.vue` — grouped toolbar with Alt-revealed shortcut tooltips
  - `src/App.vue` — Visual/Source command implementations, hotkey handling, Alt tracking
  - `tests/editorTools.test.js` — shortcut matching coverage
  - `CHANGELOG.md` — Unreleased entry
- **No server, schema, or API changes.**
- **No change to the canonical markdown format;** serialization continues through `editorSerialize.js`.
