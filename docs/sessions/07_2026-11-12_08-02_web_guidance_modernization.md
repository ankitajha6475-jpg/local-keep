# Session Log: Modern web guidance modernisation

- **Date**: 2026-11-12 08:02
- **Commit**: `1d3431439e018ca75c4eee5262b17ff1eff5227b` — `feat(ui): modernise the workspace against the current web platform guidance`
- **Change**: six OpenSpec changes (see below), all archived under `openspec/changes/archive/2026-11-11-*/`

## Summary

Ran a `modern-web-guidance` audit over the whole workspace (17 findings), split
it into six sequenced OpenSpec changes, and shipped every one of them.

The audit's own `legacy-scan` covered ~20% of the guide catalogue and missed
most Vue template bindings; a manual second pass against the retrieved guide
catalogue found 16 of the 17 findings. Five changes are a modernisation of the
UI against the current platform (IME safety, an accessibility baseline, visual
tokens, native dialogs, workspace hardening); the sixth is the editor feature
that was already in flight from the previous session.

The single biggest change is the native-dialog migration: all thirteen
hand-rolled overlays became native `<dialog>` elements opened with
`showModal()`, which replaced a `z-index` scale, four separate focus-trap
implementations, and eight global `Escape` branches.

## Changed Files

### New — shared modules and styles

| File | Change |
|------|--------|
| `src/shared/ime.js` | **New** — `isImeComposing` / `runUnlessIme`; the `keyCode === 229` fallback is limited to `Enter`/`Escape`/`Tab` because soft keyboards report `229` for ordinary character entry |
| `src/shared/dialog.js` | **New** — `createOverlayStack`, `createDialogController`, `showModalDialog`, `hideDialog`, `installLightDismiss` |
| `src/styles/base.css` | **New** — global tokens, the shared `:focus-visible` ring, `.sr-only`, `dialog:modal` scroll containment |

### New — tests

| File | Change |
|------|--------|
| `tests/ime.test.js` | **New** — source-level invariant that IME-owned keystrokes are never intercepted |
| `tests/accessibility.test.js` | **New** — icon-button names, `for`/`id` pairing, reduced-motion placement, live-region count |
| `tests/visualTokens.test.js` | **New** — scrollbar contract, `color-scheme`, image `loading`/`decoding`, computed contrast |
| `tests/dialog.test.js` | **New** — overlay stack, dialog controller, light-dismiss probe against a fake `<dialog>` |
| `tests/overlays.test.js` | **New** — every blocking overlay is a native dialog; no `role="dialog"`, `aria-modal`, false menu roles, or hand-rolled backdrop |
| `tests/securityHeaders.test.js` | **New** — the baseline header set, and the absence of a `default-src` |
| `tests/sessionCookie.test.js` | **New** — the `__Host-` prefix and the `Secure` attribute are one decision |
| `tests/responsiveLayout.test.js` | **New** — the workspace container, the shared stacking threshold, `content-visibility` |

### New — OpenSpec

| File | Change |
|------|--------|
| `openspec/specs/{input-composition,accessibility-baseline,visual-tokens,modal-overlays,security-headers}/spec.md` | **New** — the five capabilities the modernisation introduced |
| `openspec/changes/archive/2026-11-11-{ime-safe-text-input,accessibility-baseline,visual-tokens-and-media,native-modal-overlays,workspace-hardening}/` | **New** — proposal, design, tasks, and delta specs for each change |
| `openspec/changes/archive/2026-11-11-editor-source-default-tag-autocomplete/` | **New** — the editor feature archived at the end of the previous session |
| `scripts/openspec-post-archive.js` | **New** — fills the `## Purpose` an archive leaves as `TBD`, and reports the `## Why` length |
| `docs/plans/2026-11-11-modern-web-guidance-audit-and-modernization-plan.md` | **New** — the 17-finding audit, the change split, and the deviation record |

### Modified — application

| File | Change |
|------|--------|
| `server.js` | Baseline security headers on every response |
| `src/server/sessionStore.js` | `secureCookies()`; the cookie is `__Host-local_keep_session` when it is `Secure` |
| `src/App.vue` | Native dialogs, the overlay stack, the ARIA tablist, container queries, `content-visibility`, the centralised live regions, IME guards, focus and contrast tokens |
| `src/components/{LinkDialog,GraphView,BacklinksPanel,SelectionLinksPanel}.vue` | Native `<dialog>` overlays |
| `src/components/DashboardNoteCard.vue` | Palette is a group of toggle buttons; the presence dot moved out of the card body |
| `src/components/TagSidebar.vue` | The stacking rule became a container query |
| `src/components/WhiteboardEditor.vue` | Focus ring, contrast, reduced motion, IME guard |
| `src/main.js` | Import the global stylesheet |
| `src/shared/tags.js` | `matchTags()` — fuzzy, deterministic tag ranking for the editor autocomplete |
| `src/utils/markdown.js` | Images declare `loading` and `decoding` |
| `openspec/specs/*` (11 modified) | The delta specs of the six changes, synced into the main specs |

### Modified — documentation and tests

| File | Change |
|------|--------|
| `AGENTS.md` | Browser-support policy, a Security Headers section, an Overlays and Dialogs section, gotchas 61–78 |
| `CHANGELOG.md` | Added / Changed / Fixed entries for all six changes |
| `README.md` | Source is the default editor mode; tags get fuzzy autocomplete |
| `tests/markdown.test.js`, `tests/tags.test.js` | Rendering and `matchTags()` coverage |

## The six changes

| # | Change | What it did |
|---|---|---|
| 1 | `ime-safe-text-input` | Enter/Escape handlers stand down while an IME owns the keystroke — **before** `preventDefault()`, so Vue's `.prevent` modifier had to go |
| 2 | `accessibility-baseline` | 12 `outline: none` rules replaced by one shared focus ring; muted text raised to 4.5:1; 23 icon-only buttons named; reduced motion made opt-in; one polite and one assertive live region |
| 3 | `visual-tokens-and-media` | Scrollbar thumbs raised above the 3:1 non-text minimum; the WebKit fallback isolated behind `@supports not (scrollbar-color: auto)`; `color-scheme: light`; every image declares how it loads |
| 4 | `native-modal-overlays` | 13 overlays → `<dialog>` + `showModal()`; an explicit overlay stack replaces DOM-order stacking for shortcut dispatch; the dashboard tabs became a real ARIA tablist |
| 5 | `workspace-hardening` | Security headers; the `__Host-` cookie; the workspace layout became container-driven; off-screen card bodies skip rendering |
| 6 | `editor-source-default-tag-autocomplete` | Source is the default editor mode; the tag input suggests existing paths with fuzzy ranking |

## Decisions worth remembering

### The `.prevent` modifier had to be removed, not just guarded

`@keydown.enter.prevent="…"` expands to a `preventDefault()` that runs
**before** the handler body. A handler that has to stand down for an IME
cannot use it, so every affected binding dropped `.prevent` and calls
`event.preventDefault()` inside the handler, after the composition check.
`tests/ime.test.js` enforces the invariant at the source level.

### The `keyCode === 229` fallback is deliberately narrow

Soft keyboards report `229` (`VK_PROCESSKEY`) for ordinary character entry,
not just for candidate confirmation. A blanket check would break every other
key handler, so the fallback only applies to `Enter`, `Escape`, and `Tab`.

### Menus kept their anchoring instead of becoming popovers

Rule 3 prefers `popover` for menus, and it would fix a real class of bug: a
popover is in the top layer, so it can never paint under a modal. But an
unanchored popover is **centred on the viewport** — the user-agent style is
`position: fixed; inset: 0; margin: auto` — and the only way to anchor it is
CSS anchor positioning, which is not a Baseline feature. `@oddbird/popover-polyfill`
provides the behaviour, not the anchoring.

So the menus kept their anchored positioning and the *false claims* were
removed instead: no `role="menu"`, no `role="menuitemradio"`. The colour
swatches are toggle buttons with `aria-pressed` in a labelled group, which
states the selection honestly without the radio-group arrow-key requirement.

### The CSP ships without a `default-src`

The baseline policy is
`frame-ancestors 'none'; object-src 'none'; base-uri 'none'`. It names no
source lists, so scripts, styles, images, and connections stay unconstrained —
which matters, because the app embeds the Excalidraw React component, loads
Excalidraw fonts, and serves exported images from `blob:` URLs.

A strict policy is still the right end state, but it has to be deployed
**report-only** first, and the `innerHTML` sinks in `src/utils/markdown.js`,
`src/utils/mermaid.js`, and the Visual editor have to become Trusted-Types-safe
first. The Sanitizer API is not Baseline. This is deferred, not forgotten.

### `content-visibility: auto` creates a containing block

It implies paint and layout containment, so an absolutely positioned
descendant of the skipped element is anchored to it. `.presence-dot` was
inside `.note-content` and is now a direct child of `.note-card` — otherwise
the dot would have dropped by the height of the card toolbar.

The card body is safe to skip because the card's height is explicit (380px)
and the body is sized by the flex algorithm, so the scroller's 396px row
height cannot change. The **preview** is deliberately not skipped: it is a
scroll container, and a skipped subtree has no scrollable overflow, so the
scrollbar would vanish and reappear and reflow the text under the cursor.

### A container query measures the content box

`main` has `2rem` of horizontal padding, so the viewport width and the
workspace width differ by 64px. The old viewport media query therefore fired
64px too late: between a 600px and a 664px window the sidebar stayed beside
the notes area even though the workspace was already narrower than the
breakpoint. `main` is now the query container and both rules use
`@container workspace (max-width: 600px)`.

The two files' thresholds used to be kept in sync by a comment. Now
`tests/responsiveLayout.test.js` fails if they drift — the comment became a
test.

### The `__Host-` prefix and the `Secure` attribute are one decision

`secureCookies()` is the single predicate that decides both, so a prefixed
cookie is always `Secure` and a `Secure` cookie is always prefixed. The
browser rejects a `__Host-` cookie that is not `Secure`, has a `Domain`, or
has a `Path` other than `/`.

**Deploy note:** the cookie is renamed, so the first request after this
deploy needs one re-login. The session rows in the database stay valid.

### The overlay stack replaced DOM-order stacking

Overlays moved into the top layer, so DOM order no longer describes
stacking. `shortcutRoot()` used to take the last matching overlay element in
the document; it now asks an explicit stack. A DOM-order fallback would have
been wrong in exactly the case the stack exists for, and two mechanisms that
usually agree are two mechanisms that eventually disagree.

## Mistakes avoided

- **A dead CSS rule was deleted, not converted.** The audit asked for the
  grid's column-count media queries to become container queries. There are
  none: the column count is computed by `dashboardColumnCount()` from the
  measured grid width and applied as an inline style, so it already follows
  the container. The old `.notes-grid { grid-template-columns: 1fr }` rule was
  overridden by that inline style and never took effect. It was removed, with
  a comment saying where the column count really comes from.
- **`aspect-ratio` was not added to images.** The audit claimed a CLS problem.
  The card is fixed at 380px and the whiteboard tile at 110px, so there is
  nothing to reserve — the rule would have been dead CSS.
- **The tests were checked against mutations.** The container-threshold and
  presence-dot invariants were each broken deliberately and confirmed to fail
  before being restored, so they are not vacuous.

## Verification

- `npm test` — **233 passing** (217 before this work, +16 new)
- `npm run build` — clean; the built CSS contains both `@container workspace`
  blocks, `container-type`, `content-visibility`, and the isolated
  `@supports not (scrollbar-color: auto)` fallback
- `openspec validate --all --strict` — **28 passed, 0 failed**
- `openspec list` — no active changes
- Every archived proposal's `## Why` is under 1000 characters

## Not done

- **Strict CSP and Trusted Types** — deferred to its own change with its own
  threat model. See "Decisions worth remembering" above.
- **Dark mode** — out of scope by decision. `color-scheme: light` declares
  the intent so UA-drawn surfaces stop fighting the theme; a dark theme is a
  product decision, not a tweak.
