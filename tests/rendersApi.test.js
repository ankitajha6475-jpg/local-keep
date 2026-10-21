import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { startTestServer } from './helpers/serverProcess.js'

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    function onMessage(raw) {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch (_) { return }
      if (predicate(msg)) { cleanup(); resolve(msg) }
    }
    function onError(error) { cleanup(); reject(error) }
    ws.on('message', onMessage)
    ws.on('error', onError)
  })
}

test('render manifest API, staleness, and on-demand request over WS', async () => {
  const server = await startTestServer()
  let ws
  try {
    const token = await server.setupAuth()
    const request = server.client(token)
    const canvasData = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
      files: {}
    })
    const note = await request('POST', '/api/notes', {
      type: 'canvas',
      title: 'Board',
      canvasData
    })

    const hash = 'abcdef0123456789'
    const saved = await request('PUT', `/api/notes/${note.id}/renders`, {
      tiles: [{ pageIndex: 0, hash, ext: 'png', width: 100, height: 50, bbox: [0, 0, 100, 50], elementIds: ['e1'] }]
    })
    assert.equal(saved.tileCount, 1)
    assert.equal(saved.stale, false)
    assert.equal(saved.tiles[0].url, `/api/images/${hash}.png`)

    const changed = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 200, y: 0, width: 100, height: 50 }],
      files: {}
    })
    await request('PUT', `/api/notes/${note.id}`, {
      title: 'Board',
      content: '',
      type: 'canvas',
      canvasData: changed,
      baseRevisionId: note.revisionId
    })
    const stale = await request('GET', `/api/notes/${note.id}/renders/latest`)
    assert.equal(stale.stale, true)

    // No browser session yet -> request is accepted but not delivered.
    const noClient = await request('POST', `/api/notes/${note.id}/renders/request`)
    assert.equal(noClient.requested, false)
    assert.equal(noClient.reason, 'no-client')

    // Join a browser-like session, then trigger an on-demand request.
    ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${token}`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    const snapshotPromise = waitForMessage(ws, msg => msg.type === 'snapshot' && msg.noteId === note.id)
    ws.send(JSON.stringify({ type: 'join', noteId: note.id }))
    await snapshotPromise

    const renderRequestPromise = waitForMessage(ws, msg => msg.type === 'render-request' && msg.noteId === note.id)
    const requested = await request('POST', `/api/notes/${note.id}/renders/request`)
    assert.equal(requested.requested, true)
    const renderRequest = await renderRequestPromise
    assert.ok(renderRequest.requestId)

    const completePromise = waitForMessage(ws, msg => msg.type === 'render-complete' && msg.requestId === renderRequest.requestId)
    const refreshed = await request('PUT', `/api/notes/${note.id}/renders`, {
      requestId: renderRequest.requestId,
      tiles: [{ pageIndex: 0, hash: '2222222222222222', ext: 'png', width: 100, height: 50 }]
    })
    assert.equal(refreshed.stale, false)
    await completePromise
  } finally {
    if (ws) ws.close()
    await server.stop()
  }
})
