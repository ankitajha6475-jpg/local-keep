import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'

function canvasNote(ctx, x = 0) {
  const canvasData = JSON.stringify({
    elements: [{ id: 'e1', type: 'rectangle', x, y: 0, width: 100, height: 50 }],
    files: {}
  })
  return ctx.notes.createNote({ type: 'canvas', canvasData })
}

test('render manifest stores ordered tiles and computes staleness', () => {
  const ctx = createFreshContext()
  try {
    const note = canvasNote(ctx)
    const hash = 'abcdef0123456789'
    const manifest = ctx.renders.saveManifest({
      noteId: note.id,
      tiles: [
        { pageIndex: 1, hash: '1111111111111111', ext: 'png', width: 100, height: 50, bbox: [0, 0, 100, 50], elementIds: ['e1'] },
        { pageIndex: 0, hash, ext: 'png', width: 100, height: 50, bbox: [0, 0, 100, 50], elementIds: ['e1'] }
      ]
    })

    assert.equal(manifest.tileCount, 2)
    assert.deepEqual(manifest.tiles.map(t => t.pageIndex), [0, 1])
    assert.equal(manifest.tiles[0].hash, hash)
    assert.equal(manifest.stale, false)
    assert.equal(ctx.imageRefs.referencedHashes().has(hash), true)

    const latest = ctx.renders.latest(note.id)
    assert.equal(latest.renderId, manifest.renderId)
    assert.equal(latest.tiles.length, 2)

    // A checkpoint changes the canvas hash without a new render.
    const changed = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 200, y: 0, width: 100, height: 50 }],
      files: {}
    })
    ctx.revisions.checkpointCanvas({ noteId: note.id, canvasData: changed, force: true })
    assert.equal(ctx.renders.latest(note.id).stale, true)

    // A new manifest becomes current and clears staleness.
    const replaced = ctx.renders.saveManifest({
      noteId: note.id,
      tiles: [{ pageIndex: 0, hash: '2222222222222222', ext: 'png' }]
    })
    assert.equal(replaced.tileCount, 1)
    assert.equal(replaced.stale, false)
    const rows = ctx.db.prepare(
      'SELECT is_current FROM whiteboard_renders WHERE note_id = ? ORDER BY rendered_at ASC'
    ).all(note.id)
    assert.equal(rows.filter(r => r.is_current === 1).length, 1)
  } finally {
    ctx.cleanup()
  }
})

test('empty renders are stored without tiles', () => {
  const ctx = createFreshContext()
  try {
    const note = canvasNote(ctx)
    const manifest = ctx.renders.saveManifest({ noteId: note.id, tiles: [] })
    assert.equal(manifest.status, 'empty')
    assert.equal(manifest.tileCount, 0)
    assert.deepEqual(manifest.tiles, [])
  } finally {
    ctx.cleanup()
  }
})

test('unrendered notes report an unrendered manifest', () => {
  const ctx = createFreshContext()
  try {
    const note = canvasNote(ctx)
    const manifest = ctx.renders.latest(note.id)
    assert.equal(manifest.status, 'unrendered')
    assert.equal(manifest.stale, true)
    assert.deepEqual(manifest.tiles, [])
  } finally {
    ctx.cleanup()
  }
})
