## Why

Marked's GFM tokenizer accepts a **single** tilde for strikethrough. Notes containing paths such as `~/.claude/settings.json` and `~/.github/hooks` therefore show a false `<del>` spanning both lines in Visual mode, while Source mode correctly shows the original single tildes. Serialising that Visual DOM then rewrites the paths with `~~`, so switching modes appears to mutate the content. Draft snapshots made it worse: `applySharedText` marked the editor "dirty" whenever the draft differed from the head, so simply switching a draft to Source re-serialised the rendered DOM.

## What Changes

- Restrict rendered strikethrough to the GFM `~~text~~` form. Lone tildes SHALL remain literal text in paths, URLs, and prose.
- Treat `editorDirty` exclusively as "the Visual DOM has un-serialised edits", not "the document differs from the head".
- Serialize the Visual DOM immediately after each real edit and clear the dirty flag, so mode switching and blur do not re-serialise an already-synchronised DOM.
- Reset the dirty flag after applying a shared draft snapshot, because the surface was just rendered from canonical markdown.
- Verify that opening a note with a shared draft and switching to Source does not change the source text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-editor`: literal single tildes and clean mode/draft switching.

## Impact

- **Affected code**:
  - `src/utils/markdown.js` — inline `literalTilde` extension for marked.
  - `src/App.vue` — `syncVisualEditor`, `applySharedText`, and editor-mode serialization paths.
  - `tests/markdown.test.js`.
- **No schema or API changes.**
- **Residual limitation**: Visual editing of plain-text indentation still normalises whitespace, because HTML collapses leading spaces. Byte-exact plain text belongs in Source mode or a fenced code block.
