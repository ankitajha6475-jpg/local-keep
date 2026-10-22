import test from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR_TOOLS, matchEditorShortcut } from '../src/shared/editorTools.js'

function key(code, { ctrl = true, meta = false, shift = false, alt = false } = {}) {
  return { code, ctrlKey: ctrl, metaKey: meta, shiftKey: shift, altKey: alt }
}

test('editor shortcuts require Ctrl or Cmd', () => {
  assert.equal(matchEditorShortcut({ code: 'KeyB', ctrlKey: false, metaKey: false }), null)
  assert.equal(matchEditorShortcut(key('KeyB')), 'bold')
  assert.equal(matchEditorShortcut(key('KeyB', { ctrl: false, meta: true })), 'bold')
})

test('editor shortcuts match exact Shift and Alt modifiers', () => {
  assert.equal(matchEditorShortcut(key('KeyX', { shift: true })), 'strike')
  assert.equal(matchEditorShortcut(key('KeyX')), null)
  assert.equal(matchEditorShortcut(key('KeyE', { shift: true })), 'inline-code')
  assert.equal(matchEditorShortcut(key('KeyF', { shift: true })), 'code-block')
  assert.equal(matchEditorShortcut(key('KeyF')), null)
  assert.equal(matchEditorShortcut(key('Digit1', { shift: true })), 'heading-1')
  assert.equal(matchEditorShortcut(key('Digit1')), null)
  assert.equal(matchEditorShortcut(key('KeyB', { alt: true })), null)
})

test('every toolbar tool has a unique id and a matching shortcut', () => {
  const ids = new Set()
  for (const tool of EDITOR_TOOLS) {
    assert.equal(ids.has(tool.id), false, `duplicate tool id: ${tool.id}`)
    ids.add(tool.id)
    assert.ok(tool.label)
    assert.ok(tool.shortcut.startsWith('Mod+'))
    const event = key(tool.code, {
      shift: !!tool.shift,
      alt: !!tool.alt
    })
    assert.equal(matchEditorShortcut(event), tool.id, `shortcut mismatch for ${tool.id}`)
  }
})

test('shortcut matching ignores Alt by itself and unrelated keys', () => {
  assert.equal(matchEditorShortcut({ code: 'AltLeft', altKey: true }), null)
  assert.equal(matchEditorShortcut(key('KeyQ')), null)
})
