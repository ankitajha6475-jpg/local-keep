import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { isImeComposing, runUnlessIme } from '../src/shared/ime.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

// ── isImeComposing ───────────────────────────────────────────────────────────

test('isImeComposing is false for a normal keystroke', () => {
  assert.equal(isImeComposing({ key: 'Enter', keyCode: 13, isComposing: false }), false)
  assert.equal(isImeComposing({ key: 'a', keyCode: 65 }), false)
  assert.equal(isImeComposing(null), false)
  assert.equal(isImeComposing(undefined), false)
})

test('isImeComposing is true while the IME owns the keystroke', () => {
  assert.equal(isImeComposing({ key: 'Enter', isComposing: true }), true)
  assert.equal(isImeComposing({ key: 'Process', isComposing: true }), true)
  assert.equal(isImeComposing({ key: ',', isComposing: true }), true)
  assert.equal(isImeComposing({ key: 'ArrowDown', isComposing: true }), true)
})

test('isImeComposing catches the Safari out-of-order composition end', () => {
  // WebKit bug 165004: compositionend is delivered before the confirming
  // Enter keydown, so isComposing is already false. keyCode 229 (VK_PROCESSKEY)
  // is the only remaining signal.
  assert.equal(isImeComposing({ key: 'Enter', keyCode: 229, isComposing: false }), true)
  assert.equal(isImeComposing({ key: 'Escape', keyCode: 229, isComposing: false }), true)
  assert.equal(isImeComposing({ key: 'Tab', keyCode: 229, isComposing: false }), true)
})

test('isImeComposing ignores keyCode 229 on keys an IME does not confirm with', () => {
  // Soft keyboards report 229 for ordinary character entry, so a blanket
  // check would disable the comma commit and the arrow-key navigation.
  assert.equal(isImeComposing({ key: ',', keyCode: 229, isComposing: false }), false)
  assert.equal(isImeComposing({ key: 'ArrowDown', keyCode: 229, isComposing: false }), false)
  assert.equal(isImeComposing({ key: 'a', keyCode: 229, isComposing: false }), false)
})

// ── runUnlessIme ─────────────────────────────────────────────────────────────

function fakeEvent({ key = 'Enter', keyCode = 13, isComposing = false } = {}) {
  return { key, keyCode, isComposing, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
}

test('runUnlessIme runs the action and cancels the default when no IME owns the key', () => {
  const event = fakeEvent()
  let ran = 0
  const result = runUnlessIme(event, () => { ran += 1 })
  assert.equal(result, true)
  assert.equal(ran, 1)
  assert.equal(event.defaultPrevented, true)
})

test('runUnlessIme stands down and leaves the default action alone during composition', () => {
  const event = fakeEvent({ isComposing: true })
  let ran = 0
  const result = runUnlessIme(event, () => { ran += 1 })
  assert.equal(result, false)
  assert.equal(ran, 0, 'the action must not run')
  assert.equal(event.defaultPrevented, false, 'the IME candidate confirmation must not be swallowed')
})

test('runUnlessIme stands down for the Safari keyCode 229 case', () => {
  const event = fakeEvent({ keyCode: 229 })
  let ran = 0
  assert.equal(runUnlessIme(event, () => { ran += 1 }), false)
  assert.equal(ran, 0)
  assert.equal(event.defaultPrevented, false)
})

// ── DOM level ────────────────────────────────────────────────────────────────

function mount(input, onCommit) {
  // The exact guard shape the components use.
  input.addEventListener('keydown', (event) => {
    runUnlessIme(event, () => onCommit())
  })
}

function press(input, init) {
  const event = new input.ownerDocument.defaultView.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  input.dispatchEvent(event)
  return event
}

function dom() {
  return new JSDOM('<!doctype html><html><body><input id="f"></body></html>')
}

test('a DOM input does not commit while an IME is composing', () => {
  const d = dom()
  const input = d.window.document.getElementById('f')
  let commits = 0
  mount(input, () => { commits += 1 })

  const composing = press(input, { key: 'Enter', isComposing: true })
  assert.equal(commits, 0, 'the value must not be committed')
  assert.equal(composing.defaultPrevented, false, 'the candidate confirmation must reach the IME')

  const legacy = press(input, { key: 'Enter', keyCode: 229 })
  assert.equal(commits, 0, 'the Safari out-of-order case must not commit')
  assert.equal(legacy.defaultPrevented, false)
})

test('a DOM input commits on Enter when no IME is composing', () => {
  const d = dom()
  const input = d.window.document.getElementById('f')
  let commits = 0
  mount(input, () => { commits += 1 })

  const event = press(input, { key: 'Enter', keyCode: 13 })
  assert.equal(commits, 1)
  assert.equal(event.defaultPrevented, true)
})

test('the comma key commits outside composition and not during it', () => {
  const d = dom()
  const input = d.window.document.getElementById('f')
  let commits = 0
  mount(input, () => { commits += 1 })

  press(input, { key: ',', keyCode: 188 })
  assert.equal(commits, 1)

  press(input, { key: ',', keyCode: 188, isComposing: true })
  assert.equal(commits, 1, 'a half-composed tag must not be committed')
})

// ── source level regression guard ───────────────────────────────────────────

function vueFiles() {
  const dir = path.join(repoRoot, 'src')
  const out = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.vue')) out.push(full)
    }
  }
  walk(dir)
  return out
}

test('no template binding cancels Enter or Escape unconditionally', () => {
  // `@keydown.enter.prevent` expands to a preventDefault() that runs before
  // the handler body, so it cannot stand down for an IME. Modifier combos
  // (Ctrl/Cmd+Enter) do not conflict with candidate confirmation and are
  // allowed to keep `.prevent`.
  const problems = []
  for (const file of vueFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    const re = /@keydown([^"'\s=]*)/g
    let match
    while ((match = re.exec(source)) !== null) {
      const mods = match[1].split('.').filter(Boolean)
      const relevant = mods.includes('enter') || mods.includes('esc')
      if (!relevant) continue
      if (!mods.includes('prevent')) continue
      const modified = mods.includes('ctrl') || mods.includes('meta') || mods.includes('command')
      if (modified) continue
      problems.push(`${path.relative(repoRoot, file)}: ${match[0]}`)
    }
  }
  assert.deepEqual(problems, [], `unguarded IME-unsafe bindings:\n${problems.join('\n')}`)
})

test('every component that handles Enter or Escape imports the shared IME helper', () => {
  const problems = []
  for (const file of vueFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    const re = /@keydown([^"'\s=]*)/g
    let match
    let relevant = false
    while ((match = re.exec(source)) !== null) {
      const mods = match[1].split('.').filter(Boolean)
      if (mods.includes('enter') || mods.includes('esc') || mods.includes(',')) relevant = true
    }
    if (!relevant) continue
    if (!/shared\/ime\.js/.test(source)) {
      problems.push(path.relative(repoRoot, file))
    }
  }
  assert.deepEqual(problems, [], `components missing the shared IME helper:\n${problems.join('\n')}`)
})
