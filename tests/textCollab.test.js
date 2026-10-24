import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createFreshContext } from './helpers/testDb.js'
import { createTextCollabService } from '../src/server/services/textCollab.js'
import { joinFence } from '../src/shared/noteMeta.js'

test('draft listing returns uncommitted shared drafts and omits clean ones', () => {
  const ctx = createFreshContext()
  try {
    const note = ctx.notes.createNote({ title: 'Live', content: 'hello' })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })

    assert.deepEqual(service.listDrafts(), [])

    service.snapshot(note.id)
    service.applyTextSnapshot(note.id, 'draft body')
    service.applyTitle(note.id, 'Draft title')
    service.persistNow(note.id)

    const drafts = service.listDrafts()
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].noteId, note.id)
    assert.equal(drafts[0].title, 'Draft title')
    assert.equal(drafts[0].headTitle, 'Live')
    assert.equal(drafts[0].content, 'draft body')
    assert.equal(drafts[0].baseRevisionId, note.revisionId)

    service.resetToHead(note.id)
    assert.deepEqual(service.listDrafts(), [])
  } finally {
    ctx.cleanup()
  }
})

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

test('the shared draft holds the body only; the fence rides meta.props', () => {
  const ctx = createFreshContext()
  try {
    const content = '---\ntags: [project/alpha]\nstatus: active\n---\n# Heading\n\nbody text'
    const note = ctx.notes.createNote({ title: 'Fenced', content })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })

    const snap = service.snapshot(note.id)
    assert.equal(snap.text, '# Heading\n\nbody text', 'no fence in the shared text')
    assert.equal(snap.props, 'tags: [project/alpha]\nstatus: active\n')

    // A clean draft must not be reported as changed: discardIfClean is the
    // predicate that decides "matches the head", and it must not fire wrongly.
    assert.equal(service.hasDraft(note.id), false, 'no draft row exists yet')
    service.persistNow(note.id)
    assert.equal(service.discardIfClean(note.id), true, 'an untouched draft is clean')

    // Saving the draft reassembles exactly one fence — no growth, no loss.
    const saved = joinFence(snap.props, snap.text)
    assert.equal(saved, content)
  } finally {
    ctx.cleanup()
  }
})

test('repeated draft saves never duplicate the properties fence', () => {
  const ctx = createFreshContext()
  try {
    const content = '---\ntags: [audit]\n---\n# Title\n\nbody'
    const note = ctx.notes.createNote({ title: 'Repeated', content })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })

    // Simulate several edit → save cycles through the shared draft.
    for (let i = 0; i < 4; i++) {
      const snap = service.snapshot(note.id)
      service.applyTextSnapshot(note.id, `${snap.text}\n\nedit ${i}`)
      const after = service.snapshot(note.id)
      ctx.notes.updateNote({
        id: note.id,
        content: joinFence(after.props, after.text)
      })
    }

    const final = ctx.notes.getNote(note.id).content
    const fenceCount = final.split('\n').filter(line => line.trim() === '---').length
    assert.equal(fenceCount, 2, `expected exactly one fence, found ${fenceCount / 2}`)
    assert.match(final, /^---\ntags: \[audit\]\n---\n# Title/)
    assert.equal(final.includes('---\n---\n'), false, 'fences must not stack')
  } finally {
    ctx.cleanup()
  }
})

test('a draft whose note already has a stacked fence is detected as clean against its own body', () => {
  const ctx = createFreshContext()
  try {
    // Legacy corrupted shape: the fence written twice.
    const corrupt = '---\ntags: [a]\n---\n---\ntags: [a]\n---\n# Body'
    const note = ctx.notes.createNote({ title: 'Legacy', content: corrupt })
    const service = createTextCollabService({ db: ctx.db, persistDelay: 10 })

    const snap = service.snapshot(note.id)
    // splitFence strips exactly one fence, so the remainder still leads with one.
    assert.equal(snap.text.startsWith('---\ntags: [a]\n---\n# Body'), true)
    // Round-tripping through the draft must not make the damage worse.
    const saved = joinFence(snap.props, snap.text)
    assert.equal(saved, corrupt, 'a legacy note round-trips unchanged')
  } finally {
    ctx.cleanup()
  }
})
