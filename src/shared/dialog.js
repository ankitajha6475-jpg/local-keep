import { nextTick, watch } from 'vue'

/**
 * Native overlay helpers.
 *
 * The workspace used to hand-roll every overlay: a `position: fixed` div, a
 * hand-maintained `z-index` scale, a manual `Esc` handler, a manual focus
 * call, and no focus containment. The platform provides all of that for a
 * `<dialog>` opened with `showModal()`: focus containment, background
 * inertness, top-layer rendering, `Esc` dismissal, scroll containment, and
 * focus return to the invoker.
 */

/**
 * Tracks which overlay is on top.
 *
 * DOM order stopped being a reliable proxy for stacking once overlays moved
 * into the top layer, so the shortcut dispatcher asks this stack instead.
 * It is a plain array wrapper so it can be unit-tested on its own.
 */
export function createOverlayStack() {
  const stack = []
  return {
    /** Push an overlay, moving it to the top if it is already present. */
    open(element) {
      if (!element) return
      const index = stack.indexOf(element)
      if (index !== -1) stack.splice(index, 1)
      stack.push(element)
    },
    /** Remove an overlay. Unknown elements are ignored. */
    close(element) {
      if (!element) return
      const index = stack.indexOf(element)
      if (index !== -1) stack.splice(index, 1)
    },
    /** The overlay on top, or null when nothing is open. */
    top() {
      return stack[stack.length - 1] || null
    },
    contains(element) {
      return Boolean(element) && stack.includes(element)
    },
    size() {
      return stack.length
    }
  }
}

/** Opens a native modal dialog. Returns false when the platform cannot. */
export function showModalDialog(element) {
  if (!element) return false
  if (element.open) return true
  if (typeof element.showModal !== 'function') return false
  element.showModal()
  return true
}

/** Closes a native dialog. Returns false when it was not open. */
export function hideDialog(element) {
  if (!element) return false
  if (!element.open) return false
  if (typeof element.close !== 'function') return false
  element.close()
  return true
}

/**
 * Wires a reactive `open` flag to a native `<dialog>` element.
 *
 * The flag is the single source of truth: every existing call site that sets
 * it opens or closes the dialog, so no call site has to change. The element
 * is created and destroyed with the flag (`v-if`), so it is opened after the
 * next render and closed before it is removed.
 *
 * The dialog's `close` event is the single source of truth for "this overlay
 * is gone": it fires for `Esc`, for the back gesture, and for `close()`.
 */
export function createDialogController({ open, element, stack }) {
  watch(open, async (isOpen) => {
    // Closing runs before the render, so the element is still in the DOM and
    // can be closed properly.
    if (!isOpen) {
      const el = element && element.value
      if (stack) stack.close(el)
      hideDialog(el)
      return
    }
    // Opening runs after the render, so the element exists.
    await nextTick()
    const el = element && element.value
    if (!el) return
    showModalDialog(el)
    if (stack) stack.open(el)
  }, { flush: 'pre' })

  /** Wired to the dialog's `close` event. */
  function onClosed() {
    if (open) open.value = false
    if (stack) stack.close(element && element.value)
  }

  return { onClosed }
}

/**
 * Light dismiss for dialogs that ask for it with `closedby="any"`.
 *
 * `closedby` is not supported in Safari, so the platform only light-dismisses
 * where it understands the attribute. This is the guide's documented
 * fallback: it tests the pointer *position* rather than the event target,
 * because the dialog is also the target for its own padding and for the
 * gaps between its children.
 */
export function installLightDismiss(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return () => {}

  const dialogFrom = (event) => {
    const target = event.target
    if (!target || typeof target.closest !== 'function') return null
    const dialog = target.closest('dialog[closedby="any"]')
    return dialog && dialog.open ? dialog : null
  }

  const outside = (event, dialog) => {
    const rect = dialog.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
  }

  let pressedDialog = null
  let pressedOutside = false

  const onPointerDown = (event) => {
    pressedDialog = dialogFrom(event)
    pressedOutside = pressedDialog ? outside(event, pressedDialog) : false
  }

  const onPointerUp = (event) => {
    const dialog = pressedDialog
    const wasOutside = pressedOutside
    pressedDialog = null
    pressedOutside = false
    if (!dialog || !wasOutside) return
    if (!outside(event, dialog)) return
    hideDialog(dialog)
  }

  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('pointerup', onPointerUp, true)

  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('pointerup', onPointerUp, true)
  }
}
