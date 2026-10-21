import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { createFreshContext, TINY_PNG_DATA_URL } from './helpers/testDb.js'

function textNote(notes, overrides = {}) {
  return notes.createNote({
    title: 'Alpha',
    content: 'hello world',
    ...overrides
  })
}

test('create, edit, and history keep a stable note id', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    assert.equal(created.revisionNo, 1)
    assert.ok(created.revisionId)
    assert.equal(created.displayTitle, 'Alpha')

    const firstRevision = created.revisionId
    const updated = ctx.notes.updateNote({
      id: created.id,
      title: 'Alpha',
      content: 'hello again',
      baseRevisionId: firstRevision
    })

    assert.equal(updated.id, created.id, 'note id must not change')
    assert.equal(updated.revisionNo, 2)
    assert.notEqual(updated.revisionId, firstRevision)
    assert.equal(updated.content, 'hello again')
    assert.match(updated.notice, /revision 2/i)

    const history = ctx.notes.history(created.id)
    assert.equal(history.headRevisionId, updated.revisionId)
    assert.equal(history.revisions.length, 2)
    assert.equal(history.revisions[0].id, firstRevision)
    assert.equal(history.revisions[0].onHeadChain, true)
    assert.equal(history.revisions[1].parentId, firstRevision)
    assert.equal(history.revisions[1].isHead, true)
  } finally {
    ctx.cleanup()
  }
})

test('a stale base creates a branch and leaves the head unchanged', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    const base = created.revisionId

    const first = ctx.notes.updateNote({
      id: created.id, content: 'first writer', baseRevisionId: base
    })
    assert.equal(first.conflict, false)
    assert.equal(first.revisionNo, 2)

    const second = ctx.notes.updateNote({
      id: created.id, content: 'second writer', baseRevisionId: base
    })
    assert.equal(second.conflict, true)
    assert.equal(second.id, created.id)
    assert.equal(second.revisionNo, 2, 'head stays at revision 2')
    assert.equal(second.revision.revisionNo, 3)
    assert.equal(second.createdRevisionId, second.revision.id)
    assert.equal(second.content, 'first writer', 'head must stay on the first writer')
    assert.match(second.notice, /branch/i)

    const history = ctx.notes.history(created.id)
    assert.equal(history.revisions.length, 3)
    const branch = history.revisions.find(r => r.revisionNo === 3)
    assert.equal(branch.parentId, base)
    assert.equal(branch.onHeadChain, false)
    assert.equal(history.revisions.find(r => r.revisionNo === 2).onHeadChain, true)
  } finally {
    ctx.cleanup()
  }
})

test('take_head explicitly moves the head after a stale edit', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    const base = created.revisionId
    ctx.notes.updateNote({ id: created.id, content: 'first', baseRevisionId: base })

    const takeover = ctx.notes.updateNote({
      id: created.id,
      content: 'mine wins',
      baseRevisionId: base,
      mode: 'take_head'
    })
    assert.equal(takeover.conflict, false)
    assert.equal(takeover.content, 'mine wins')
    assert.equal(ctx.notes.getNote(created.id).content, 'mine wins')
    const history = ctx.notes.history(created.id)
    assert.equal(history.revisions.filter(r => r.onHeadChain).length, 3)
  } finally {
    ctx.cleanup()
  }
})

test('no-op commits do not create revisions', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    const result = ctx.notes.updateNote({
      id: created.id,
      title: created.title,
      content: created.content,
      baseRevisionId: created.revisionId
    })
    assert.equal(result.unchanged, true)
    assert.equal(result.revisionNo, 1)
    assert.equal(ctx.notes.history(created.id).revisions.length, 1)
  } finally {
    ctx.cleanup()
  }
})

test('restore and promote append revisions without rewriting history', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    const r1 = created.revisionId

    const r2 = ctx.notes.updateNote({
      id: created.id, content: 'version two', baseRevisionId: r1
    })
    const restored = ctx.notes.restoreRevision(created.id, r1)
    assert.equal(restored.content, 'hello world')
    assert.equal(restored.revisionNo, 3)
    assert.notEqual(restored.revisionId, r1)
    assert.equal(ctx.revisions.getRevision(r1).content, 'hello world')
    assert.equal(ctx.revisions.getRevision(r2.revisionId).content, 'version two')

    // Create a branch, then promote it.
    const branch = ctx.notes.updateNote({
      id: created.id, content: 'branch content', baseRevisionId: r1
    })
    assert.equal(branch.conflict, true)
    const promoted = ctx.notes.promoteRevision(created.id, branch.createdRevisionId)
    assert.equal(promoted.content, 'branch content')
    assert.equal(promoted.conflict, false)
    assert.equal(ctx.notes.getNote(created.id).content, 'branch content')
    assert.equal(ctx.revisions.getRevision(branch.createdRevisionId).content, 'branch content')

    const history = ctx.notes.history(created.id)
    assert.ok(history.revisions.length >= 5)
  } finally {
    ctx.cleanup()
  }
})

test('archive retains revisions and hides the note from default lists', () => {
  const ctx = createFreshContext()
  try {
    const created = textNote(ctx.notes)
    ctx.notes.updateNote({ id: created.id, content: 'kept history', baseRevisionId: created.revisionId })

    ctx.notes.archiveNote(created.id)
    assert.equal(ctx.notes.listNotes().some(n => n.id === created.id), false)
    assert.equal(ctx.notes.listNotes({ includeArchived: true }).some(n => n.id === created.id), true)
    assert.equal(ctx.notes.history(created.id).revisions.length, 2)

    const restored = ctx.notes.restoreNote(created.id)
    assert.equal(restored.archivedAt, null)
    assert.equal(ctx.notes.listNotes().some(n => n.id === created.id), true)
  } finally {
    ctx.cleanup()
  }
})

test('purge removes revisions and releases image references', () => {
  const ctx = createFreshContext()
  try {
    const hash = 'abcdef0123456789'
    fs.writeFileSync(path.join(ctx.imagesDir, `${hash}.png`), Buffer.from('x'))
    const created = textNote(ctx.notes, {
      content: `has image ![x](/api/images/${hash}.png)`
    })
    assert.equal(ctx.imageRefs.referencedHashes().has(hash), true)

    ctx.notes.purgeNote(created.id)
    assert.equal(ctx.notes.listNotes({ includeArchived: true }).length, 0)
    assert.equal(ctx.imageRefs.referencedHashes().has(hash), false)
  } finally {
    ctx.cleanup()
  }
})

test('old revision image refs survive removal from the head', () => {
  const ctx = createFreshContext()
  try {
    const hash = '0123456789abcdef'
    fs.writeFileSync(path.join(ctx.imagesDir, `${hash}.png`), Buffer.from('x'))
    const created = textNote(ctx.notes, {
      content: `old image ![x](/api/images/${hash}.png)`
    })

    ctx.notes.updateNote({
      id: created.id,
      content: 'no image anymore',
      baseRevisionId: created.revisionId
    })
    // Head no longer references it, but revision 1 does.
    assert.equal(ctx.imageRefs.referencedHashes().has(hash), true)
    const deleted = ctx.imageRefs.cleanupImages()
    assert.deepEqual(deleted, [])
    assert.equal(fs.existsSync(path.join(ctx.imagesDir, `${hash}.png`)), true)
  } finally {
    ctx.cleanup()
  }
})

test('canvas checkpoints create revisions under the same note id', () => {
  const ctx = createFreshContext()
  try {
    const canvasData = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }],
      files: {}
    })
    const created = ctx.notes.createNote({ type: 'canvas', canvasData })
    assert.equal(created.revisionNo, 1)

    const changed = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 20, y: 20, width: 10, height: 10 }],
      files: {}
    })
    const revision = ctx.revisions.checkpointCanvas({
      noteId: created.id,
      canvasData: changed,
      actor: 'ui',
      force: true
    })
    assert.ok(revision)
    assert.equal(revision.note_id, created.id)
    assert.equal(revision.type, 'canvas')
    const note = ctx.notes.getNote(created.id)
    assert.equal(note.id, created.id)
    assert.equal(note.revisionNo, 2)
    assert.equal(JSON.parse(note.canvasData).elements[0].x, 20)

    const duplicate = ctx.revisions.checkpointCanvas({
      noteId: created.id,
      canvasData: changed,
      actor: 'ui',
      force: true
    })
    assert.equal(duplicate, null, 'an unchanged canvas must not create a duplicate checkpoint')
    assert.equal(ctx.notes.history(created.id).revisions.length, 2)
  } finally {
    ctx.cleanup()
  }
})

test('display title is derived for title-less notes and updated on commit', () => {
  const ctx = createFreshContext()
  try {
    const created = ctx.notes.createNote({ title: '', content: 'leading content here' })
    assert.equal(created.displayTitle, 'leading content here')
    const updated = ctx.notes.updateNote({
      id: created.id,
      title: '',
      content: 'new leading content',
      baseRevisionId: created.revisionId
    })
    assert.equal(updated.displayTitle, 'new leading content')
  } finally {
    ctx.cleanup()
  }
})

// Keep the tiny PNG helper exercised so the legacy migration test can share it.
test('tiny png fixture is a valid data url', () => {
  assert.match(TINY_PNG_DATA_URL, /^data:image\/png;base64,/)
})
