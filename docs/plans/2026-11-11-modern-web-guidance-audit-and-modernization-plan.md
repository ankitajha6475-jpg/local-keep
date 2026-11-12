# Modern Web Guidance — Codebase Audit & Modernization Plan

**Date:** 2026-11-11
**Scope:** `src/` (frontend), `index.html`, `server.js` (security headers)
**Method:** `modern-web-guidance` `legacy-scan` (deterministic subset, ~20% of corpus) + manual audit against the retrieved guide catalog
**Status:** IMPLEMENTED — all five changes from §8 are shipped and archived
(`openspec/changes/archive/2026-11-11-{ime-safe-text-input,accessibility-baseline,visual-tokens-and-media,native-modal-overlays,workspace-hardening}/`).
**Delivery:** OpenSpec, spec-first — see §8.

### Outcome

| # | Change slug | Findings | Status |
|---|---|---|---|
| 1 | `ime-safe-text-input` | 2 | archived |
| 2 | `accessibility-baseline` | 3c, 4, 5, 6, 7, 9, 15 | archived |
| 3 | `visual-tokens-and-media` | 8, 10, 11, 13 | archived |
| 4 | `native-modal-overlays` | 1, 3a, 3b | archived |
| 5 | `workspace-hardening` | 12, 14, 16, 17 | archived |

Three findings were **not** implemented as the audit proposed, and the reasons
are recorded in the change designs:

- **Finding 13 (dark mode)** — deliberately out of scope. `color-scheme: light`
  declares the intent; a dark theme is a product decision, not a tweak.
- **Finding 12 phase 2 (Trusted Types)** — deferred. The CSP ships without a
  `default-src`, and the strict policy is still to be deployed report-only
  after the `innerHTML` sinks are converted.
- **Finding 16 (card body `content-visibility`)** — applied to `.note-content`
  rather than the audit's `.note-card-body`, and the presence dot had to move
  out of the card body because containment changes the containing block.

---

## 1. Method and Coverage

Two passes were run, because `legacy-scan` alone is not sufficient:

| Pass | Tool | Coverage | Findings |
|---|---|---|---|
| 1 | `npx modern-web-guidance@latest legacy-scan src --json` | 33 of ~165 guides have deterministic rules | 3 raw findings |
| 2 | `search` × 20 topics → `retrieve` × 10 core guides + manual source read + computed contrast sweep | remainder of the catalog | 16 additional findings |

**Raw `legacy-scan` output:** 3 findings / 2 guides.

**Verified after applying the `keepWhen`/`dropWhen` rubric:** 1 confirmed, 2 dropped.
**Found by manual audit only:** 16 findings the scanner cannot detect.

### Why the scanner missed most of this

`legacy-scan` matches imperative JS patterns (`addEventListener('keydown')`, `event.key === 'Enter'`). This codebase is Vue 3, where keyboard handling is expressed as **template bindings** (`@keydown.enter.prevent="..."`). The scanner consequently missed every IME-unsafe input in the app — the highest-severity finding in this report.

All contrast ratios below are **computed**, not estimated: WCAG 2.x relative luminance with the sRGB transfer function, against the `#ffffff` surface where the text actually sits.

---

## 2. Findings Summary

| # | Severity | Area | Finding | Guide |
|---|---|---|---|---|
| 1 | **P0** | Modals | 13 custom overlay surfaces; no native `<dialog>`, no focus trap, no `inert`, no top layer, no scroll lock, no focus return | `dialog` |
| 2 | **P0** | IME | 7 text inputs bind Enter without `isComposing` / `keyCode === 229` | `ime-safe-enter-submit` |
| 3 | **P0** | ARIA | `role="tab"`, `role="menu"`, `role="combobox"` applied without the matching keyboard behaviour or wiring | `accessibility`, `menu` |
| 4 | **P1** | Contrast | Muted text `#80868b` (×32) = **3.68:1**, `#94a3b8` (×12) = **2.56:1**, `#9aa0a6` = **2.64:1**, `#1e8e3e` = **4.21:1** — all below the 4.5:1 text minimum | `color` |
| 5 | **P1** | Focus | 3 controls use `outline: none` with **no** replacement indicator; 4 more use a ≤1.2:1 box-shadow ring | `accessibility` |
| 6 | **P1** | Naming | Icon-only buttons named by `title` only (no accessible name) | `accessibility` |
| 7 | **P1** | Forms | Property-row `<label>` elements are not associated with any control | `accessibility`, `forms` |
| 8 | **P1** | Colour | Scrollbar thumb `#dadce0` on white = **1.37:1**, below the 3:1 non-text minimum | `customize-scrollbar-color-and-thickness` |
| 9 | **P1** | Motion | No `prefers-reduced-motion` handling anywhere; ~50 transitions/animations | `motion` |
| 10 | **P2** | Scrollbars | `::-webkit-scrollbar` fallback not wrapped in `@supports not (scrollbar-color: auto)` | `customize-scrollbar-color-and-thickness` |
| 11 | **P2** | Images | No `loading`/`decoding`, generic `alt`, no `aspect-ratio` → layout shift | `performance`, `optimize-image-priority` |
| 12 | **P2** | Security | 7 `innerHTML` sinks, no CSP, no Trusted Types, no `frame-ancestors` | `security`, `sanitize-untrusted-html` |
| 13 | **P2** | Theming | No `color-scheme` property; no `prefers-color-scheme` support | `color`, `dark-mode` |
| 14 | **P3** | Layout | Card grid uses viewport media queries only; no container queries | `css-layout`, `responsive-design` |
| 15 | **P3** | Live regions | Single ad-hoc `role="status"`; no centralized polite/assertive regions | `accessibility` |
| 16 | **P3** | Perf | No `content-visibility` on hydrated card bodies | `defer-rendering-heavy-content` |
| 17 | **P3** | Cookies | `local_keep_session` lacks the `__Host-` prefix | `security` |

### Scanner findings — verification verdict

| Scanner finding | Verdict | Reason |
|---|---|---|
| `WhiteboardEditor.vue:1205,1209` — `::-webkit-scrollbar` | **KEEP** | `keepWhen`: customises thumb colour/thickness with no standard `scrollbar-width`/`scrollbar-color` declared. Fix per findings 8 + 10. |
| `App.vue:2594` — `e.key === 'Enter'` → `confirmDelete()` | **DROP** | `dropWhen`: "Global document-level hotkeys, non-text UI widgets (… modals …)". It is a `window`-level handler on a confirmation modal, not a text-input submit. **However** the adjacent concern is real and is folded into finding 1: a destructive action is bound to a global Enter that fires regardless of which overlay is topmost. |
| `App.vue:2594` (IME rule) | **DROP as reported** | The IME rule targets `keydown` on `input`/`textarea`. This handler is on `window`. The *actual* IME violations are finding 2 — all in template bindings the scanner does not parse. |

---

## 3. Detailed Findings

### 1. P0 — Custom overlays instead of native `<dialog>`

**Evidence:** zero occurrences of `<dialog`, `showModal(`, `popover`, `::backdrop`, or `inert` in `src/`.

13 overlay surfaces are hand-rolled:

| File | Overlay | Semantics needed |
|---|---|---|
| `App.vue:530` | MCP settings | modal |
| `App.vue:617` | Account settings | modal |
| `App.vue:664` | Interface settings | modal |
| `App.vue:713` | People | modal |
| `App.vue:772` | Hybrid search | modal |
| `App.vue:919` | Note editor | modal |
| `App.vue:1311` | Unsaved changes | modal (`closedby="none"` + confirm) |
| `App.vue:1327` | Archive confirm | modal (destructive) |
| `App.vue:1221` | Revision history | non-modal panel |
| `GraphView.vue` | Graph | non-modal panel |
| `BacklinksPanel.vue` | Backlinks | non-modal panel |
| `SelectionLinksPanel.vue` | Selection links | non-modal panel |
| `LinkDialog.vue:2` | Link dialog | modal (has `role="dialog"` only) |

**What is missing today:**

- **Focus containment.** Nothing traps Tab. While the note editor is open, Tab walks into the dashboard behind it.
- **Background inertness.** The dashboard behind a modal remains in the accessibility tree and keyboard-reachable. Only `LinkDialog.vue` declares `role="dialog" aria-modal="true"`; the other 12 expose nothing.
- **Top layer.** Overlays rely on a hand-maintained `z-index` scale spanning `1 → 1000` (`App.vue:8822` is `z-index: 1000`, `.account-menu` is `140`, `.modal-overlay` is `100`). A modal opened while the account menu is open paints *under* the menu. The top layer removes this entire class of bug.
- **Scroll lock.** No `overflow`/`position` handling on `html`/`body` when a modal opens — the page scrolls behind the overlay.
- **Focus return.** Focus is moved *into* the modal by hand (`modalTitleInput.value.focus()` at `App.vue:3264`, `searchInput.value.focus()` at `App.vue:4470`) but never returned to the invoker on close; focus falls back to `<body>`.
- **`Esc`/light-dismiss** is re-implemented in a global dispatcher (`App.vue:2586`, `2675`, `2697`) instead of being delegated to the platform.

**Remediation**

Convert the 8 blocking overlays to native `<dialog>` + `showModal()`; convert the 4 non-blocking panels to `<dialog popover="manual">`; convert the note-color / account / card-action menus to `popover="auto"`.

```html
<!-- Rule 1: blocking confirmation -->
<dialog id="confirm-archive" aria-labelledby="confirm-archive-title" closedby="any">
  <h2 id="confirm-archive-title">Archive Note?</h2>
  <form method="dialog">
    <button value="cancel" autofocus>Cancel</button>
    <button value="archive">Archive</button>
  </form>
</dialog>
```

```css
/* MANDATORY (both rules) */
dialog:modal { overscroll-behavior: contain; }
dialog::backdrop { overflow: hidden; overscroll-behavior: contain; }
```

Notes:
- Remove the manual `role="dialog"` / `aria-modal` from `LinkDialog.vue` once it is native.
- Remove the manual `.focus()` calls — the browser focuses the first focusable element and returns focus to the invoker on close.
- The unsaved-changes dialog needs `closedby="none"` **plus** a `cancel` handler (not `closedby` alone — Safari ignores it).
- Popover fallback: feature-detect `HTMLElement.prototype.popover` and load `@oddbird/popover-polyfill` only when absent. Style with `[popover]:is(:popover-open, .\:popover-open)` so the rule survives in browsers lacking `:popover-open`.

**Fallback:** `<dialog>` is Baseline widely available; `closedby` is not (Chrome 134+, Firefox 141+, no Safari) — degrade to Esc-only dismissal and add the documented `pointerdown`/`pointerup` outside-test for light dismiss.

---

### 2. P0 — IME-unsafe Enter handling on text inputs

**Evidence** (all template bindings, all missed by `legacy-scan`):

| File:line | Element | Handler |
|---|---|---|
| `App.vue:1061` | tag input | `@keydown.enter.prevent="commitTagDraft"` |
| `App.vue:1133` | new-property-key input | `@keydown.enter.prevent="addPropKey"` |
| `LinkDialog.vue:21` | link text input | `@keydown.enter.prevent="submitLink"` |
| `LinkDialog.vue:25` | link URL input | `@keydown.enter.prevent="submitLink"` |
| `LinkDialog.vue:48` | wiki search input | `@keydown.enter.prevent="submitWiki"` |
| `TagSidebar.vue:93` | tag rename/reparent input | `@keydown.enter.prevent="confirmOp"` |
| `WhiteboardEditor.vue:11` | whiteboard title input | `@keydown.enter.prevent` (blocks IME candidate confirmation) |

**Impact.** This project has a Chinese-language user base (the embedding section of `AGENTS.md` is written in Chinese and the Qwen3-Embedding notes discuss Chinese queries explicitly). With an IME active, `Enter` confirms the candidate character. Each of these handlers commits a *different* action instead — a partially-composed tag is committed, a half-typed URL is submitted, a wiki link is inserted from a candidate string.

**Remediation.** Add a shared guard and use it everywhere:

```js
// src/shared/ime.js
export function isImeComposing(event) {
  return event.isComposing === true || event.keyCode === 229
}
```

```vue
<input
  v-model="tagDraft"
  @keydown.enter.prevent="onTagEnter"
>
```

```js
function onTagEnter(event) {
  if (isImeComposing(event)) return   // let the IME confirm the candidate
  commitTagDraft()
}
```

The `keyCode === 229` half is **required**, not optional: Safari dispatches `compositionend` before the confirming `Enter` `keydown`, so `isComposing` has already been reset to `false` by the time the handler runs.

**Already safe — do not change:** `App.vue:975-976` and `App.vue:5349` use `Ctrl/Cmd+Enter`. The guide states modifier combos "do not conflict with IME confirmation keys and do not require IME safety checks". `WhiteboardEditor.vue:11` also has `@keyup.enter="flushTitle"`, which is the IME-safe pattern on its own — only the `@keydown.enter.prevent` needs the guard.

---

### 3. P0 — ARIA roles without matching keyboard behaviour

The guide's rule is unambiguous: *"When applying `role="tab"` to an element, it must then behave like a tab — including keyboard interactions."*

**3a. `role="tablist"` (`App.vue:354-390`)**
Three tabs declare `role="tab"` + `aria-selected`, but there is **no** `role="tabpanel"`, no `aria-controls` / `aria-labelledby` pairing, and no arrow-key navigation (ARIA tabs require Left/Right/Home/End plus a roving `tabindex`). The tablist is announced as tabs but behaves like three buttons.

**3b. `role="menu"` (3 sites)**
- `App.vue:993` — note-colour picker, `role="menu"` + `role="menuitemradio"` items. Menu semantics require arrow-key navigation, roving `tabindex`, `Home`/`End`, `Escape` to close, and focus to move into the menu on open. None of this exists; `Escape` is handled by the global dispatcher but focus never enters the menu.
- `App.vue:232` — account menu.
- `DashboardNoteCard.vue:43` — card action menu.

**3c. `role="combobox"` (`App.vue:1050-1085`)**
The tag input is a combobox with a `role="listbox"` popup and `role="option"` children carrying `aria-selected`. But there is no `aria-controls` on the input, no `aria-activedescendant`, and no `id` on the options. Arrow keys *do* move a visual highlight (`moveTagSuggestion`), so the app has the behaviour but never tells assistive tech about it — the highlighted suggestion is silent.

**Remediation**

- 3a: add `role="tabpanel"` + `aria-controls`/`aria-labelledby` pairs, and implement roving `tabindex` with arrow keys. Alternatively, if the tabs are never displayed as a panel per tab, drop the ARIA and use plain buttons — that is also compliant.
- 3b: implement the `menu` keyboard pattern, or migrate to `popover` + plain buttons (the `menu` guide's Rule 3 says menus/tooltips are *not* dialogs and should use `popover`).
- 3c: add `aria-controls="tag-suggestions"`, give each `<li>` a stable `id`, and set `aria-activedescendant` on the input to the active option's id. This is the smallest fix in the report and restores full combobox announcement.

---

### 4. P1 — Muted text colours below the 4.5:1 text minimum

A computed sweep of every `color: #hex` declaration in `src/` found **30 distinct text colours**, of which **7 fall below 4.5:1 on the white surfaces they sit on**, affecting **53 declarations**.

| Colour | Ratio | Declarations | Where |
|---|---|---|---|
| `#e2e8f0` | 1.23:1 | 2 | `App.vue:6377` — on a `#0f172a` background, so **not** a failure; excluded |
| `#d4d4d4` | 1.48:1 | 1 | `WhiteboardEditor.vue:1098` — on the dark debug panel, not a failure |
| `#ce9178` | 2.64:1 | 3 | `WhiteboardEditor.vue:1183` — on the dark debug panel, not a failure |
| **`#94a3b8`** | **2.56:1** | **12** | `.auth-hint` (`font-size: 0.74rem`) and others on white |
| **`#9aa0a6`** | **2.64:1** | **1** | `.note-editor:empty::before` placeholder on the white editor surface |
| **`#80868b`** | **3.68:1** | **32** | the app's default muted colour: `.note-date`, `.history-actor`, `.ui-settings-grid small` (0.68rem), `.link-dialog-hint` (0.7rem), `.tag-count`, `.tag-toggle`, `.tag-empty`, `.tag-op-help` (0.75rem), `.copy-btn`, `.close-modal-btn`, `.mcp-token-row small`, and more |
| **`#1e8e3e`** | **4.21:1** | **2** | `.copy-btn.copied` — the "Copied" confirmation colour |

`#80868b` is the systematic one: it is the app's single muted-text token, used at 10.9px–12.5px, and it fails WCAG 1.4.3 (Contrast (Minimum)) at 3.68:1. The `#94a3b8` and `#9aa0a6` cases fail outright and are used for exactly the two texts a user is most likely to need — the auth hint and the empty-editor placeholder.

**Remediation.** Darken the muted token and introduce a second, lighter-but-legal step for de-emphasised text:

```css
:root {
  --text-muted: #6b7280;   /* 4.83:1 on #ffffff */
  --text-faint: #80868b;   /* 3.68:1 — large text / non-essential only */
}
```

Rule of thumb for the sweep:
- normal text (< 18.66px bold / < 24px) → ≥ 4.5:1 → `#6b7280` (4.83:1) or darker
- large text → ≥ 3:1 → `#80868b` is acceptable
- the copy-button confirmation (`#1e8e3e`) → `#137333` (5.95:1), already used elsewhere in the file
- the auth hint and the editor placeholder → `#6b7280`

Also note: the guide asks to *"Use `color-mix()` to mix with white or black (preferably in `oklab`)"* when generating tints — the codebase currently has zero `color-mix()`/`oklch()`, so every shade is hand-picked. Introducing a token scale is the durable fix.

---

### 5. P1 — Focus indicators removed without a compliant replacement

11 `outline: none` declarations. The guide: *"Mandatory - Don't disable browser native focus indicators without providing a replacement custom focus indicator: When using `outline: none;` … provide an equivalent custom focus indicator that has a contrast ratio of at least `3:1`."*

| Location | Replacement | Ratio | Verdict |
|---|---|---|---|
| `App.vue:6889` `.note-title-input:focus` | **none** | — | ❌ violation |
| `App.vue:7127` `.note-form textarea:focus` | **none** | — | ❌ violation |
| `App.vue:8472` `.note-editor` | **none** | — | ❌ violation |
| `App.vue:6277` auth inputs | `box-shadow: 0 0 0 3px rgba(99,102,241,0.14)` | 1.19:1 | ❌ fails 3:1 |
| `App.vue:8789` UI-settings inputs | `box-shadow: 0 0 0 3px rgba(26,115,232,0.14)` | 1.21:1 | ❌ fails 3:1 |
| `LinkDialog.vue:327` | `box-shadow: 0 0 0 3px rgba(26,115,232,0.14)` | 1.21:1 | ❌ fails 3:1 |
| `WhiteboardEditor.vue:836` | `border-color: #1a73e8` only | 4.51:1 | ⚠️ ratio ok, but a 1px border is a weak indicator — prefer `outline` |
| `App.vue:8927` `.sort-select:focus` | `border-color: #1a73e8` only | 4.51:1 | ⚠️ same |
| `App.vue:6998`, `App.vue:7050`, `App.vue:8527` | `border-color` change only | 4.51:1 | ⚠️ same |

**Remediation.** One shared token, used everywhere, with a real focus ring:

```css
:root {
  --focus-ring: #1a73e8;   /* 4.51:1 against #ffffff */
}
:where(a:any-link, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

Delete the per-control `outline: none` rules. The guide also asks that focus indicators be styled with `:focus-visible` (15 uses today vs. 32 `:focus` uses — the two are mixed), and that a `forced-colors` fallback exist if `box-shadow` is relied on for the ring.

---

### 6. P1 — Icon-only buttons named by `title` only

The guide: *"Don't use `title` as a naming mechanism: The value of this attribute is only displayed on mouse hover, and cannot be displayed or otherwise accessed using the keyboard in any browser."*

Confirmed cases (no `aria-label`):

- `App.vue:312` — toast dismiss `×`, `title="Dismiss"`
- `App.vue:345` — "Delete selected notes" button
- `App.vue:392`, `App.vue:396` — "Clear tag filter" `×`
- `App.vue:944` — "Open relationship graph for this note"
- `App.vue:952` — "Show notes linking here"
- `LinkDialog.vue:15` — "Close (Esc)" `×`
- `WhiteboardEditor.vue:18` — "Whiteboard pages"

**Remediation.** Add `aria-label` to each. Note `App.vue:985` already does the right thing (`aria-label` + `title`) — use it as the template.

---

### 7. P1 — Labels not associated with their controls

`App.vue:1092` (and the sibling property rows) use a **sibling** `<label>` with no `for`:

```html
<div class="prop-row">
  <label class="prop-key">aliases</label>
  <input type="text" class="prop-value" :value="aliasDraft" …>
</div>
```

The label names nothing. The guide asks for explicit `for`/`id` association — *"some assistive technologies, particularly voice recognition software, require the `for`/`id` relationship to be explicitly set"*. Other labels in the file wrap their input (implicit association, valid but not explicit).

**Remediation.** Give every property input an `id` and point the label at it with `for`.

---

### 8. P1 — Scrollbar thumb contrast below 3:1

`App.vue:7779-7780`:
```css
scrollbar-width: thin;
scrollbar-color: #dadce0 transparent;
```

`#dadce0` against white is **1.37:1**. The guide requires ≥ 3:1 for the thumb against the track *and* against the container background: *"Choose a thumb color with a contrast ratio of at least 3:1 against the track color, and against the container's background where the track may be transparent."*

`WhiteboardEditor.vue:1209` is worse: `rgba(255,255,255,0.15)` over the debug panel's `rgba(0,0,0,0.82)` → ≈ **1.6:1**, and it declares **no** standard properties at all.

**Remediation.**

```css
.note-preview {
  --scrollbar-thumb: #80868b;   /* 3.68:1 on #ffffff */
  --scrollbar-track: transparent;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
```

Also see finding 10 for the `@supports` wrapper.

---

### 9. P1 — `prefers-reduced-motion` is never honoured

Zero occurrences of `prefers-reduced-motion` in `src/` or `index.html`, against ~50 transition/animation declarations (`App.vue` alone has 39, including `.modal-overlay { animation: fadeIn 0.2s ease-out }`).

The guide: *"Always respect reduced motion preferences."* And specifically: *"Use `@media (prefers-reduced-motion: no-preference)` when the reduced-motion strategy is to not have the animation at all"* — opt in rather than declare-then-cancel.

**Remediation.** Wrap the spatial animations only; keep colour/background transitions enabled.

```css
.modal-overlay {
  @media (prefers-reduced-motion: no-preference) {
    animation: fadeIn 0.2s ease-out;
  }
}
```

---

### 10. P2 — WebKit scrollbar fallback not wrapped in `@supports`

`App.vue:7783-7796` declares both the standard properties **and** `::-webkit-scrollbar` rules. The guide requires the legacy rules to be isolated:

> *"Wrap legacy fallbacks in an `@supports not (scrollbar-color: auto)` block to prevent conflicts between standard properties and legacy WebKit selectors in browsers that support both natively."*

`legacy-scan` exempted this file (its rubric drops rules in files that already declare standard properties), but the `@supports` requirement is a separate rule and still applies.

**Remediation.** Move the `::-webkit-scrollbar` block into `@supports not (scrollbar-color: auto)` and reuse the same custom properties so colours cascade without duplication.

---

### 11. P2 — Image loading, alt text, and layout stability

- `DashboardNoteCard.vue:122` — `<img :src="note.thumbnail" class="canvas-thumbnail" alt="Canvas thumbnail">`: no `loading`/`decoding`, generic alt (should name the note), and the container has no `aspect-ratio` → CLS as thumbnails arrive.
- `WhiteboardEditor.vue:54` — page tile `<img>`: no `loading="lazy"`, no `decoding="async"`.
- `markdown.js:98` — rendered note images have no `loading`/`decoding` either.

The guide's image guidance asks for informative descriptions (*"Describe the purpose of the image (for example, 'Search', not 'Magnifying glass')"*), and `performance`/`optimize-image-priority` cover priority and deprioritisation.

**Remediation.**

```html
<img
  :src="note.thumbnail"
  class="canvas-thumbnail"
  :alt="`Canvas thumbnail of ${displayTitle}`"
  loading="lazy"
  decoding="async"
/>
```

```css
.canvas-thumbnail { aspect-ratio: 16 / 9; object-fit: cover; }
```

---

### 12. P2 — No CSP or Trusted Types despite multiple `innerHTML` sinks

`innerHTML` assignments: `App.vue:3103`, `App.vue:3229`, `App.vue:5825`, `App.vue:6079`, `src/utils/markdown.js:210`, `src/utils/markdown.js:221`, `src/utils/mermaid.js:58`.

`server.js` sets **no** security headers: no `Content-Security-Policy`, no `X-Frame-Options` / `frame-ancestors`, no `Referrer-Policy`, no `X-Content-Type-Options`.

Mitigations already in place and worth keeping: markdown is escaped at the renderer (`markdown.js` `html(token)` → `escapeHtml`) and sanitised through DOMPurify (`markdown.js:158`); the session cookie is `HttpOnly; SameSite=Strict` + `Secure` in production.

**Remediation.** Phase 1 (low risk, immediately):

```js
res.setHeader('Content-Security-Policy',
  "frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
res.setHeader('X-Content-Type-Options', 'nosniff')
res.setHeader('Referrer-Policy', 'same-origin')
```

Phase 2 (report-only first): add `Content-Security-Policy-Report-Only` with `require-trusted-types-for 'script'` and a reporting endpoint, then enforce after the sinks are converted to `textContent` / `document.createElement` / the Sanitizer API.

Note the Excalidraw React mount and the Vite dev server both affect the CSP nonce/hash story — this needs care and should not be rushed.

---

### 13. P2 — No `color-scheme`, no dark-mode support

Zero occurrences of `color-scheme`, `prefers-color-scheme`, `light-dark()`, `color-mix()`, or `oklch()`.

The guide: *"Support light and dark color schemes: Honor `@media (prefers-color-scheme: dark)` and pair it with the `color-scheme` CSS property so form controls, scrollbars, and other UA-rendered surfaces match."*

**This is a product decision, not a defect.** The app is deliberately light-only today. The minimal correct step is to declare intent so UA-rendered surfaces (scrollbars, `<select>` popups, autofill) stop fighting the theme:

```css
:root { color-scheme: light; }
```

Full dark-mode support is a separate, larger proposal — flag it, don't bundle it.

---

### 14. P3 — No container queries for the card grid

`@container` and `container-type`: zero occurrences. The dashboard card grid and the tag sidebar both respond to viewport width via media queries only, even though their containers have their own width. `AGENTS.md` already records a bug caused by exactly this class of coupling (the 600px sidebar-breakpoint drift).

**Remediation.** Introduce `container-type: inline-size` on the notes grid and the sidebar, and convert the grid's column-count media queries into `@container` queries. This also sets up the future `size-aware-styling` and `usage-aware-component-variations` work.

---

### 15. P3 — Live regions are ad hoc

`role="status"` appears once (`App.vue:310`, the revision toast). There is no centralised polite/assertive region, and error/success feedback for search, copy, save, and admin actions has no announcement path.

The guide: *"Centralize live regions for non-visible announcements: A single `polite` region and a single `assertive` region per page … keeps announcements consistent."*

**Remediation.** Add two always-present regions in `App.vue` and route `revisionNotice` plus a new `notify()` helper through them. Also honour the guide's warning that *"queued or debounced messages will be unannounced"* when a dialog opens — coordinate with the `inert` work in finding 1.

---

### 16. P3 — `content-visibility` on card bodies

`content-visibility` / `contain-intrinsic-size`: zero occurrences. The dashboard already virtualises rows via `vue-virtual-scroller`, so the win is limited to the hydrated card bodies within a row — a modest but real paint-time reduction.

**Remediation.** `content-visibility: auto` + `contain-intrinsic-size` on `.note-card-body` only after confirming it does not break the fixed `396px` row height the scroller depends on (see `AGENTS.md` gotcha 47).

---

### 17. P3 — Session cookie lacks the `__Host-` prefix

`src/server/sessionStore.js:135-146` builds `local_keep_session=…; Path=/; HttpOnly; SameSite=Strict` (+ `Secure` in production). Correct in substance, but the guide recommends the `__Host-` prefix, which additionally forbids the `Domain` attribute and locks the cookie to `Path=/`.

**Remediation.** Rename to `__Host-local_keep_session` when `Secure` is guaranteed; note this invalidates existing sessions on deploy.

---

## 4. Proposed Browser Support Policy

The skill asks for an explicit policy to be documented. Recommended, and to be added to `AGENTS.md`:

> **Browser Support:** Baseline Widely available (Chrome/Edge/Firefox/Safari as of 2024-12). Newly available features are adopted when feature-detected with graceful degradation (Popover, `closedby`, `overscroll-behavior`, `transition-behavior: allow-discrete`). No polyfills are bundled except `@oddbird/popover-polyfill`, loaded conditionally when `HTMLElement.prototype.popover` is absent. Invoker Commands (`command`/`commandfor`) are adopted with the same conditional-polyfill rule. Never add feature fallbacks that exceed ~20 lines or introduce a new runtime dependency.

---

## 5. Phasing

Phases 1–2 map onto OpenSpec changes 1–3 (low risk, independent). Phase 3 maps onto OpenSpec change 4 (`native-modal-overlays`). Phase 4 maps onto the optional change 5 (`workspace-hardening`). See §8 for the change split and the dependency graph.

**Deviations from the plan above**, all recorded in the change designs:

| Planned | Shipped | Why |
|---|---|---|
| 3.3 migrate the 4 non-blocking panels to `<dialog popover="manual">` | all 13 overlays became `<dialog>` + `showModal()` | every overlay dims the page and takes the interaction, so every one of them blocks |
| 3.4 migrate the 3 menus to `popover="auto"` + polyfill | the menus kept their anchored positioning; their false `role="menu"` claims were removed instead | an unanchored popover is centred on the viewport, and CSS anchor positioning is not Baseline. The polyfill provides the behaviour, not the anchoring |
| 1.8 add `aspect-ratio` to images | not added | the card is fixed at 380px and the tile at 110px, so there is nothing to reserve. The audit's CLS claim was wrong |
| 4.1 CSP report-only, then enforce | only the baseline policy shipped | the strict policy needs the `innerHTML` sinks converted to Trusted-Types-safe APIs first, and the Sanitizer API is not Baseline. Recorded as deferred, not forgotten |

### Phase 1 — Low risk, high value (no behavioural change)

| Task | Files | Finding |
|---|---|---|
| 1.1 Add `isImeComposing` guard to all 7 Enter handlers | `src/shared/ime.js` (new), `App.vue`, `LinkDialog.vue`, `TagSidebar.vue`, `WhiteboardEditor.vue` | 2 |
| 1.2 Add `aria-label` to the 7 icon-only buttons | `App.vue`, `LinkDialog.vue`, `WhiteboardEditor.vue` | 6 |
| 1.3 Replace `outline: none` with a shared `--focus-ring` token | `App.vue`, `LinkDialog.vue`, `WhiteboardEditor.vue` | 5 |
| 1.4 Darken muted text to a 4.5:1-compliant token scale | `App.vue`, `TagSidebar.vue`, `LinkDialog.vue`, `SelectionLinksPanel.vue`, `BacklinksPanel.vue`, `GraphView.vue`, `WhiteboardEditor.vue` | 4 |
| 1.5 Associate property-row labels with `for`/`id` | `App.vue` | 7 |
| 1.6 Wrap `::-webkit-scrollbar` in `@supports not (scrollbar-color: auto)`; fix thumb contrast | `App.vue`, `WhiteboardEditor.vue` | 8, 10 |
| 1.7 Add `prefers-reduced-motion` opt-in wrappers | `App.vue`, `WhiteboardEditor.vue` | 9 |
| 1.8 Add `loading`/`decoding`/`aspect-ratio`/informative `alt` to images | `DashboardNoteCard.vue`, `WhiteboardEditor.vue`, `markdown.js` | 11 |
| 1.9 Set `color-scheme: light` | `index.html` | 13 |
| 1.10 Add baseline security headers | `server.js` | 12 |

### Phase 2 — ARIA correctness (no markup restructure)

| Task | Files | Finding |
|---|---|---|
| 2.1 Combobox wiring: `aria-controls`, option `id`s, `aria-activedescendant` | `App.vue` | 3c |
| 2.2 Either implement tablist keyboard semantics or drop to plain buttons | `App.vue` | 3a |
| 2.3 Menu keyboard semantics, or migrate to `popover` + plain buttons | `App.vue`, `DashboardNoteCard.vue` | 3b |
| 2.4 Central polite/assertive live regions | `App.vue` | 15 |

### Phase 3 — Native dialog migration (the large one)

| Task | Files | Finding |
|---|---|---|
| 3.1 Spike: one modal → native `<dialog>` + `showModal()`; verify focus, `Esc`, scroll lock, focus return | `App.vue` | 1 |
| 3.2 Migrate the 7 remaining blocking modals | `App.vue` | 1 |
| 3.3 Migrate the 4 non-blocking panels to `<dialog popover="manual">` | `App.vue`, `GraphView.vue`, `BacklinksPanel.vue`, `SelectionLinksPanel.vue` | 1 |
| 3.4 Migrate the 3 menus to `popover="auto"`; add `@oddbird/popover-polyfill` conditional load | `App.vue`, `DashboardNoteCard.vue` | 1, 3b |
| 3.5 Remove the global `Esc`/topmost-overlay dispatcher where the platform now covers it | `App.vue` | 1 |
| 3.6 Delete the manual `.focus()` calls | `App.vue`, `LinkDialog.vue` | 1 |

Phase 3 must be verified against the keyboard-shortcut system in `src/shared/shortcuts.js`, which currently implements its own "topmost visible overlay" resolution — the native top layer changes that ordering model.

### Phase 4 — Hardening / optional

| Task | Files | Finding |
|---|---|---|
| 4.1 CSP report-only, then enforce; Trusted Types policy | `server.js`, `src/utils/markdown.js`, `src/utils/mermaid.js` | 12 |
| 4.2 Container queries for the notes grid and sidebar | `App.vue`, `TagSidebar.vue` | 14 |
| 4.3 `content-visibility` on card bodies | `DashboardNoteCard.vue` | 16 |
| 4.4 `__Host-` cookie prefix | `src/server/sessionStore.js` | 17 |

---

## 6. Verification Plan

**Automated**
- `npm test` — the existing `node:test` suite must stay green; Phase 3 in particular touches editor open/close, shortcut dispatch, and the unsaved-changes flow.
- Add a DOM-level test for the IME guard: dispatch a `KeyboardEvent` with `isComposing: true` / `keyCode: 229` at each of the 7 inputs and assert the action does **not** fire.
- Add a test that every `<button>` with no text content has an `aria-label`.
- Add a contrast regression test: parse the built CSS, extract `color:` declarations, and assert ≥ 4.5:1 against the surface they sit on (the script used for this audit is a starting point).

**Manual (required before merging Phase 3)**
- Keyboard-only pass: open each modal, confirm Tab is contained, `Esc` closes, and focus returns to the invoker.
- Screen-reader pass (VoiceOver / NVDA) on: the tablist, the tag combobox, the colour menu, and the confirm dialogs.
- IME pass: with a Chinese IME active, confirm `Enter` confirms the candidate rather than committing the tag/link.
- Reduced-motion pass: enable the OS setting and confirm the fade/scale animations are gone but colour transitions remain.
- Contrast audit (Lighthouse / axe) for the new focus ring, muted-text token, and scrollbar thumb.

---

## 7. Open Questions

1. **Phase 3 scope.** The note editor is the most complex modal (nested history overlay, inline resize handles, link dialog on top). Should it migrate last, or is it worth migrating first as the reference implementation?
2. **`closedby` support.** `closedby` is unavailable in Safari. Do we accept Esc-only dismissal there, or ship the documented `pointerdown`/`pointerup` outside-test polyfill?
3. **Dark mode.** Is light-only a deliberate product decision to keep permanently, or a backlog item? This decides whether finding 13 stays at P2 or becomes a full proposal.
4. **Popover polyfill.** Accepting `@oddbird/popover-polyfill` as a dependency, or shipping a manual fallback for the 3 menus?
5. **CSP strictness.** The Excalidraw React mount, the Vite dev server, and the WS proxy all constrain the CSP. Should CSP enforcement be scoped to production only?
6. **Token scale.** Should the muted-text fix introduce a proper `--text-muted` / `--text-faint` / `--text-subtle` scale now, or only patch the four failing colours?

---

## 8. OpenSpec Approach

**Yes — this should be driven through OpenSpec, as five sequenced changes (four required, one optional) rather than one mega-change.**

`AGENTS.md` already mandates it ("Behavior changes belong in OpenSpec, even during fast iteration… Use the `openspec-*` skills or `/opsx-*` commands rather than editing main specs ad hoc"). The OpenSpec workflow fits this work well because most of these findings are **not bugs against an existing spec — they are behaviours that have no spec at all.** There is currently no capability that states "the note editor is a modal dialog", "Enter in a text input commits the value", or "focus indicators meet a contrast minimum". Writing those requirements first, then implementing them, is exactly the spec-first discipline OpenSpec enforces.

### Why five changes and not one

1. **Blast radius differs by two orders of magnitude.** Phase 1 is a set of surgical fixes (one shared helper, seven call sites, one CSS token). Phase 3 replaces the app's entire overlay architecture and interacts with the shortcut dispatcher, the editor open/close lifecycle, and the Yjs collab sessions. A single change would make the Phase 3 diff unreviewable and the Phase 1 fixes wait behind it.
2. **OpenSpec archives changes individually.** `openspec archive <change>` writes each change's delta specs into `openspec/specs/`. One mega-change would land all 17 findings into the main specs as one atomic delta — there is no way to archive the IME fix without also archiving the dialog migration.
3. **Independent review.** The IME and contrast fixes can be reviewed and shipped in a day; the dialog migration needs a full manual keyboard + screen-reader pass.

### Proposed change split

| # | Change slug | Findings | Capability impact | Risk |
|---|---|---|---|---|
| 1 | `ime-safe-text-input` | 2 | **ADDED** `input-composition`; **MODIFIED** `keyboard-shortcuts`, `note-tags`, `markdown-editor` | Low |
| 2 | `accessibility-baseline` | 3c, 4, 5, 6, 7, 9, 15 | **ADDED** `accessibility-baseline`; **MODIFIED** `auth-session`, `dashboard-chrome`, `note-tags` | Low |
| 3 | `visual-tokens-and-media` | 8, 10, 11, 13 | **MODIFIED** `note-dashboard`, `markdown-editor`, `interface-config`; **ADDED** `visual-tokens` | Low |
| 4 | `native-modal-overlays` | 1, 3a, 3b | **ADDED** `modal-overlays`; **MODIFIED** `keyboard-shortcuts`, `dashboard-chrome`, `note-colors` | **High** |
| 5 | `workspace-hardening` (optional) | 12, 14, 16, 17 | **MODIFIED** `auth-session`, `note-dashboard`; **ADDED** `security-headers` | Medium |

Change 5 is deliberately **not** bundled with the others: CSP needs its own threat-model discussion and touches `server.js`, while container queries, `content-visibility` and the cookie prefix are unrelated layout/hardening work with no spec pressure from the others. File it when the first four are done.

### Ordering and dependencies

```
1. ime-safe-text-input        ──┐
                               ├──> 4. native-modal-overlays
2. accessibility-baseline  ────┤         (needs 1: the tag/property inputs
3. visual-tokens-and-media ───┘          it rewrites are the same inputs)
```

- **Changes 1→2→3 are independent** and can proceed in any order or in parallel.
- **Change 4 depends on change 1**: the native-dialog migration rewrites the tag and property inputs (focus, `autofocus`, `showModal()` initial focus), so doing the IME guard first means it is not rewritten later.
- **Change 4 also depends on change 2** completing the ARIA work, because the dialog migration decides whether the note-colour and account menus become `popover` elements or keep `role="menu"` with a full keyboard implementation — a decision that should be made once, against a settled accessibility baseline.
- **Change 4 must not start before the shortcut dispatcher is re-read.** `src/shared/shortcuts.js` and the global `keydown` handler in `App.vue` implement their own "topmost visible overlay" resolution. The native top layer changes that ordering model. The `design.md` for change 4 must state how the dispatcher resolves overlay order once `showModal()` owns the top layer.
- **Change 5 is independent** of all of the above and can be scheduled whenever `server.js` is next touched.

### Per-change artifacts

Each change directory follows the repo's existing shape (`openspec/changes/<slug>/`):

```
proposal.md      # Why / What Changes / Capabilities / Impact — same 4 sections
                 # as openspec/changes/editor-source-default-tag-autocomplete/
design.md        # Only for change 4: overlay ordering, focus flow, polyfill policy
tasks.md         # Numbered checkpoints, checkbox per task, mirrors the phase
                 # tables in §5, ends with "openspec validate --strict"
specs/<capability>/spec.md
                 # Delta specs using ## ADDED Requirements / ## MODIFIED Requirements
                 # with ### Requirement: … and #### Scenario: … blocks
```

Delta spec requirements should be written so each `#### Scenario:` is directly testable. For example, for change 1:

```markdown
### Requirement: IME-safe Enter handling

Text inputs that commit a value on Enter SHALL NOT commit while an input
method editor is composing text. Composition SHALL be detected with both
`event.isComposing` and `event.keyCode === 229`.

#### Scenario: Enter confirms the IME candidate

- **WHEN** the user presses Enter while a Chinese IME is composing a tag
- **THEN** the candidate is confirmed by the IME
- **AND** the tag is not committed

#### Scenario: Enter commits outside composition

- **WHEN** the user presses Enter with no IME composition active
- **THEN** the tag is committed
```

and for change 4:

```markdown
### Requirement: Blocking overlays use native dialogs

Overlays that interrupt the user SHALL be native `<dialog>` elements opened
with `showModal()`. The platform SHALL provide focus containment, background
inertness, top-layer rendering, `Esc` dismissal, and focus return to the
invoker. Overlays that keep the page interactive SHALL use `<dialog popover>`.

#### Scenario: Tab is contained

- **WHEN** the note editor is open and the user presses Tab repeatedly
- **THEN** focus stays within the editor
- **AND** the dashboard behind it is not reachable

#### Scenario: Focus returns to the invoker

- **WHEN** the note editor is closed
- **THEN** focus returns to the dashboard card that opened it
```

### Commands

```sh
openspec list                                   # see in-flight changes
openspec status <slug>                          # artifact completion status
openspec validate <slug> --strict               # must pass before archiving
openspec archive <slug>                         # writes delta specs into openspec/specs/
openspec validate --all --strict                # post-archive sanity check
```

### Housekeeping this change set must not skip

- `CHANGELOG.md` gets an entry per archived change, under `[Unreleased]` while in flight, using the repo's `Added` / `Changed` / `Fixed` / `Removed` categories.
- `AGENTS.md` gains the **Browser Support** policy from §4, so the fallback decisions in changes 1–4 are recorded once rather than re-litigated per change.
- `AGENTS.md` also needs the new gotchas discovered here: the IME/Enter rule, the contrast-token floor, and the top-layer interaction with the shortcut dispatcher.
- Each archived change must leave `openspec/specs/` consistent — `openspec validate --specs --strict` covers drift between the main specs and the archived deltas.

### What should *not* be specced yet

- **Dark mode (finding 13).** Whether the app supports `prefers-color-scheme` is a product decision, and §7 question 3 is still open. Speccing it now would lock in an answer the maintainers have not chosen. Only the `color-scheme: light` declaration belongs in change 3.
- **The browser-support policy (§4).** It is guidance for the implementer, not a product behaviour, so it belongs in `AGENTS.md`, not in a spec delta.
