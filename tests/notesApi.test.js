import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

test('notes API: revisions, stable ids, branch, archive, restore, purge', async () => {
  const server = await startTestServer()
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    assert.deepEqual(await request('GET', '/api/notes'), [])

    const created = await request('POST', '/api/notes', {
      title: 'Alpha',
      content: 'hello world'
    })
    assert.ok(created.id)
    assert.equal(created.revisionNo, 1)
    assert.ok(created.revisionId)

    const edited = await request('PUT', `/api/notes/${created.id}`, {
      title: 'Alpha',
      content: 'hello again',
      baseRevisionId: created.revisionId
    })
    assert.equal(edited.id, created.id, 'document id must not change')
    assert.equal(edited.revisionNo, 2)
    assert.ok(edited.revisionId)
    assert.match(edited.notice, /revision 2/i)

    const history = await request('GET', `/api/notes/${created.id}/history`)
    assert.equal(history.headRevisionId, edited.revisionId)
    assert.equal(history.revisions.length, 2)
    assert.equal(history.revisions[0].id, created.revisionId)
    assert.equal(history.revisions[1].parentId, created.revisionId)
    assert.equal(history.revisions[1].onHeadChain, true)

    // Stale save branches under the same note id.
    const second = await request('POST', '/api/notes', {
      title: 'Beta',
      content: 'base'
    })
    const base = second.revisionId
    const firstWriter = await request('PUT', `/api/notes/${second.id}`, {
      content: 'first writer',
      baseRevisionId: base
    })
    assert.equal(firstWriter.conflict, false)

    const secondWriter = await request('PUT', `/api/notes/${second.id}`, {
      content: 'second writer',
      baseRevisionId: base
    })
    assert.equal(secondWriter.id, second.id)
    assert.equal(secondWriter.conflict, true)
    assert.equal(secondWriter.content, 'first writer')
    assert.equal(secondWriter.revisionNo, 2, 'head stays on revision 2')
    assert.equal(secondWriter.revision.revisionNo, 3)
    assert.equal(secondWriter.createdRevisionId, secondWriter.revision.id)

    const branchedHistory = await request('GET', `/api/notes/${second.id}/history`)
    assert.equal(branchedHistory.revisions.length, 3)
    const branch = branchedHistory.revisions.find(r => r.revisionNo === 3)
    assert.equal(branch.parentId, base)
    assert.equal(branch.onHeadChain, false)

    // Search excludes archived notes.
    const search = await request('GET', '/api/search?q=hello')
    assert.ok(search.includes(created.id))

    const archive = await request('DELETE', `/api/notes/${created.id}`)
    assert.equal(archive.archived, true)
    const visible = await request('GET', '/api/notes')
    assert.equal(visible.some(n => n.id === created.id), false)
    const all = await request('GET', '/api/notes?includeArchived=1')
    assert.equal(all.find(n => n.id === created.id).archivedAt != null, true)
    assert.deepEqual(await request('GET', '/api/search?q=hello'), [])

    const restored = await request('POST', `/api/notes/${created.id}/restore`)
    assert.equal(restored.archivedAt, null)
    assert.ok((await request('GET', '/api/notes')).some(n => n.id === created.id))

    // Purge removes the note and its history.
    await request('DELETE', `/api/notes/${created.id}?purge=1`)
    await assert.rejects(
      () => request('GET', `/api/notes/${created.id}/history`),
      error => error.status === 404
    )
  } finally {
    await server.stop()
  }
})
