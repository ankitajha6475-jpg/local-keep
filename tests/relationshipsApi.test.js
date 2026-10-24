import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

test('relationships/tags API: links, backlinks, filters, graph', async () => {
  const server = await startTestServer()
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    const a = await request('POST', '/api/notes', {
      title: 'Alpha',
      content: '---\ntags: [project/local]\n---\nSee [[Beta]]'
    })
    const b = await request('POST', '/api/notes', {
      title: 'Beta',
      content: 'Beta body'
    })

    const tags = await request('GET', '/api/tags')
    const project = tags.tags.find(t => t.tag === 'project')
    assert.equal(project.total, 1)
    assert.equal(project.children[0].tag, 'project/local')

    const filtered = await request('GET', '/api/notes?tag=project')
    assert.deepEqual(filtered.map(n => n.id), [a.id])
    const exact = await request('GET', '/api/notes?tag=project&exactTag=1')
    assert.deepEqual(exact, [])

    const outgoing = await request('GET', `/api/notes/${a.id}/links`)
    assert.equal(outgoing.length, 1)
    assert.equal(outgoing[0].targetNoteId, b.id)
    assert.equal(outgoing[0].label, 'Beta')

    const backlinks = await request('GET', `/api/notes/${b.id}/backlinks`)
    assert.equal(backlinks.length, 1)
    assert.equal(backlinks[0].sourceNoteId, a.id)
    assert.match(backlinks[0].context, /\[\[Beta\]\]/)

    const c = await request('POST', '/api/notes', {
      title: 'Gamma',
      content: 'See [[Beta]] and [[Alpha]]'
    })
    const summary = await request('POST', '/api/notes/links/summary', {
      ids: [a.id, b.id],
      includeArchived: true
    })
    assert.equal(summary.noteIds.length, 2)
    assert.ok(summary.outgoing.some(entry => entry.targetNoteId === b.id))
    const sourceC = summary.incoming.find(entry => entry.sourceNoteId === c.id)
    assert.ok(sourceC)
    assert.deepEqual(sourceC.links.map(link => link.targetNoteId).sort(), [a.id, b.id].sort())

    await assert.rejects(
      request('POST', '/api/notes/links/summary', { ids: [] }),
      /non-empty array/
    )

    const graph = await request('GET', `/api/graph?noteId=${a.id}&depth=1`)
    assert.equal(graph.nodes.some(n => n.id === a.id), true)
    assert.equal(graph.nodes.some(n => n.id === b.id), true)
    assert.equal(graph.edges.some(e => e.source === a.id && e.target === b.id), true)

    const searchByTag = await request('GET', '/api/search?tag=project')
    assert.deepEqual(searchByTag, [a.id])

    // Removing the tag/link updates the materialised view.
    await request('PUT', `/api/notes/${a.id}`, {
      title: 'Alpha',
      content: 'plain now',
      baseRevisionId: a.revisionId
    })
    assert.deepEqual(await request('GET', `/api/notes?tag=project`), [])
    const remainingBacklinks = await request('GET', `/api/notes/${b.id}/backlinks`)
    assert.equal(remainingBacklinks.some(link => link.sourceNoteId === a.id), false)
  } finally {
    await server.stop()
  }
})
