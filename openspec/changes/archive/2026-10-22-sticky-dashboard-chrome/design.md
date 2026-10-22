## Context

The authenticated dashboard renders `header` (brand, search, account actions) outside `main`, then `main > .workspace > .workspace-content` with either `.control-bar` (sort/filter) or `.selection-bar` (multi-select actions) above `.notes-grid`. The header is already `position: sticky; top: 0`, but both bars are normal flow elements, so they leave the viewport on scroll.

## Goals / Non-Goals

**Goals:**
- Header stays pinned while the gallery scrolls.
- The active bar (control or selection) stays pinned immediately below the header.
- Pinned offsets stay correct on small screens and when the header changes height.
- The pinned bars never overlap each other or obscure cards without the user being able to scroll past them.
- Dashboard actions expose the same Alt/Option shortcut-hint behavior as the note editor.
- Header controls share one modern icon language and stay usable down to small phone widths.

**Non-Goals:**
- Making the note editor modal toolbar or history panel sticky.
- Changing tag sidebar pinning, sort behavior, or selection behavior.
- Introducing a scroll container or virtualized grid.
- Adding new keyboard shortcuts; hints only reflect shortcuts that already work.

## Decisions

### Decision 1: CSS `position: sticky` for both bars

Use `position: sticky` with `top: var(--app-header-height)` on `.control-bar` and `.selection-bar`, `z-index: 9` (below the header's `10`). Both bars are opaque and stay in normal flow, so the grid's first row still starts below them and no spacer element is needed.

Alternative rejected: a fixed top bar. Fixed positioning would require a manual spacer and would not honor the workspace's centered column or the sidebar layout.

### Decision 2: Measure the header with `ResizeObserver`

The header's height varies with viewport padding (`1rem` → `0.75rem` below 600px) and can change when content reflows. A `ResizeObserver` on the header writes the measured pixel height to `--app-header-height` on `documentElement`. A CSS fallback (`69px`, `61px` below 600px) covers the first paint and browsers without `ResizeObserver`.

Alternatives rejected: hard-coded `top` values drift with responsive changes; adding the bars inside the `header` element would disturb the workspace column and the sidebar.

### Decision 3: One pinned slot for two mutually exclusive bars

The template already renders either `.control-bar` or `.selection-bar`. Giving both the same sticky offset keeps a single pinned slot when selection starts or ends; no transition animation is added beyond the existing `fadeIn`.

### Decision 4: Reuse the editor's Alt/Option reveal state

The dashboard reuses the existing global `shortcutsVisible` state (previously `editorShortcutsVisible`) that the window keydown/keyup/blur listeners already maintain. A `.shortcuts-visible` class on `.header-inner` and `.fab-container` changes tooltip pseudo-content from `data-label` to `data-shortcut`. Unlike the editor toolbar, dashboard shortcut tooltips are shown for every action that declares a shortcut as soon as Alt/Option is held, without requiring hover; with only Search and Create declaring shortcuts, this stays unobtrusive and makes the feature discoverable. Actions without a shortcut keep their action label, so the hint never promises a binding that does not exist. Pointer events with `altKey` also turn the state on, covering browsers/environments that miss the modifier keydown. The editor toolbar continues to receive the same state as a prop and keeps its hover-only display.

### Decision 5: Inline SVG icon component instead of emoji

Add `src/components/AppIcon.vue`, a small stroke-icon component with a static preset map (note, refresh, tag, graph, search, sparkles, zap, chevron, plus, whiteboard, x, settings, users, sliders, plug, lock). Inline SVG avoids emoji-font differences and gives a consistent 20px stroke weight. The header keeps its existing click handlers and adds `aria-label`/`data-label` attributes.

### Decision 6: Glass header without a new scroll container

The header keeps `position: sticky` and gains a translucent white background, backdrop blur, and a hairline border. This keeps the existing document scroll and avoids a fixed header with a manual spacer. The control/selection bars remain sticky children of the workspace.

## Risks / Trade-offs

- **[Risk] Sticky context** — an ancestor with `overflow` other than `visible` would break pinning. The dashboard chain (`body`, `.main-app`, `main`, `.workspace`) has no overflow clipping; keep it that way.
- **[Risk] Stacking** — the bars must stay below the header. Header `z-index: 10`, bars `z-index: 9`.
- **[Risk] Tall header on narrow screens** — the measured height handles wrapping; the fallback is only used before measurement.

## Migration Plan

None. CSS and client lifecycle only.

## Open Questions

None.
