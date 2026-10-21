import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { startTestServer } from './helpers/serverProcess.js'
import { base64ToBytes } from '../src/shared/base64.js'

function waitForMessage(ws, predicate, timeoutMs = 15000, label = 'message') {
  const seen = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting for ${label}; seen=${JSON.stringify(seen)}`))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      ws.off('message', onMessage)
      ws.off('error', onError)
    }
    function onMessage(raw) {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch (_) { return }
      seen.push({ type: msg.type, noteId: msg.noteId, count: msg.count })
      if (seen.length > 20) seen.shift()
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

async function openSocket(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`)
  // Attach the message listener before awaiting `open`: the server can send
  // the initial `notes` message immediately after the handshake, and waiting
  // for `open` first can miss it under load.
  const notes = waitForMessage(ws, msg => msg.type === 'notes', 15000, 'initial notes')
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  await notes
  return ws
}

test('two clients share a live text draft and presence updates', async () => {
  const server = await startTestServer()
  let wsA
  let wsB
  try {
    const token = await server.setupAuth()
    const request = server.client(token)
    const note = await request('POST', '/api/notes', {
      title: 'Shared',
      content: 'hello'
    })

    wsA = await openSocket(server.port, token)
    wsB = await openSocket(server.port, token)

    const presenceOne = waitForMessage(
      wsB,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 1,
      15000,
      'presence count 1 on wsB'
    )
    const snapshotA = waitForMessage(
      wsA,
      msg => msg.type === 'text-snapshot' && msg.noteId === note.id,
      15000,
      'text snapshot on wsA'
    )
    wsA.send(JSON.stringify({ type: 'text-join', noteId: note.id }))
    await presenceOne
    const first = await snapshotA

    const presenceTwo = waitForMessage(
      wsA,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 2,
      15000,
      'presence count 2 on wsA'
    )
    const snapshotB = waitForMessage(
      wsB,
      msg => msg.type === 'text-snapshot' && msg.noteId === note.id,
      15000,
      'text snapshot on wsB'
    )
    wsB.send(JSON.stringify({ type: 'text-join', noteId: note.id }))
    await presenceTwo
    const second = await snapshotB

    const docA = new Y.Doc()
    Y.applyUpdate(docA, base64ToBytes(first.update))
    const docB = new Y.Doc()
    Y.applyUpdate(docB, base64ToBytes(second.update))

    docA.getText('content').insert(0, 'A')
    const updateFromA = Y.encodeStateAsUpdate(docA, base64ToBytes(first.stateVector))
    const receivedByB = waitForMessage(
      wsB,
      msg => msg.type === 'text-update' && msg.noteId === note.id,
      15000,
      'text update on wsB'
    )
    wsA.send(JSON.stringify({
      type: 'text-update',
      noteId: note.id,
      update: Buffer.from(updateFromA).toString('base64')
    }))
    const updateForB = await receivedByB
    Y.applyUpdate(docB, base64ToBytes(updateForB.update), 'remote')
    assert.equal(docB.getText('content').toString(), 'Ahello')

    docB.getText('content').insert(docB.getText('content').length, 'B')
    const updateFromB = Y.encodeStateAsUpdate(docB, base64ToBytes(second.stateVector))
    const receivedByA = waitForMessage(
      wsA,
      msg => msg.type === 'text-update' && msg.noteId === note.id,
      15000,
      'text update on wsA'
    )
    wsB.send(JSON.stringify({
      type: 'text-update',
      noteId: note.id,
      update: Buffer.from(updateFromB).toString('base64')
    }))
    const updateForA = await receivedByA
    Y.applyUpdate(docA, base64ToBytes(updateForA.update), 'remote')
    assert.equal(docA.getText('content').toString(), 'AhelloB')

    const savedForB = waitForMessage(
      wsB,
      msg => msg.type === 'text-saved' && msg.noteId === note.id,
      15000,
      'text saved on wsB'
    )
    const saved = await request('PUT', `/api/notes/${note.id}`, {
      title: 'Shared',
      content: 'AhelloB',
      baseRevisionId: note.revisionId,
      mode: 'append'
    })
    const textSaved = await savedForB
    assert.equal(saved.revisionNo, 2)
    assert.equal(textSaved.baseRevisionId, saved.revisionId)
    assert.equal(textSaved.revisionNo, 2)
    assert.equal(textSaved.content, 'AhelloB')

    const presenceAfterLeave = waitForMessage(
      wsA,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 1,
      15000,
      'presence count 1 after leave'
    )
    wsB.send(JSON.stringify({ type: 'text-leave', noteId: note.id }))
    await presenceAfterLeave
  } finally {
    if (wsA) wsA.close()
    if (wsB) wsB.close()
    await server.stop()
  }
})
