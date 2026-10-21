import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createFreshContext } from './helpers/testDb.js'
import { createTextCollabService } from '../src/server/services/textCollab.js'

test('live text docs initialize from the head and merge concurrent Yjs edits', () => {
  const ctx = createFreshContext()
  try {
    const note = ctx.notes.createNote({ title: 'Live', content: 'hello' })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    const initial = service.snapshot(note.id)
    assert.equal(initial.text, 'hello')
    assert.equal(initial.title, 'Live')
    assert.equal(initial.baseRevisionId, note.revisionId)

    const alice = new Y.Doc()
    Y.applyUpdate(alice, initial.update)
    const bob = new Y.Doc()
    Y.applyUpdate(bob, initial.update)

    alice.getText('content').insert(0, 'A')
    bob.getText('content').insert(5, 'B')

    const aliceUpdate = Y.encodeStateAsUpdate(alice, initial.stateVector)
    const bobUpdate = Y.encodeStateAsUpdate(bob, initial.stateVector)
    assert.equal(service.applyUpdate(note.id, aliceUpdate), true)
    assert.equal(service.applyUpdate(note.id, bobUpdate), true)

    const merged = service.snapshot(note.id)
    assert.equal(merged.text, 'AhelloB')
    assert.equal(merged.title, 'Live')

    service.persistNow(note.id)
    const reloaded = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    const persisted = reloaded.snapshot(note.id)
    assert.equal(persisted.text, 'AhelloB')
    assert.equal(persisted.baseRevisionId, note.revisionId)
  } finally {
    ctx.cleanup()
  }
})

test('live text docs keep an explicit base revision and reset to the new head', () => {
  const ctx = createFreshContext()
  try {
    const note = ctx.notes.createNote({ title: 'Base', content: 'one' })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    const initial = service.snapshot(note.id)

    const updated = ctx.notes.updateNote({
      id: note.id,
      title: 'Base',
      content: 'two',
      baseRevisionId: note.revisionId
    })
    service.setBaseRevision(note.id, updated.revisionId)
    assert.equal(service.snapshot(note.id).baseRevisionId, updated.revisionId)

    const reset = service.resetToHead(note.id)
    assert.equal(reset.text, 'two')
    assert.equal(reset.baseRevisionId, updated.revisionId)
  } finally {
    ctx.cleanup()
  }
})

test('a text-reset replaces the local draft instead of merging old Yjs items', async () => {
  const { createTextCollabManager } = await import('../src/collab/textCollabManager.js')
  const { bytesToBase64 } = await import('../src/shared/base64.js')
  const ctx = createFreshContext()
  try {
    const note = ctx.notes.createNote({ title: 'Reset', content: 'head' })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    const initial = service.snapshot(note.id)
    let latest = null
    const manager = createTextCollabManager({
      noteId: note.id,
      onSnapshot: next => { latest = next }
    })
    manager.handleMessage({
      type: 'text-snapshot',
      noteId: note.id,
      update: bytesToBase64(initial.update),
      stateVector: bytesToBase64(initial.stateVector),
      baseRevisionId: initial.baseRevisionId,
      revisionNo: initial.revisionNo
    })
    assert.equal(latest.text, 'head')
    assert.equal(manager.applyMarkdown('head plus draft'), true)

    const reset = service.snapshot(note.id)
    manager.handleMessage({
      type: 'text-reset',
      noteId: note.id,
      update: bytesToBase64(reset.update),
      baseRevisionId: reset.baseRevisionId,
      revisionNo: reset.revisionNo
    })
    assert.equal(latest.text, 'head')
  } finally {
    ctx.cleanup()
  }
})
