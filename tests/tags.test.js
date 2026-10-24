import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'

/** Wire tag rewriting to property mutations the way server.js does. */
function wire(ctx) {
  ctx.tags.setApplyNoteTags((noteId, nextTags, opts) =>
    ctx.notes.setProperties(noteId, {
      set: { tags: nextTags },
      actor: opts?.actor || 'ui',
      message: opts?.message || 'tag edit'
    })
  )
  return ctx
}

function tagged(contentTags) {
  return contentTags.length
    ? `---\ntags: [${contentTags.join(', ')}]\n---\nbody`
    : 'body'
}

test('rename rewrites the subtree exactly, never a longer sibling', () => {
  const ctx = wire(createFreshContext())
  try {
    const a = ctx.notes.createNote({ title: 'A', content: tagged(['area/project', 'area/project/alpha']) })
    const b = ctx.notes.createNote({ title: 'B', content: tagged(['area/projector']) })

    const result = ctx.tags.rewritePath({ from: 'area/project', to: 'area/proj' })
    assert.deepEqual(result.changed.sort(), [a.id, b.id].sort().filter(id => id === a.id))
    assert.equal(result.changed.length, 1)

    assert.deepEqual(ctx.notes.getNote(a.id).tags.sort(), ['area/proj', 'area/proj/alpha'])
    assert.deepEqual(ctx.notes.getNote(b.id).tags, ['area/projector'], 'a longer sibling is untouched')
  } finally {
    ctx.cleanup()
  }
})

test('move reroots the subtree under a new parent', () => {
  const ctx = wire(createFreshContext())
  try {
    const a = ctx.notes.createNote({ title: 'A', content: tagged(['alpha', 'alpha/one']) })
    ctx.tags.rewritePath({ from: 'alpha', to: 'ops/alpha' })
    assert.deepEqual(ctx.notes.getNote(a.id).tags.sort(), ['ops/alpha', 'ops/alpha/one'])
  } finally {
    ctx.cleanup()
  }
})

test('delete removes the subtree and leaves notes intact', () => {
  const ctx = wire(createFreshContext())
  try {
    const a = ctx.notes.createNote({
      title: 'A',
      content: tagged(['area/project', 'area/project/alpha', 'keep'])
    })
    ctx.tags.rewritePath({ from: 'area/project', to: null })
    assert.deepEqual(ctx.notes.getNote(a.id).tags, ['keep'])
    assert.equal(ctx.notes.getNote(a.id).title, 'A', 'the note itself is untouched')
  } finally {
    ctx.cleanup()
  }
})

test('rename creates one property revision per affected note', () => {
  const ctx = wire(createFreshContext())
  try {
    const a = ctx.notes.createNote({ title: 'A', content: tagged(['area/project']) })
    const before = ctx.notes.history(a.id).revisions.length

    ctx.tags.rewritePath({ from: 'area/project', to: 'area/proj', message: 'tag rename: area/project → area/proj' })

    const revisions = ctx.notes.history(a.id).revisions
    assert.equal(revisions.length, before + 1)
    const latest = revisions[revisions.length - 1]
    assert.equal(latest.source, 'property')
    assert.equal(latest.message, 'tag rename: area/project → area/proj')
    assert.equal(latest.revisionNo, before + 1, 'appended, never rewritten')
  } finally {
    ctx.cleanup()
  }
})

test('archived notes are skipped and reported', () => {
  const ctx = wire(createFreshContext())
  try {
    const live = ctx.notes.createNote({ title: 'Live', content: tagged(['area/project']) })
    const stored = ctx.notes.createNote({ title: 'Stored', content: tagged(['area/project']) })
    ctx.notes.archiveNote(stored.id)

    const result = ctx.tags.rewritePath({ from: 'area/project', to: 'area/proj' })
    assert.deepEqual(result.changed, [live.id])
    assert.deepEqual(result.skipped.map(s => s.noteId), [stored.id])
    assert.equal(result.skipped[0].reason, 'note_archived')
    assert.deepEqual(ctx.notes.getNote(stored.id).tags, ['area/project'], 'archived tags are unchanged')
  } finally {
    ctx.cleanup()
  }
})

test('exact-path delete keeps partial matches', () => {
  const ctx = wire(createFreshContext())
  try {
    const a = ctx.notes.createNote({ title: 'A', content: tagged(['area/projector', 'area/project/alpha']) })
    ctx.tags.rewritePath({ from: 'area/project', to: null })
    assert.deepEqual(ctx.notes.getNote(a.id).tags, ['area/projector'])
  } finally {
    ctx.cleanup()
  }
})
