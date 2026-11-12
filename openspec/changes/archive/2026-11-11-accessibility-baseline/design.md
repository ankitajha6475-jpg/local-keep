# Design: accessibility baseline

## Where the global rules live

`src/styles/base.css` is a new, **unscoped** stylesheet imported from
`src/main.js` before `App.vue`. It holds the three things that must apply
across every component, including the ones whose own styles are `scoped`:

- the design tokens on `:root`,
- the focus indicator,
- the `.sr-only` live-region utility.

Tokens are the reason a single global file is enough: CSS custom properties
inherit through the DOM regardless of style scoping, so `var(--text-muted)`
works inside `TagSidebar.vue`'s scoped styles without any extra wiring. The
focus rule and `.sr-only` are plain selectors, so they need a genuinely global
stylesheet — `App.vue`'s own `<style>` is unscoped and would work too, but a
separate file makes the global surface obvious and keeps it out of a
9,000-line component.

## Focus indicators

One rule, applied to everything focusable:

```css
:where(a:any-link, button, input, select, textarea, summary, [contenteditable], [tabindex]):focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

Three decisions:

**`:focus-visible`, not `:focus`.** The codebase currently mixes 15
`:focus-visible` uses with 32 `:focus` uses. `:focus-visible` shows the ring
for keyboard and assistive-technology focus without painting it on every
mouse click. Text inputs and `contenteditable` still match it when focused,
because browsers treat them as always focus-visible.

**`:where()` on the whole selector.** Per `AGENTS.md` gotcha 59, a fallback
that must lose to a component modifier class has to be wrapped whole. Here
the rule must *win* over the per-component `:focus` rules, so it must not be
more specific than them. `:where()` gives the whole selector zero specificity
for the element part, leaving only `:focus-visible` (0,1,0) — lower than any
component's `.class:focus` (0,2,0). That means a component rule can still
override the ring deliberately, which is the intent.

**All twelve `outline: none` declarations are deleted.** This is the part
that cannot be skipped: a leftover `outline: none` in a component rule would
silently win over the global rule and the control would have no indicator at
all. The old replacement indicators (`box-shadow: 0 0 0 3px rgba(...,0.14)`
at 1.2:1, and a 1px `border-color` change) are kept where they exist — they
are a weaker secondary cue — but the outline is now the real one.

The ring colour is `#1a73e8`, **4.51:1** against white, above the 3:1
non-text minimum.

## Colour tokens

Two tokens replace four hard-coded colours:

| token | value | ratio on white | replaces |
|---|---|---|---|
| `--text-muted` | `#6b7280` | 4.83:1 | `#80868b` (32 uses), `#94a3b8` (12), `#9aa0a6` (1) |
| `--text-success` | `#137333` | 5.95:1 | `#1e8e3e` (2) |

`#80868b` is 3.68:1, which would be acceptable for large text only, but every
use is 10.9–20px normal weight — so all 32 need 4.5:1. `#6b7280` is the
nearest value that clears it: a slightly darker, slightly cooler grey that
reads the same at 11px.

`#137333` was already in the file (used for other success text), so the
"Copied" confirmation colour becomes consistent with the rest of the palette
rather than introducing a new green.

`#94a3b8` and `#9aa0a6` were not decorative: the auth hint and the empty
editor placeholder are exactly the two texts a user most needs to read.

## Reduced motion

The guide is explicit about two things that shape the implementation:

> **DO NOT** globally apply `animation-duration: 0.01ms;` as it can cause
> certain animations to become _more_ jarring. Instead, handle reduced motion
> on a case-by-case basis by nesting the `@media` query inside the rule so
> both versions are kept together. Keep non-motion transitions (such as `color`
> or `background-color` changes on links and buttons) enabled; only dampen or
> disable spatial movement, scaling, rotation, or persistent animations.

So:

- **The seven keyframe animations** (`sync-pulse`, `note-skeleton-shimmer`,
  `slideUp`, `fadeIn`, `presence-pulse`) move out of their base rules and
  into `@media (prefers-reduced-motion: no-preference)`. Under reduced motion
  the animation does not exist at all — the element keeps its base style,
  which is already the animation's final state for the entrance animations.
- **The nine spatial transitions** keep their colour, opacity, filter,
  box-shadow, and border-radius properties in the base rule; only the
  `transform` component moves into the media query. Colour changes therefore
  keep animating.

All sixteen overrides live in **one** `@media` block at the end of `App.vue`'s
stylesheet rather than scattered next to each rule. Every affected base rule
is in `App.vue`, all sixteen selectors are unique, and the block is last in
the sheet — so equal specificity always resolves in the block's favour, with
no ordering hazards. It is also reviewable as a single list.

`:where(.note-card)` is repeated verbatim inside the block: its zero
specificity means it has to be matched exactly.

## Live regions

The visible revision toast currently carries `role="status"` itself. Leaving
it would mean two polite regions, which is exactly what the guide warns
against ("A single `polite` region and a single `assertive` region per page …
keeps announcements consistent"). So:

- the toast keeps its visible text but loses `role="status"`,
- a visually hidden polite region and a visually hidden assertive region are
  always present,
- `notify(message, level)` writes to one of them and clears it after a beat,
  so two identical messages in a row are announced twice.

`revisionNotice` is routed through `notify()`, so the visible toast and the
spoken announcement come from one source and cannot drift.

## Combobox wiring

The tag input already behaves like a combobox — arrow keys move a highlight —
but never tells assistive technology. The fix is purely additive:

- `aria-controls="tag-suggestions"` on the input, `id="tag-suggestions"` on
  the list,
- `id="tag-suggestion-<index>"` on each option,
- `aria-activedescendant` on the input, pointing at the highlighted option.

`aria-activedescendant` is only set while the list is open: the list is
removed from the DOM by `v-if` when closed, and a reference to a missing id is
invalid.

## Known limits

- The `role="tablist"` and `role="menu"` patterns are **not** fixed here.
  Both need either a full keyboard implementation or a decision to drop the
  ARIA, and the latter interacts with the native-dialog migration. They are
  tracked by the `native-modal-overlays` change.
- `title` attributes are kept alongside the new `aria-label`s. The title is
  still the visual tooltip; the `aria-label` is the accessible name.
- The Excalidraw bundle ships its own CSS that removes focus outlines from
  its internal controls (`.excalidraw ... { outline: none }`). Those rules are
  in the vendor stylesheet, not in `src/`, so the shared ring does not reach
  them and this change does not touch them. The whiteboard's *own* chrome —
  the header buttons and the title field — is ours and does get the ring.
- The pen-inspector panel's filter chips are `<span>` elements with a click
  handler, so they are not keyboard reachable. That is a keyboard-navigation
  defect rather than a naming one, and it is left for a later change.
