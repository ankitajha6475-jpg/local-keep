## Context

The renderer uses `marked` v18 with `gfm: true`. Its GFM inline tokenizer accepts `~text~` as well as `~~text~~`. That is broader than the GFM specification. In a note containing two paths:

```text
"~/.claude/settings.json": false,
"~/.github/hooks": true,
```

the first `~` opens a deletion span and the second closes it, producing a cross-line `<del>`. The serializer then writes `~~` around the span, so a Visual→Source round-trip changes the canonical markdown. The editor also conflated two different states: "the DOM needs serialising" (`editorDirty`) and "the note differs from its head" (unsaved changes). `applySharedText` set the former based on the latter, so merely opening a draft and switching modes could re-serialise the rendered DOM.

## Goals / Non-Goals

**Goals:**
- Render single tildes literally and only `~~` as strikethrough.
- Make clean mode switches byte-preserving.
- Make draft snapshots and remote updates leave the editor surface in sync without forcing a re-serialise.
- Keep real edits serialised immediately and reliably.

**Non-Goals:**
- Preserving arbitrary whitespace/indentation through contentEditable editing.
- Changing the canonical markdown format or adding a new syntax.
- Supporting single-tilde strikethrough as an extension.

## Decisions

### Decision 1: Consume lone tildes before marked's GFM tokenizer

Add a marked inline extension with a tokenizer that matches a `~` not followed by another `~` and returns it as a literal text token. The built-in `del` tokenizer still handles `~~text~~`. This is applied at inline tokenization time, so:
- tildes inside code spans/fences are untouched by the code tokenizer;
- tildes inside link destinations are part of the link token and are not consumed separately;
- `~path~` no longer becomes strikethrough;
- `~~deleted~~` is unchanged.

The alternative—escaping tildes in a preprocess hook—was rejected because it risks changing link URLs and has to re-implement markdown context detection.

### Decision 2: `editorDirty` means DOM synchronisation state

`editorDirty` is only read by `serializeEditorIfDirty()` before save, blur, and mode switches. It SHALL be set only when the Visual DOM changed without being serialised. In practice:
- `onEditorInput` and every editor command call `syncVisualEditor()`, which serialises and clears the flag.
- `applySharedText` renders from canonical markdown (or updates the textarea) and clears the flag.
- `startEditing`/new-note setup clear the flag.

Unsaved-change detection remains `hasUnsavedChanges()`, which compares the canonical title/content with the note head. The two concepts must not be coupled again.

### Decision 3: Do not re-serialise on a clean mode switch

`setEditorMode` still calls `serializeEditorIfDirty()` as a safety net, but after normal edits the flag is false and the source textarea receives the already-serialised markdown. Merely opening a note—including a note with a shared draft—and toggling Visual/Source does not rewrite the source.

### Decision 4: Accept whitespace normalisation as a Visual-editing limitation

ContentEditable collapses leading spaces; serialising indented plain text after an edit cannot recreate the original indentation. The fix targets the false strike and unintended clean-switch rewrite. Users who need byte-exact indentation should use Source mode or a fenced code block.

## Risks / Trade-offs

- **[Risk] A custom inline tokenizer interacts with emphasis parsing** — the tokenizer only consumes a single `~` at the current position and leaves `~~` runs to marked; tests cover real strikethrough, literal tildes, code spans, and paths.
- **[Risk] Some DOM changes do not fire `input`** — editor commands, image insertion, resize, image-error handling, and paste all call `syncVisualEditor()` explicitly. `serializeEditorIfDirty()` remains as a fallback.
- **[Risk] Indentation still changes after an edit** — documented residual limitation; not a regression from the canonical-markdown model.

## Migration Plan

None.

## Open Questions

None.
