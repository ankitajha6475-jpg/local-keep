## Why

A `modern-web-guidance` audit found seven accessibility defects:

1. **Focus indicators.** Twelve rules set `outline: none`; four replaced it
   with a `box-shadow` ring at 1.2:1, below the 3:1 non-text minimum.
2. **Accessible names.** Twenty-three icon-only buttons are named by `title`
   only, which no assistive technology can read.
3. **Labels.** The properties panel renders `<label>` elements with no `for`,
   so they name nothing.
4. **Contrast.** `#80868b` is the app's only muted-text token: 32
   declarations at 10.9-12.5px, all at 3.68:1 on white.
5. **Combobox.** The tag input declares `role="combobox"` but has no
   `aria-controls`, option ids, or `aria-activedescendant`, so the arrow-key
   highlight it already implements is silent.
6. **Live regions.** One ad-hoc `role="status"`; copy and admin feedback have
   no announcement path.
7. **Reduced motion.** Nothing honours `prefers-reduced-motion`, against
   eight keyframe animations and nine spatial transitions.
## What Changes

- A global stylesheet SHALL define the colour, focus-ring, and motion tokens,
  and SHALL apply one focus indicator to every focusable control.
- Every `outline: none` SHALL be removed.
- Every icon-only control SHALL expose an `aria-label`.
- Every form control SHALL be associated with its label through `for`/`id`.
- The muted-text token and the failing colours SHALL be replaced by tokens
  that meet 4.5:1 on the surfaces they sit on.
- The tag input SHALL be wired as a real combobox.
- The app SHALL keep one polite and one assertive live region and SHALL route
  its announcements through them.
- Spatial motion SHALL be opt-in behind `prefers-reduced-motion: no-preference`.

## Capabilities

### New Capabilities

- `accessibility-baseline`: the workspace-wide floor for focus indicators,
  accessible names, label association, text contrast, reduced motion, and
  live-region announcements.

### Modified Capabilities

- `note-tags`: the tag suggestion list is wired as an ARIA combobox.

## Impact

- **Affected code**: `src/styles/base.css` (new), `src/main.js`,
  `src/App.vue`, `src/components/LinkDialog.vue`, `src/components/TagSidebar.vue`,
  `src/components/SelectionLinksPanel.vue`, `src/components/BacklinksPanel.vue`,
  `src/components/GraphView.vue`, `src/components/WhiteboardEditor.vue`,
  `src/components/DashboardNoteCard.vue`.
- **Behaviour**: no data, schema, or API changes. Visual changes are limited
  to a slightly darker muted grey, a visible focus ring, and static motion
  when the OS asks for reduced motion.
- **Risk**: low. The focus ring is the most visible change; it is scoped to
  `:focus-visible` so pointer users do not see it.
