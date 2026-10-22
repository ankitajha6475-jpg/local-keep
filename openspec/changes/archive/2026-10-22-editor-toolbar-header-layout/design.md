# Design: Editor toolbar header layout

## Context

The note editor modal currently has two control rows:

1. `.modal-header`: `h2` title (`Editing Note`/`New Note` + revision badge +
   live badge) and action buttons (Graph, Backlinks, History, close).
2. `.note-editor-toolbar`: mode switch · divider · markdown tool groups ·
   spacer · paste-mode select · image button.

The user wants editor-level controls out of the content toolbar, the image
button beside the markdown tools, and a simplified title.

## Goals / Non-Goals

- Goals:
  - Mode switch and paste-mode select live in the modal header.
  - Image button flows inline after the markdown tool groups (no spacer).
  - Header title is plain `Editor` with no revision badge; keep `● Live`.
  - Zero behavior change for shortcuts, paste persistence, uploads.
- Non-Goals:
  - No changes to the markdown tools themselves, shortcuts map, or collab.
  - No responsive redesign beyond letting the header row wrap.

## Decisions

### Decision 1: Bottom action row = left controls + right commit buttons

The `.note-form-actions` row already uses `display:flex;
justify-content:space-between`. A new `editor-footer-controls` group (mode
switch + paste select) sits at the start and the existing `action-buttons`
(Save/Draft/Discard) stay at the end. The `Ctrl+Enter to save` hint is removed.
The mode switch and paste select reuse their existing classes so all CSS and
keyboard shortcut wiring is untouched.

### Decision 2: Image button inside the toolbar's wrapping flow

`MarkdownToolbar.vue` gains an `append` slot rendered inside `.md-tools`, so the
image button participates in the same wrapping flex flow as the tool groups —
when the modal shrinks it wraps onto the tool rows instead of dropping to a
lone line. Scoped CSS `.note-editor-toolbar .image-btn` matches `.md-tool-btn`
sizing (30×30, same padding/border/radius) so it reads as a tool. The generic
`.toolbar-spacer` CSS block at ~line 6768 is unused in App.vue
(DashboardNoteCard defines its own scoped one), so it is removed; the
`.toolbar-spacer` rule next to the toolbar styles stays only if still
referenced — it is not, so both go.

### Decision 3: Title simplification

Replace `{{ editingId ? 'Editing Note' : 'New Note' }}` with the literal
`Editor` and delete the revision badge span. `editingRevisionNo` stays in state
(it still drives history/save logic elsewhere); only the header badge is
removed. The `● Live` badge and its peers count remain, and the
`Ctrl+Enter to save` hint text is dropped.

## Risks / Trade-offs

- Bottom row is denser on narrow modals → `editor-footer-controls` uses
  `flex-wrap: wrap` so the controls wrap instead of overflowing.
- Removing the revision badge loses at-a-glance version info → History button
  remains one shortcut away; acceptable per user request.

## Migration Plan

Single frontend commit; no data, API, or protocol changes.
