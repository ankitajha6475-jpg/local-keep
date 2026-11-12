## 1. Global tokens and focus indicator

- [x] 1.1 Add `src/styles/base.css` with the `:root` tokens and import it from `src/main.js`
- [x] 1.2 Add the global `:focus-visible` focus ring rule
- [x] 1.3 Add the `.sr-only` utility class
- [x] 1.4 Delete all 12 `outline: none` declarations

## 2. Text contrast

- [x] 2.1 Replace `#80868b` with `var(--text-muted)` across all components
- [x] 2.2 Replace `#94a3b8` with `var(--text-muted)`
- [x] 2.3 Replace `#9aa0a6` with `var(--text-muted)`
- [x] 2.4 Replace `#1e8e3e` with `var(--text-success)`
- [x] 2.5 Add a source-level contrast regression test

## 3. Accessible names

- [x] 3.1 Add `aria-label` to the 7 `close-modal-btn` buttons in `App.vue`
- [x] 3.2 Add `aria-label` to the toast dismiss, tag-filter clear, and property-add buttons
- [x] 3.3 Add `aria-label` to the icon-only buttons in `LinkDialog`, `TagSidebar`, `GraphView`, `BacklinksPanel`, `SelectionLinksPanel`, `DashboardNoteCard`, `WhiteboardEditor`
- [x] 3.4 Add a source-level test that every icon-only button has an accessible name

## 4. Label association

- [x] 4.1 Associate the `aliases` property label with its input
- [x] 4.2 Associate the user property labels with their inputs and checkboxes
- [x] 4.3 Associate the `add` property label with its input

## 5. Combobox wiring

- [x] 5.1 Give the tag suggestion list an `id` and reference it with `aria-controls`
- [x] 5.2 Give each suggestion option a stable `id`
- [x] 5.3 Point `aria-activedescendant` at the highlighted option

## 6. Live regions

- [x] 6.1 Add the polite and assertive live regions
- [x] 6.2 Add the `notify()` helper and route `revisionNotice` through it
- [x] 6.3 Remove `role="status"` from the visible toast so there is one polite region

## 7. Reduced motion

- [x] 7.1 Move the 8 keyframe animations into a `prefers-reduced-motion: no-preference` block
- [x] 7.2 Move the `transform` part of the 9 spatial transitions into the same block
- [x] 7.3 Keep colour, opacity, filter, box-shadow, and border-radius transitions outside the block
- [x] 7.4 Add a source-level test that every animation declaration is inside a reduced-motion guard

## 8. Verification and docs

- [x] 8.1 Run the full test suite
- [x] 8.2 Run the frontend build and check the built CSS
- [x] 8.3 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 8.4 Run `openspec validate --strict`
