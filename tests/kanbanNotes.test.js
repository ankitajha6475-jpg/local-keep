import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

test('kanban board: creation, action suite deltas, version bumping, and FTS indexing', async () => {
  const server = await startTestServer()
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    // 1. Create a kanban board note
    const created = await request('POST', '/api/notes', {
      title: 'Project Roadmap',
      type: 'kanban'
    })

    assert.equal(created.type, 'kanban')
    assert.equal(created.revisionNo, 1)
    const initBoard = JSON.parse(created.content)
    assert.equal(initBoard.columns.length, 3)
    assert.deepEqual(initBoard.cards, [])

    // 2. Commit a delta action suite: add a card
    const card1 = {
      id: 'card_task_1',
      columnId: 'col_todo',
      title: 'Setup Kubernetes Cluster',
      description: '- [ ] configure ingress\n- [ ] setup cert-manager',
      color: null,
      order: 1000
    }

    const res1 = await request('PUT', `/api/notes/${created.id}/kanban`, {
      actions: [
        { type: 'card_added', card: card1 }
      ]
    })

    assert.equal(res1.revision.revisionNo, 2)
    assert.equal(res1.board.cards.length, 1)
    assert.equal(res1.board.cards[0].title, 'Setup Kubernetes Cluster')

    // 3. Move the card to "col_doing" and add a second card
    const card2 = {
      id: 'card_task_2',
      columnId: 'col_todo',
      title: 'Write Documentation',
      description: 'Document the deployment process',
      color: 'amber',
      order: 2000
    }

    const res2 = await request('PUT', `/api/notes/${created.id}/kanban`, {
      actions: [
        { type: 'card_moved', cardId: 'card_task_1', toColumnId: 'col_doing', order: 1000 },
        { type: 'card_added', card: card2 }
      ]
    })

    assert.equal(res2.revision.revisionNo, 3)
    assert.equal(res2.board.cards.length, 2)
    const c1 = res2.board.cards.find(c => c.id === 'card_task_1')
    assert.equal(c1.columnId, 'col_doing')

    // 4. Verify note head
    const fetched = await request('GET', `/api/notes/${created.id}`)
    assert.equal(fetched.revisionNo, 3)
    const fetchedBoard = JSON.parse(fetched.content)
    assert.equal(fetchedBoard.cards.length, 2)

    // 5. Check revision history
    const history = await request('GET', `/api/notes/${created.id}/history`)
    assert.equal(history.revisions.length, 3)
    assert.equal(history.revisions[1].source, 'kanban')
    assert.equal(history.revisions[2].source, 'kanban')

    // 6. Check discrete delta suite stored in revision 2
    const rev2 = await request('GET', `/api/notes/${created.id}/history/${history.revisions[1].id}`)
    const rev2Data = JSON.parse(rev2.content)
    assert.equal(rev2Data.type, 'kanban_delta_suite')
    assert.equal(rev2Data.actions.length, 1)
    assert.equal(rev2Data.actions[0].type, 'card_added')

    // 7. Test FTS keyword search finds kanban note by card title or description
    const searchRes = await request('GET', '/api/search?q=Kubernetes')
    assert.ok(Array.isArray(searchRes) && searchRes.includes(created.id), 'Search finds kanban board by card title')

    const searchResDesc = await request('GET', '/api/search?q=cert-manager')
    assert.ok(Array.isArray(searchResDesc) && searchResDesc.includes(created.id), 'Search finds kanban board by card description')

    // 8. Test properties/tags on kanban note
    const tagged = await request('PATCH', `/api/notes/${created.id}/properties`, {
      set: { tags: ['devops/infra', 'sprint'] }
    })
    assert.deepEqual(tagged.tags, ['devops/infra', 'sprint'])
    const fetchedTagged = await request('GET', `/api/notes/${created.id}`)
    assert.deepEqual(fetchedTagged.tags, ['devops/infra', 'sprint'])

    // 9. Move card after tagging
    const res3 = await request('PUT', `/api/notes/${created.id}/kanban`, {
      actions: [
        { type: 'card_moved', cardId: 'card_task_1', toColumnId: 'col_done', order: 1000 }
      ]
    })
    assert.equal(res3.note.tags.length, 2)
    const c1Done = res3.board.cards.find(c => c.id === 'card_task_1')
    assert.equal(c1Done.columnId, 'col_done')

    // 10. Restore earlier revision (e.g. revision 2 where card_task_1 is still in col_todo and card_task_2 does not exist)
    const restored = await request('POST', `/api/notes/${created.id}/history/${history.revisions[1].id}/restore`)
    const restoredBoard = JSON.parse(restored.content.replace(/^---[\s\S]*?---\n*/, ''))
    assert.equal(restoredBoard.cards.length, 1)
    assert.equal(restoredBoard.cards[0].id, 'card_task_1')
    assert.equal(restoredBoard.cards[0].columnId, 'col_todo')
  } finally {
    await server.stop()
  }
})
