# Design: IME-safe key handling

## Context

The `modern-web-guidance` guide `ime-safe-enter-submit` gives a canonical
snippet:

```js
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();          // <-- cancel the default first
    if (event.isComposing) return;   // <-- then bail
    form.requestSubmit();
  }
});
```

Two details of that snippet do not transfer cleanly to this codebase, and the
guide's own "Fallback strategies" section is what settles them.

## Decision 1: bail out *before* `preventDefault()`

The guide's snippet cancels the default action before it checks for
composition. The default action of `Enter` in a `<textarea>` is "insert a
newline" and in an `<input>` inside a `<form>` is "submit the form" — neither
is the IME's candidate confirmation, which the IME performs itself. But there
is no reason to cancel the default while standing down, and doing so is what
would break the IME if any browser implements candidate confirmation as the
default action of the keydown.

The community consensus (and the pattern the guide's companion tooling
`eslint-plugin-ime-safe-form` enforces) is to bail first and treat "ignore" as
*this listener does not take over*:

```js
if (e.isComposing || e.keyCode === 229) return;   // ignore
event.preventDefault();                            // consume
```

**This is not optional in Vue.** `@keydown.enter.prevent` expands to a
`preventDefault()` that runs *before* the handler body, unconditionally. A
`.prevent` binding therefore cannot express "cancel the default only when not
composing". Every affected binding MUST drop `.prevent` and call
`event.preventDefault()` inside the handler, after the composition check.

Consequence: the codebase's Enter handlers become 3-line functions instead of
one-line template expressions.

## Decision 2: scope the `keyCode === 229` fallback to IME confirm keys

The guide recommends pairing `event.isComposing` with `event.keyCode === 229`
to catch Safari's out-of-order `compositionend` (WebKit bug 165004). It notes
that the check is "nested under the `event.key === 'Enter'` gate".

That gate matters and the guide does not spell out the generalisation: Android
soft keyboards report `keyCode: 229` for **ordinary character entry**, not
only for candidate confirmation. A blanket `keyCode === 229` check applied to
every key handler would therefore disable the comma-commit behaviour in the tag
input and the arrow-key navigation in the suggestion lists on Android.

So the shared helper applies the `229` fallback only for the keys an IME uses
to confirm or cancel a candidate:

```js
const IME_CONFIRM_KEYS = new Set(['Enter', 'Escape', 'Tab'])
```

For every other key (the tag input's comma, the suggestion arrow keys) only
the standard `event.isComposing` signal is used, which is reliable there:
those keys are typed *during* an active composition, so `isComposing` is true
in every browser. The out-of-order Safari defect only affects the *confirming*
keydown, which is by definition `Enter`.

## Decision 3: one shared module, one function

`src/shared/ime.js` exports a single predicate. A single function is
sufficient because the two decisions above collapse into one rule:

| key | `isComposing` true | `keyCode === 229` | treated as IME-owned |
|---|---|---|---|
| `Enter` | yes | yes | yes |
| `Escape` | yes | yes | yes |
| `Tab` | yes | yes | yes |
| `,` | yes | (ignored) | yes |
| arrows | yes | (ignored) | yes |

The same predicate therefore serves every site, and the "229 only for confirm
keys" restriction falls out of the key set rather than being duplicated at
each call site.

## Decision 4: what is deliberately *not* done

- **No global composition tracker.** Tracking `compositionstart` /
  `compositionend` to keep a module-level "is composing" flag would catch the
  residual case where a browser reports `isComposing: false` for a key typed
  during an active composition. It was rejected: the flag can leak (a
  composition that never ends leaves every Enter handler dead), and the guide's
  Strategy 1 states that the `229` check "reliably catches Safari's
  out-of-order confirming `Enter` keydown", which is the documented gap.
- **No change to `Ctrl/Cmd+Enter`.** The guide states that modifier
  combinations "do not conflict with IME confirmation keys and do not require
  IME safety checks". The editor's `onEditorKeydown` already handles
  `Ctrl/Cmd+Enter` *before* its composition check, with an explicit comment.
  That behaviour is preserved.
- **No change to the global dispatcher's plain-key rules.** The dispatcher
  already refuses to run plain-key shortcuts while an input has focus and
  already ignores `e.isComposing`. Only the `Enter` / `Escape` branches that
  commit or close are guarded.

## Decision 5: the global dispatcher

`handleKeyDown` in `App.vue` runs on `window`, so it sees the composition
keystroke after the focused input's own handler. Its `Enter` branches
(`isConfirmOpen` → `confirmDelete`, `isUnsavedChangesOpen` → `saveAndClose`)
and every `Escape` branch are therefore guarded.

`saveAndClose()` is the dangerous one: the unsaved-changes dialog is opened
*over* the editor, so the editor's textarea may still hold focus. An
`Enter` that confirms an IME candidate in that textarea must not also save and
close the editor.

The guard is placed so that modifier combinations still pass through:

```js
if (isImeComposing(e) && (e.key === 'Enter' || e.key === 'Escape') && !e.ctrlKey && !e.metaKey) return
```

`activateShortcutFromDom` already ignored `e.isComposing`; it gains the `229`
fallback through the shared predicate.

## Risk

Low. The change is additive in the common case: outside a composition every
key does exactly what it did before, including the `preventDefault()` that the
Vue `.prevent` modifier used to perform. The only behavioural difference
outside composition is the *timing* of `preventDefault()` (now inside the
handler rather than before it), which is invisible to the page because the
handler runs in the same event turn.
