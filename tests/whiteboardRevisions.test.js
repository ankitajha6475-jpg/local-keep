import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { startTestServer } from './helpers/serverProcess.js'

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out waiting for WebSocket message'))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    function onMessage(raw) {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch (_) { return }
      if (predicate(msg)) {
        cleanup()
        resolve(msg)
      }
    }
    function onError(error) {
      cleanup()
      reject(error)
    }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

test('whiteboard delta + checkpoint creates a revision under the same note id', async () => {
  const server = await startTestServer()
  let ws
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    const note = await request('POST', '/api/notes', {
      type: 'canvas',
      title: 'Board',
      canvasData: null
    })

    ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${token}`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })

    const notesMessage = await waitForMessage(ws, msg => msg.type === 'notes')
    assert.equal(notesMessage.notes.some(n => n.id === note.id), true)

    const snapshotPromise = waitForMessage(ws, msg => msg.type === 'snapshot' && msg.noteId === note.id)
    ws.send(JSON.stringify({ type: 'join', noteId: note.id }))
    await snapshotPromise

    const revisedPromise = waitForMessage(
      ws,
      msg => msg.type === 'note-revised' && msg.noteId === note.id
    )
    const savedPromise = waitForMessage(
      ws,
      msg => msg.type === 'checkpoint-saved' && msg.noteId === note.id
    )

    ws.send(JSON.stringify({
      type: 'delta',
      noteId: note.id,
      elements: [{
        id: 'rect-1',
        type: 'rectangle',
        x: 10,
        y: 10,
        width: 100,
        height: 50,
        isDeleted: false
      }],
      files: {}
    }))
    ws.send(JSON.stringify({ type: 'checkpoint', noteId: note.id, reason: 'test' }))

    const revised = await revisedPromise
    await savedPromise
    assert.equal(revised.source, 'checkpoint')
    assert.equal(revised.noteId, note.id)

    const history = await request('GET', `/api/notes/${note.id}/history`)
    assert.equal(history.revisions.length, 2)
    assert.equal(history.revisions[1].type, 'canvas')
    assert.equal(history.revisions[1].source, 'checkpoint')
    assert.equal(history.revisions[1].parentId, history.revisions[0].id)

    const fetched = await request('GET', `/api/notes/${note.id}`)
    assert.equal(fetched.id, note.id)
    assert.equal(fetched.revisionNo, 2)
    assert.equal(JSON.parse(fetched.canvasData).elements.length, 1)
  } finally {
    if (ws) ws.close()
    await server.stop()
  }
})
