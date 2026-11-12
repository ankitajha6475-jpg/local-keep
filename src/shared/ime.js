/**
 * IME (input method editor) composition helpers.
 *
 * While an IME is composing text (Chinese, Japanese, Korean, …) the Enter key
 * confirms the current candidate instead of submitting anything, Escape
 * cancels the candidate instead of closing an overlay, and the arrow keys move
 * between candidates. A keydown handler that acts on those keys must stand
 * down while a composition is active, otherwise it commits a half-composed
 * value or closes the surface the user is still typing into.
 *
 * Two signals are used:
 *
 * - `event.isComposing` — the standard signal, set while the IME owns the
 *   keystroke.
 * - `event.keyCode === 229` (`VK_PROCESSKEY`) — the legacy signal. Safari
 *   delivers `compositionend` *before* the confirming Enter keydown (WebKit
 *   bug 165004), so `isComposing` has already been reset to `false` by the
 *   time the handler runs. The `229` check catches that case.
 *
 * The legacy check is deliberately limited to the keys an IME uses to confirm
 * or cancel a candidate: soft keyboards report `229` for ordinary character
 * entry too, so a blanket check would break every other key handler.
 */

/** Keys an IME uses to confirm or cancel a candidate. */
const IME_CONFIRM_KEYS = new Set(['Enter', 'Escape', 'Tab'])

/**
 * True when the keydown event belongs to an IME and must not be intercepted.
 *
 * Callers must bail out *before* cancelling the event's default action, so
 * the IME can still confirm or cancel its candidate.
 */
export function isImeComposing(event) {
  if (!event) return false
  if (event.isComposing === true) return true
  return IME_CONFIRM_KEYS.has(event.key) && event.keyCode === 229
}

/**
 * Runs `action` for a keydown event unless an IME owns the keystroke.
 *
 * The default action is cancelled only when the action actually runs, so a
 * stand-down never swallows the IME's candidate confirmation. Returns true
 * when the action ran.
 */
export function runUnlessIme(event, action) {
  if (isImeComposing(event)) return false
  event.preventDefault()
  action(event)
  return true
}
