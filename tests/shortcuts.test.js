import test from 'node:test'
import assert from 'node:assert/strict'
import { SHORTCUTS, eventShortcut, shortcutLabel } from '../src/shared/shortcuts.js'

test('shortcut labels use the platform modifier', () => {
  assert.equal(shortcutLabel('Mod+Enter', 'Ctrl'), 'Ctrl+Enter')
  assert.equal(shortcutLabel('Mod+Alt+X', 'Cmd'), 'Cmd+Alt+X')
  assert.equal(shortcutLabel('Esc', 'Cmd'), 'Esc')
  assert.equal(shortcutLabel(undefined, 'Ctrl'), '')
})

test('eventShortcut normalises keys and modifiers', () => {
  assert.equal(eventShortcut({ key: 'r' }, 'Ctrl'), 'R')
  assert.equal(eventShortcut({ key: 'R', shiftKey: true }, 'Ctrl'), 'Shift+R')
  assert.equal(eventShortcut({ key: 'r', ctrlKey: true }, 'Ctrl'), 'Ctrl+R')
  assert.equal(eventShortcut({ key: 'r', metaKey: true }, 'Cmd'), 'Cmd+R')
  assert.equal(eventShortcut({ key: 'Enter', ctrlKey: true }, 'Ctrl'), 'Ctrl+Enter')
  assert.equal(eventShortcut({ key: 'x', ctrlKey: true, altKey: true }, 'Ctrl'), 'Ctrl+Alt+X')
  assert.equal(eventShortcut({ key: 'Escape' }, 'Ctrl'), 'Esc')
  assert.equal(eventShortcut({ key: ' ' }, 'Ctrl'), 'Space')
})

test('every declared shortcut has a usable label', () => {
  for (const [id, combo] of Object.entries(SHORTCUTS)) {
    assert.ok(combo, `${id} has a shortcut`)
    assert.equal(shortcutLabel(combo, 'Ctrl').includes('Mod'), false, `${id} is displayable`)
  }
})
