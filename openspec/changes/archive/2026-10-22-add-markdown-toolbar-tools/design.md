## Context

The text editor is a contentEditable surface rendered from markdown (`renderEditorContent`) and serialized back through `serializeEditorToMarkdown()`. Source mode is a markdown textarea. The existing toolbar lives inside the note form and only formats through `document.execCommand` in Visual mode; Source mode has no toolbar commands.

`editorSerialize.js` already understands headings, ordered/unordered lists, blockquotes, fenced code, inline code, tables, horizontal rules, links, wiki links, and strike text, so the toolbar can manipulate DOM nodes and let the existing serializer produce canonical markdown.

## Goals / Non-Goals

**Goals:**
- Provide the common markdown tools in one discoverable row.
- Work in both Visual and Source modes.
- Preserve the editor selection when clicking a tool.
- Make shortcuts platform-aware and reveal them while Alt/Option is held.

**Non-Goals:**
- Replacing the markdown renderer or serializer.
- Adding WYSIWYG table editing, image resizing changes, or a command palette.
- Server-side rendering or persistence changes.

## Decisions

### Decision 1: Shared tool definitions

`src/shared/editorTools.js` exports `EDITOR_TOOLS` (id, group, label, icon, key code, modifier flags, shortcut label) and `matchEditorShortcut(event)`. Both the toolbar and the editor keydown handler use the same definitions, preventing drift.

Shortcut matching uses `event.code` and explicit Shift/Alt flags, so `Ctrl+Shift+8` still matches on layouts where Shift changes the produced character. Matching requires Ctrl or Cmd, so plain typing and IME composition are unaffected.

### Decision 2: DOM commands for Visual, textarea commands for Source

- Visual inline formatting uses `document.execCommand` where it is reliable (`bold`, `italic`, `strikeThrough`, `createLink`, list commands, horizontal rule) and range surgery for inline code, wiki links, code blocks, and tables.
- Source mode uses selection-aware string edits: inline wrappers for text spans, line-prefix transforms for headings/lists/quotes, and block templates for code/tables/rules.
- Every command ends in the normal serialization path (`newNoteContent` for Visual; direct v-model updates for Source).

### Decision 3: Toggle block formats

Headings, quotes, and list variants toggle off when every affected line/block already has that format. Unordered, ordered, and task prefixes replace one another rather than stacking (`- ` is stripped before adding `1. ` or `- [ ] `).

### Decision 4: Alt reveals shortcuts

The toolbar tracks whether Alt/Option is held. Tooltips normally show the tool name; while Alt is held, the tooltip shows the platform shortcut (Cmd on macOS, Ctrl elsewhere, Option for Alt). This keeps shortcuts discoverable without adding permanent visual noise.

### Decision 5: Preserve selection on click

Toolbar buttons use `@mousedown.prevent` and `@click`. Preventing mousedown keeps focus and the selection in the editor/textarea; the command then acts on that selection instead of falling back to the end of the document.

## Risks / Trade-offs

- **[Risk] `execCommand` is deprecated** — already used by the editor and reliable in the supported Chromium/WebKit/Firefox versions; range fallbacks cover link insertion.
- **[Risk] Shortcut conflicts with browser/OS actions** — shortcuts requiring Ctrl/Cmd still `preventDefault`; combinations that are commonly reserved (e.g. Ctrl+Shift+T, Ctrl+E, Ctrl+Alt+T) were avoided.
- **[Risk] DOM block insertion differs by browser** — serialization is the source of truth and handles the resulting structures; the Visual surface may briefly show raw marker text for task items, as it does today.

## Migration Plan

Pure frontend change. Existing notes and revisions are untouched.

## Open Questions

none.
