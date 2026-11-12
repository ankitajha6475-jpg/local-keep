# Design: visual tokens and media

## Scrollbars

The guide is explicit about the shape of the fix:

> MANDATORY: Use `scrollbar-color` and `scrollbar-width` on the scrollable
> container. Choose a thumb color with a contrast ratio of at least 3:1
> against the track color, and against the container's background where the
> track may be transparent, such as with macOS overlay scrollbars.
>
> When using `scrollbar-color`, use CSS variables to keep thumb and track
> colors separate, for readability and maintainability.

So the tokens go in `src/styles/base.css`, where the other shared tokens
already live:

```css
:root {
  --scrollbar-thumb: #80868b;      /* 3.68:1 on #ffffff */
  --scrollbar-track: transparent;
  --scrollbar-thumb-dark: rgba(255, 255, 255, 0.4);  /* 3.53:1 on #2e2e2e */
}
```

`#80868b` rather than `--text-muted` (`#6b7280`): the thumb is a
non-text graphic and only needs 3:1, and `#80868b` is the closest value to
the current `#dadce0` that clears it, so the scrollbar keeps its subtle look.

For the pen inspector's log, the container background is
`rgba(0, 0, 0, 0.82)` over the whiteboard, which composites to `#2e2e2e`. The
current `rgba(255, 255, 255, 0.15)` composites to `#4d4d4d` — 1.61:1.
`rgba(255, 255, 255, 0.4)` composites to `#828282` — 3.53:1.

### The `@supports` wrapper

> Wrap legacy fallbacks in an `@supports not (scrollbar-color: auto)` block
> to prevent conflicts between standard properties and legacy WebKit
> selectors in browsers that support both natively.

Both scrollbar blocks move into that wrapper. Because the custom properties
cascade into the legacy selectors, the fallback block does **not** repeat the
colours — it only sets the width and lets `var(--scrollbar-thumb)` flow
through:

```css
.note-preview,
.markdown-preview {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

@supports not (scrollbar-color: auto) {
  .note-preview::-webkit-scrollbar,
  .markdown-preview::-webkit-scrollbar {
    width: 4px;
  }

  .note-preview::-webkit-scrollbar-thumb,
  .markdown-preview::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 2px;
  }
}
```

The `::-webkit-scrollbar-track` rule is dropped: the track is transparent, so
there is nothing to style.

The pen inspector's log gets the same treatment with the dark thumb token.

## Colour scheme

The audit recorded this as a **product decision**, not a defect: the app is
deliberately light-only, and whether it should follow
`prefers-color-scheme` is still open. So this change declares intent without
committing to a dark theme:

```css
:root {
  color-scheme: light;
}
```

That is the minimum correct step — it tells the UA to render scrollbars,
`<select>` popups, autofill, and other browser-drawn surfaces in their light
variants, so they stop fighting the app. A full dark theme would be a
separate proposal.

## Images

The guide's `optimize-image-priority` rules, applied to the three image
surfaces:

| Surface | LCP? | Treatment |
|---|---|---|
| Dashboard card thumbnail | no | `loading="lazy"`, `decoding="async"` |
| Whiteboard page tile | no | `loading="lazy"`, `decoding="async"` |
| Rendered note image | no | `loading="lazy"`, `decoding="async"` |

None of them is the LCP element — the dashboard's LCP is the note text, and
the note view's is the body copy — so `loading="lazy"` is correct for all
three. The guide is explicit that a lazy image must **not** also carry
`fetchpriority="high"`, and that `fetchpriority="low"` must not be combined
with `loading="lazy"` on standard below-the-fold images, so neither attribute
is used.

`decoding="async"` lets the browser decode off the main thread, which keeps
the scroll smooth while a large whiteboard page PNG decodes.

### Reserved space

The audit claimed the card thumbnail caused layout shift because "the
container has no `aspect-ratio`". Checking the code, **that claim is wrong**
for both images that were flagged:

- `.note-card` has `height: 380px` and is a flex column, and
  `.canvas-thumbnail-wrapper` has `flex: 1; min-height: 0`. The wrapper's
  height comes from the card, not from the image, so the card does not move
  when the thumbnail arrives. Adding `aspect-ratio: 16 / 9` to
  `.canvas-thumbnail` would be dead CSS anyway: the rule already sets
  `height: 100%`, and `aspect-ratio` only applies when one axis is `auto`.
- `.wb-page-card img` has a fixed `height: 110px`. Same conclusion.

So no `aspect-ratio` is added. Adding one would have been a no-op that
looked like a fix — the failure mode `AGENTS.md` gotcha 58 warns about.

The one image that genuinely has an intrinsic size is a rendered note image,
and its ratio is not knowable at render time: the server does not report the
dimensions of a stored image, and the markdown `{width=N}` extension carries
width only. Reserving space there would need the image store to report
dimensions, which is a server-side change and out of scope. `loading="lazy"`
and `decoding="async"` are the applicable improvements there.

The requirement is written conditionally — "any image whose size is not
already fixed by its layout" — so the spec matches what the code can
actually guarantee.

### Alternative text

`alt="Canvas thumbnail"` says nothing about *which* note. The card already
knows the display title, so the alternative text becomes
`Canvas thumbnail of {title}` — the same rule the guide gives for icons:
describe the purpose, not the shape.

The whiteboard page tile already names its page
(`Whiteboard page {n}`), and rendered note images use the note's own alt
text, so neither changes.

## Known limits

- The note view's rendered images are sanitised through DOMPurify after
  `marked` builds them. Adding `loading` and `decoding` to the renderer's
  output does not change that; DOMPurify's default configuration allows both
  attributes, and the existing sanitiser test covers the attribute allowlist.
