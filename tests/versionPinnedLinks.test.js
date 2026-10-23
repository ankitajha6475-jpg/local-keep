import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'

test('a pinned reference is frozen against target edits and shows the pinned title', () => {
  const ctx = createFreshContext()
  try {
    const b = ctx.notes.createNote({ title: 'Beta', content: 'B version one' })
    const a = ctx.notes.createNote({ title: 'Alpha', content: 'See [[Beta]].' })

    // The link auto-pins Beta's head revision at link-creation time.
    let link = ctx.links.outgoing(a.id).find(l => l.targetNoteId === b.id)
    assert.equal(link.status, 'ok')
    assert.equal(link.targetRevisionId, b.revisionId)
    assert.equal(link.targetRevisionNo, 1)
    assert.equal(link.targetTitle, 'Beta')

    // Editing Beta (new title + revision) must not change Alpha's reference.
    ctx.notes.updateNote({
      id: b.id,
      title: 'Beta Renamed',
      content: 'B version two',
      baseRevisionId: b.revisionId
    })

    link = ctx.links.outgoing(a.id).find(l => l.targetNoteId === b.id)
    assert.equal(link.targetRevisionId, b.revisionId, 'pin must not drift to the new head')
    assert.equal(link.targetRevisionNo, 1)
    assert.equal(link.targetTitle, 'Beta', 'frozen title must reflect the pinned version')

    // The pinned revision is still readable and unchanged.
    const pinned = ctx.revisions.revisionSnapshot(b.id, b.revisionId)
    assert.equal(pinned.title, 'Beta')
    assert.equal(pinned.content, 'B version one')
  } finally {
    ctx.cleanup()
  }
})

test('a pinned reference stays frozen across edits to the source note', () => {
  const ctx = createFreshContext()
  try {
    const b = ctx.notes.createNote({ title: 'Beta', content: 'B one' })
    const a = ctx.notes.createNote({ title: 'Alpha', content: 'See [[Beta]].' })

    // Move Beta's head forward.
    ctx.notes.updateNote({ id: b.id, title: 'Beta', content: 'B two', baseRevisionId: b.revisionId })

    // Re-edit Alpha (unrelated) so its links are re-synced; the unchanged
    // [[Beta]] must keep its original pin, not re-pin to Beta's new head.
    const before = ctx.links.outgoing(a.id).find(l => l.targetNoteId === b.id)
    assert.equal(before.targetRevisionId, b.revisionId)
    ctx.notes.updateNote({ id: a.id, title: 'Alpha', content: 'Edited. See [[Beta]].', baseRevisionId: a.revisionId })

    const after = ctx.links.outgoing(a.id).find(l => l.targetNoteId === b.id)
    assert.equal(after.targetRevisionId, b.revisionId, 'pin must survive a source-note edit')
  } finally {
    ctx.cleanup()
  }
})

test('explicit version pins resolve to the named revision', () => {
  const ctx = createFreshContext()
  try {
    const b = ctx.notes.createNote({ title: 'Beta', content: 'B one' })
    const rev1 = b.revisionId
    ctx.notes.updateNote({ id: b.id, title: 'Beta', content: 'B two', baseRevisionId: b.revisionId })
    // b.revisionId is now rev2; pin explicitly to revision 1.
    const a = ctx.notes.createNote({ title: 'Alpha', content: 'See [[note:' + b.id + '@1]].' })

    const link = ctx.links.outgoing(a.id).find(l => l.targetNoteId === b.id)
    assert.equal(link.targetRevisionId, rev1)
    assert.equal(link.targetRevisionNo, 1)
    assert.equal(link.targetTitle, 'Beta')
  } finally {
    ctx.cleanup()
  }
})

test('every committed revision produces an old→new version-chain link', () => {
  const ctx = createFreshContext()
  try {
    const created = ctx.notes.createNote({ title: 'Alpha', content: 'one' })
    const rev1 = created.revisionId
    const second = ctx.notes.updateNote({ id: created.id, title: 'Alpha', content: 'two', baseRevisionId: rev1 })
    const third = ctx.notes.updateNote({ id: created.id, title: 'Alpha', content: 'three', baseRevisionId: second.revisionId })

    const history = ctx.notes.history(created.id)
    const links = history.versionLinks
    assert.equal(links.length, 2)
    // Old→new: each link goes from the superseded revision to its successor.
    assert.deepEqual(links.map(l => [l.fromRevisionNo, l.toRevisionNo]), [[1, 2], [2, 3]])
    assert.equal(links[0].fromRevisionId, rev1)
    assert.equal(links[0].toRevisionId, second.revisionId)
    assert.equal(links[1].fromRevisionId, second.revisionId)
    assert.equal(links[1].toRevisionId, third.revisionId)
  } finally {
    ctx.cleanup()
  }
})
