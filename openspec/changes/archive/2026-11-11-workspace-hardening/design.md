# Design: workspace hardening

Four unrelated findings land in one change because they are all "the shape of
the workspace and the server that serves it" work. They do not interact, so
each one is a separate, independently reviewable section below.

## 1. Security headers

### The policy that is safe to enforce today

```http
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
X-Frame-Options: DENY
```

Three reasons this set is safe:

- **It has no `default-src`.** A CSP without `default-src` restricts only the
  directives it names. Scripts, styles, images, and connections are
  unconstrained, so the Excalidraw React mount, the Vite dev server's HMR
  client, the inline critical CSS, and the `blob:` URLs Excalidraw uses for
  exported images are all unaffected.
- **`frame-ancestors 'none'` and `object-src 'none'` have nothing to break.**
  The app never embeds a frame and never instantiates `<object>` or
  `<embed>`.
- **`base-uri 'none'` is a no-op** for a document with no `<base>` element.

`X-Frame-Options: DENY` is the legacy spelling of `frame-ancestors 'none'`.
It is kept because it is understood by engines that predate CSP frame
ancestors, and because it costs nothing.

### Why `nosniff` is safe here

`nosniff` only matters for responses whose `Content-Type` is wrong or absent.
Every route that serves content sets it:

- `/api/images/*` sets `imageMimeForExt(ext)` from the stored extension.
- `express.static` derives the type from the file extension. The only static
  assets that ship are the Excalidraw fonts (`.woff2`) and the built
  JavaScript, CSS and images.

### Where the middleware goes

It is registered before the route handlers, so it covers the API, the image
routes, the `/mcp` endpoint, and — in production — the static frontend that
`express.static` serves from `dist/`.

The WebSocket handshake is not an HTTP response and is not covered. That is
correct: the upgrade response carries no document.

### What is deferred, and why

The audit's phase 2 is `require-trusted-types-for 'script'` with a reporting
endpoint. It is **not** implemented here, for two reasons:

1. **The `innerHTML` sinks are real.** `src/utils/markdown.js` writes the
   sanitised HTML through `innerHTML`, `src/utils/mermaid.js` does the same
   for the rendered diagram, and the editor's Visual mode writes the
   serialised DOM back through `innerHTML`. Trusted Types would need all
   three converted to `textContent` / `document.createElement` / the
   Sanitizer API first, and the Sanitizer API is not Baseline.
2. **The dev server and the React mount share the document.** A nonce or
   hash policy has to survive `vite`'s injected HMR client and React
   Refresh's injected preamble, which are generated per request.

The deferred phase is therefore a **report-only** policy with a reporting
endpoint, deployed before it is enforced. That is a separate change with its
own threat-model discussion, and the audit says as much.

### The dev-server gap

In development the HTML document is served by Vite on `:5174`, not by
Express, so the document itself does not carry the headers. The API
responses proxied through Vite do. This is recorded in `AGENTS.md` so nobody
reads the dev behaviour as the production behaviour.

## 2. The `__Host-` session cookie

### The rule

A cookie named `__Host-<name>` is only accepted by the browser when it has
all three of:

- the `Secure` attribute,
- `Path=/`,
- no `Domain` attribute.

The cookie already has `Path=/` and no `Domain`, so the only question is
whether `Secure` is guaranteed.

### One predicate decides both

`Secure` is set when `NODE_ENV === 'production'` or `COOKIE_SECURE === '1'`.
The prefix is applied under exactly the same condition, so the two can never
disagree: a prefixed cookie is always `Secure`, and a `Secure` cookie is
always prefixed.

The predicate is read at call time, not at module load, so a test can vary it
per process.

### The deploy consequence

The cookie name changes from `local_keep_session` to
`__Host-local_keep_session`. A browser that still holds the old cookie sends
it, the server does not recognise it, and the user is asked to log in once.
The sessions themselves are untouched: they live in the `sessions` table and
stay valid, so the re-login re-issues the same session id.

The old cookie is not accepted alongside the new one. Accepting it would
re-open exactly the hole the prefix closes — a cookie set on a sibling host
could shadow the session cookie.

### What is not changed

- The value format is untouched: `<sessionId>.<hmac(sessionId)>`.
- The `X-Auth-Token` header path is untouched. It carries the raw session id,
  not a cookie, so the prefix does not apply to it.
- The WebSocket `?token=` path is untouched, for the same reason.

## 3. Container queries for the workspace

### The bug this fixes

The sidebar stacking breakpoint is `max-width: 600px`, and it is measured
against the **viewport** in both files. But the space that matters is the
workspace's content box, and `main` has `2rem` of horizontal padding:

```
workspace width = min(viewport, 1264) - 64
```

So between a 600px and a 664px viewport the media query does not fire, while
the workspace is already narrower than the breakpoint it is supposed to
respect. The sidebar stays beside the notes in a space that cannot hold
them.

### The container

`main` becomes the query container:

```css
main {
  container-type: inline-size;
  container-name: workspace;
}
```

A container query measures the **content box**, so the threshold now means
what it says: the workspace is at most 600px wide.

### Why `main` and not `.workspace`

A query container cannot style itself. `.workspace` is the flex container
that has to switch to `flex-direction: column`, so the container has to be
its **parent**. `main` is that parent, and it is also the element whose
content box the workspace actually fills.

### Why `contain: layout` on `main` is safe

`container-type: inline-size` implies `contain: layout style inline-size`.
Layout containment has two side effects that had to be checked:

1. **`main` becomes a containing block for absolutely positioned
   descendants.** Every absolutely positioned element inside `main` already
   has a closer positioned ancestor:
   - `.presence-dot` → `.note-card` (`position: relative`).
   - `.note-color-menu` → `.card-color-picker` (`position: relative`).

   Nothing moves.

2. **`main` becomes a stacking context.** The header is a sibling of `main`
   with `position: sticky; z-index: 10`, and the control bar is a sticky
   descendant of `main` with `z-index: 9`. Before the change, both were in
   the root stacking context and the header won on `z-index`. After the
   change, the control bar's `z-index: 9` is scoped to `main`, and `main`
   itself paints below the header — the same relative order as before.
   Layout containment does **not** clip overflow, so the sticky control bar
   still shows through the `main` padding.

### The breakpoint now lives in one mechanism

Today the threshold is written twice, in two files, and the two copies are
kept in sync by a comment. `AGENTS.md` records what happens when they drift:
the sidebar lands inside a row flex container and crushes the notes area.

After the change both rules are container queries against the same named
container, and `tests/responsiveLayout.test.js` asserts that the two files
use the same container name **and** the same threshold. The comment is
replaced by a test that fails.

## 4. `content-visibility` on the card body

### Where it goes, and where it does not

The audit proposed `.note-card-body`. There is no such element; the card body
is `.note-content` (the column holding the title, the tag chips, the preview
and the date). That is where the property goes.

The **preview** (`.note-preview`) is deliberately excluded. It is a scroll
container (`flex: 1; overflow-y: auto`), and a skipped subtree has no
scrollable overflow: the scrollbar would disappear while the card is
off-screen and reappear when it is revealed, reflowing the text under the
user's cursor. Skipping the card body skips the preview with it, which has
the same problem.

The card body is the right target because **the card's height does not depend
on it**:

- `.note-card` has an explicit `height: 380px`.
- `.note-content` is `flex: 1` with `flex-basis: 0%`, so its used height
  comes from the flex algorithm, not from its contents.
- The scroller's row height is `396px` (380px card + 16px gap) and is set by
  the scroller, not by the card.

So `contain: size` on `.note-content` changes nothing about the layout.

### The one thing that had to move

`content-visibility: auto` implies paint and layout containment, which makes
the element a containing block for absolutely positioned descendants.
`.presence-dot` is `position: absolute; top: 3.25rem; right: 1rem` and it
lived inside `.note-content`, where its containing block was `.note-card`
(`position: relative`). With containment it would become `.note-content` and
the dot would drop by the height of the card toolbar.

The dot moves out of `.note-content` and becomes a direct child of
`.note-card`. It stays absolutely positioned, so it takes no space in the
flex layout, and its containing block is still `.note-card` — exactly where
it was.

### Why this is safe for keyboard and screen-reader users

`content-visibility: auto` skips *rendering*, not the accessibility tree.
The skipped contents stay focusable, selectable, and findable, and they stay
in the accessibility tree. This is the documented difference between `auto`
and `hidden`; `hidden` would remove them from the tab order and the
accessibility tree, and is not used here.

### The win

The dashboard virtualises rows, so only the visible rows plus an 800px
buffer are in the DOM. `content-visibility` skips the layout and paint of the
card bodies in that buffer. It is a modest win, and it is the honest size of
the win: the virtual scroller has already done the heavy lifting.

## 5. What this change does not do

- No strict `default-src` CSP, and no Trusted Types. See section 1.
- No dark mode. `color-scheme: light` already declares the intent.
- No change to the note dashboard's column-count algorithm. It is already
  container-driven: `noteColumnCount` is computed from the measured width of
  the grid element with a `ResizeObserver`, not from the viewport.
