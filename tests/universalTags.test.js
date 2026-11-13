import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

test('universal tags: all note types support properties tags, autocomplete, and whitelist enforcement', async () => {
  const server = await startTestServer()
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    // 1. Create one note of each type
    const textNote = await request('POST', '/api/notes', {
      title: 'Text Note 1',
      content: 'Hello world',
      type: 'text'
    })

    const canvasNote = await request('POST', '/api/notes', {
      title: 'Canvas Note 1',
      type: 'canvas'
    })

    const chatNote = await request('POST', '/api/notes', {
      title: 'Chat Room 1',
      type: 'chat'
    })

    const kanbanNote = await request('POST', '/api/notes', {
      title: 'Kanban Board 1',
      type: 'kanban'
    })

    // 2. Add tags to all four note types via PATCH /api/notes/:id/properties
    const taggedText = await request('PATCH', `/api/notes/${textNote.id}/properties`, {
      set: { tags: ['project/alpha', 'work'] }
    })
    assert.deepEqual([...taggedText.tags].sort(), ['project/alpha', 'work'].sort())

    const taggedCanvas = await request('PATCH', `/api/notes/${canvasNote.id}/properties`, {
      set: { tags: ['project/design', 'whiteboard'] }
    })
    assert.deepEqual([...taggedCanvas.tags].sort(), ['project/design', 'whiteboard'].sort())

    const taggedChat = await request('PATCH', `/api/notes/${chatNote.id}/properties`, {
      set: { tags: ['project/alpha', 'discussion'] }
    })
    assert.deepEqual([...taggedChat.tags].sort(), ['discussion', 'project/alpha'].sort())

    const taggedKanban = await request('PATCH', `/api/notes/${kanbanNote.id}/properties`, {
      set: { tags: ['project/beta', 'tasks'] }
    })
    assert.deepEqual([...taggedKanban.tags].sort(), ['project/beta', 'tasks'].sort())

    // 3. Verify getNote on each preserves tags
    const getC = await request('GET', `/api/notes/${canvasNote.id}`)
    assert.deepEqual([...getC.tags].sort(), ['project/design', 'whiteboard'].sort())

    const getCh = await request('GET', `/api/notes/${chatNote.id}`)
    assert.deepEqual([...getCh.tags].sort(), ['discussion', 'project/alpha'].sort())

    const getK = await request('GET', `/api/notes/${kanbanNote.id}`)
    assert.deepEqual([...getK.tags].sort(), ['project/beta', 'tasks'].sort())

    // 4. Verify tag filtering on GET /api/search?tag=project/alpha returns both text and chat notes
    const alphaNotes = await request('GET', '/api/search?tag=project/alpha')
    assert.ok(alphaNotes.includes(textNote.id), 'Finds tagged text note')
    assert.ok(alphaNotes.includes(chatNote.id), 'Finds tagged chat note')
    assert.ok(!alphaNotes.includes(kanbanNote.id), 'Does not include beta kanban note')

    // 5. Test color changes on all note types without creating revisions
    const initialCanvasRev = getC.revisionNo
    const colorCanvas = await request('PUT', `/api/notes/${canvasNote.id}/color`, { color: 'blue' })
    assert.equal(colorCanvas.color, 'blue')
    assert.equal(colorCanvas.revisionNo, initialCanvasRev)

    const initialChatRev = getCh.revisionNo
    const colorChat = await request('PUT', `/api/notes/${chatNote.id}/color`, { color: 'rose' })
    assert.equal(colorChat.color, 'rose')
    assert.equal(colorChat.revisionNo, initialChatRev)

    const initialKanbanRev = getK.revisionNo
    const colorKanban = await request('PUT', `/api/notes/${kanbanNote.id}/color`, { color: 'amber' })
    assert.equal(colorKanban.color, 'amber')
    assert.equal(colorKanban.revisionNo, initialKanbanRev)
  } finally {
    await server.stop()
  }
})
