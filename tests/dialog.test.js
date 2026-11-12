import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { nextTick, ref } from 'vue'
import {
  createOverlayStack,
  createDialogController,
  showModalDialog,
  hideDialog,
  installLightDismiss
} from '../src/shared/dialog.js'

/**
 * A stand-in for a native <dialog>. jsdom implements neither `showModal()`
 * nor the top layer, so the tests exercise the app's own wiring against a
 * fake that records what it was asked to do.
 */
function fakeDialog({ closedby = 'any' } = {}) {
  return {
    open: false,
    closedby,
    showModalCalls: 0,
    closeCalls: 0,
    showModal() {
      this.showModalCalls += 1
      this.open = true
    },
    close() {
      this.closeCalls += 1
      this.open = false
    },
    getBoundingClientRect() {
      return { left: 100, top: 100, right: 300, bottom: 300 }
    }
  }
}

// ── Overlay stack ───────────────────────────────────────────────────────────

test('the overlay stack reports the most recently opened overlay', () => {
  const stack = createOverlayStack()
  const first = fakeDialog()
  const second = fakeDialog()
  assert.equal(stack.top(), null)
  stack.open(first)
  assert.equal(stack.top(), first)
  stack.open(second)
  assert.equal(stack.top(), second)
  assert.equal(stack.size(), 2)
})

test('the overlay stack removes an overlay when it closes', () => {
  const stack = createOverlayStack()
  const first = fakeDialog()
  const second = fakeDialog()
  stack.open(first)
  stack.open(second)
  stack.close(second)
  assert.equal(stack.top(), first)
  stack.close(first)
  assert.equal(stack.top(), null)
  assert.equal(stack.size(), 0)
})

test('the overlay stack ignores unknown and missing elements', () => {
  const stack = createOverlayStack()
  const known = fakeDialog()
  stack.open(known)
  stack.close(fakeDialog())
  stack.close(null)
  stack.open(null)
  assert.equal(stack.size(), 1)
  assert.equal(stack.top(), known)
})

test('reopening an overlay moves it back to the top', () => {
  const stack = createOverlayStack()
  const first = fakeDialog()
  const second = fakeDialog()
  stack.open(first)
  stack.open(second)
  stack.open(first)
  assert.equal(stack.top(), first)
  assert.equal(stack.size(), 2)
})

// ── Dialog helpers ──────────────────────────────────────────────────────────

test('showModalDialog opens a dialog once', () => {
  const dialog = fakeDialog()
  assert.equal(showModalDialog(dialog), true)
  assert.equal(dialog.showModalCalls, 1)
  assert.equal(showModalDialog(dialog), true)
  assert.equal(dialog.showModalCalls, 1, 'an already open dialog is not reopened')
})

test('hideDialog closes an open dialog and ignores a closed one', () => {
  const dialog = fakeDialog()
  assert.equal(hideDialog(dialog), false, 'a closed dialog is not closed again')
  dialog.open = true
  assert.equal(hideDialog(dialog), true)
  assert.equal(dialog.closeCalls, 1)
})

test('showModalDialog reports failure when the platform cannot open it', () => {
  assert.equal(showModalDialog(null), false)
  assert.equal(showModalDialog({ open: false }), false)
})

// ── Controller ──────────────────────────────────────────────────────────────

test('the controller opens the dialog and registers it on the stack', async () => {
  const stack = createOverlayStack()
  const dialog = fakeDialog()
  const open = ref(false)
  const controller = createDialogController({ open, element: { value: dialog }, stack })

  open.value = true
  await nextTick()
  await nextTick()
  assert.equal(open.value, true)
  assert.equal(dialog.showModalCalls, 1)
  assert.equal(stack.top(), dialog)
  assert.equal(typeof controller.onClosed, 'function')
})

test('the controller closes the dialog and removes it from the stack', async () => {
  const stack = createOverlayStack()
  const dialog = fakeDialog()
  const open = ref(false)
  createDialogController({ open, element: { value: dialog }, stack })

  open.value = true
  await nextTick()
  await nextTick()
  open.value = false
  await nextTick()
  assert.equal(open.value, false)
  assert.equal(dialog.closeCalls, 1)
  assert.equal(stack.top(), null)
})

test('the controller clears the flag when the dialog closes itself', async () => {
  const stack = createOverlayStack()
  const dialog = fakeDialog()
  const open = ref(false)
  const controller = createDialogController({ open, element: { value: dialog }, stack })

  open.value = true
  await nextTick()
  await nextTick()
  // The platform closed the dialog (Esc, back gesture): the `close` event
  // arrives and the controller has to drop the flag and the stack entry.
  controller.onClosed()
  assert.equal(open.value, false)
  assert.equal(stack.top(), null)
})

// ── Light dismiss ───────────────────────────────────────────────────────────

function lightDismissDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <dialog id="d" closedby="any"><p>content</p></dialog>
  </body></html>`)
  const dialog = dom.window.document.getElementById('d')
  dialog.open = true
  // jsdom has no layout, so the rect has to be stubbed for the
  // inside/outside test to mean anything.
  dialog.getBoundingClientRect = () => ({
    left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200
  })
  dialog.close = function () {
    this.open = false
    this.closed = true
  }
  return { dom, dialog }
}

test('light dismiss closes a dialog when the press and release are outside it', () => {
  const { dom, dialog } = lightDismissDom()
  installLightDismiss(dom.window.document)
  const down = new dom.window.MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true })
  const up = new dom.window.MouseEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true })
  dialog.dispatchEvent(down)
  dialog.dispatchEvent(up)
  assert.equal(dialog.closed, true, 'the dialog closes')
})

test('light dismiss keeps a dialog open when the press is inside it', () => {
  const { dom, dialog } = lightDismissDom()
  installLightDismiss(dom.window.document)
  const down = new dom.window.MouseEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true })
  const up = new dom.window.MouseEvent('pointerup', { clientX: 200, clientY: 200, bubbles: true })
  dialog.dispatchEvent(down)
  dialog.dispatchEvent(up)
  assert.equal(dialog.closed, undefined, 'the dialog stays open')
})

test('light dismiss ignores a release that ends inside the dialog', () => {
  const { dom, dialog } = lightDismissDom()
  installLightDismiss(dom.window.document)
  const down = new dom.window.MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true })
  const up = new dom.window.MouseEvent('pointerup', { clientX: 200, clientY: 200, bubbles: true })
  dialog.dispatchEvent(down)
  dialog.dispatchEvent(up)
  assert.equal(dialog.closed, undefined, 'a drag that ends inside must not dismiss')
})

test('light dismiss does not close a dialog that did not ask for it', () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <dialog id="d"><p>content</p></dialog>
  </body></html>`)
  const dialog = dom.window.document.getElementById('d')
  dialog.open = true
  dialog.close = function () { this.closed = true }
  installLightDismiss(dom.window.document)
  const down = new dom.window.MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true })
  const up = new dom.window.MouseEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true })
  dialog.dispatchEvent(down)
  dialog.dispatchEvent(up)
  assert.equal(dialog.closed, undefined)
})
