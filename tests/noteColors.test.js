import test from 'node:test'
import assert from 'node:assert/strict'
import { readNoteColorChange } from '../src/shared/noteColors.js'

test('color selection unwraps the card payload', () => {
  assert.deepEqual(
    readNoteColorChange({ note: { id: 'note-1', color: 'blue' }, color: 'green' }),
    { noteId: 'note-1', color: 'green', previous: 'blue' }
  )
  assert.deepEqual(
    readNoteColorChange({ note: { id: 'note-1', color: 'blue' }, color: null }),
    { noteId: 'note-1', color: null, previous: 'blue' }
  )
})

test('color selection rejects a missing note', () => {
  assert.equal(readNoteColorChange({ color: 'green' }), null)
  assert.equal(readNoteColorChange(), null)
})
