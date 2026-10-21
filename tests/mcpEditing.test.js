import test from 'node:test'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
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

function jsonResult(result) {
  const block = result.content?.find(c => c.type === 'text')
  return block ? JSON.parse(block.text) : null
}

async function connectAgent(baseUrl, token, name) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const client = new Client({ name, version: '1.0.0' })
  await client.connect(transport)
  return client
}

test('MCP open-note session switches tools and edits the shared draft', async () => {
  const server = await startTestServer()
  let clientA
  let clientB
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)
    const tokenA = (await request('POST', '/api/mcp/tokens', { name: 'Agent A' })).token
    const tokenB = (await request('POST', '/api/mcp/tokens', { name: 'Agent B' })).token

    clientA = await connectAgent(server.baseUrl, tokenA, 'agent-a')
    clientB = await connectAgent(server.baseUrl, tokenB, 'agent-b')

    const note = jsonResult(await clientA.callTool({
      name: 'create_note',
      arguments: { title: 'Draft', content: 'hello' }
    })).note

    const closedTools = (await clientA.listTools()).tools.map(tool => tool.name)
    assert.ok(closedTools.includes('edit_note'))
    assert.ok(closedTools.includes('append_to_note'))
    assert.equal(closedTools.includes('read_open_note'), false)

    const opened = jsonResult(await clientA.callTool({
      name: 'edit_note',
      arguments: { note_id: note.id, mode: 'open' }
    }))
    assert.ok(opened.session_id)
    assert.equal(opened.note_id, note.id)
    assert.equal(opened.content, 'hello')
    assert.equal(opened.tools_changed, true)

    const openTools = (await clientA.listTools()).tools.map(tool => tool.name)
    for (const name of [
      'read_open_note',
      'replace_open_note',
      'insert_open_note',
      'delete_open_note',
      'append_open_note',
      'set_open_note_title',
      'save_open_note',
      'close_open_note'
    ]) {
      assert.ok(openTools.includes(name), `missing open tool ${name}`)
    }
    assert.equal(openTools.includes('edit_note'), false)
    assert.equal(openTools.includes('append_to_note'), false)

    const read = jsonResult(await clientA.callTool({
      name: 'read_open_note',
      arguments: { session_id: opened.session_id }
    }))
    assert.equal(read.content, 'hello')
    assert.ok(read.version)

    const replaced = jsonResult(await clientA.callTool({
      name: 'replace_open_note',
      arguments: {
        session_id: opened.session_id,
        old_text: 'hello',
        new_text: 'hello from A',
        expected_version: read.version
      }
    }))
    assert.equal(replaced.content, 'hello from A')

    const inserted = jsonResult(await clientA.callTool({
      name: 'insert_open_note',
      arguments: {
        session_id: opened.session_id,
        line: 2,
        text: 'second line',
        expected_version: replaced.version
      }
    }))
    assert.match(inserted.content, /hello from A\nsecond line/)

    const appended = jsonResult(await clientA.callTool({
      name: 'append_open_note',
      arguments: {
        session_id: opened.session_id,
        text: 'tail',
        expected_version: inserted.version
      }
    }))
    assert.match(appended.content, /tail/)

    const titled = jsonResult(await clientA.callTool({
      name: 'set_open_note_title',
      arguments: {
        session_id: opened.session_id,
        title: 'Draft A',
        expected_version: appended.version
      }
    }))
    assert.equal(titled.title, 'Draft A')

    const saved = jsonResult(await clientA.callTool({
      name: 'save_open_note',
      arguments: { session_id: opened.session_id, message: 'MCP checkpoint' }
    }))
    assert.equal(saved.saved, true)
    assert.equal(saved.revision_no, 2)
    assert.equal(saved.conflict, false)
    assert.ok(saved.version)

    // A second MCP client may open the same note. Its edit invalidates A's
    // version, which must produce an explicit stale_version error.
    const openedB = jsonResult(await clientB.callTool({
      name: 'edit_note',
      arguments: { note_id: note.id, mode: 'open' }
    }))
    const readB = jsonResult(await clientB.callTool({
      name: 'read_open_note',
      arguments: { session_id: openedB.session_id }
    }))
    jsonResult(await clientB.callTool({
      name: 'append_open_note',
      arguments: {
        session_id: openedB.session_id,
        text: 'from B',
        expected_version: readB.version
      }
    }))

    const stale = await clientA.callTool({
      name: 'replace_open_note',
      arguments: {
        session_id: opened.session_id,
        old_text: 'tail',
        new_text: 'tail A',
        expected_version: saved.version
      }
    })
    const stalePayload = jsonResult(stale)
    assert.equal(stale.isError, true)
    assert.equal(stalePayload.code, 'stale_version')
    assert.match(stalePayload.content, /from B/)

    const closedA = jsonResult(await clientA.callTool({
      name: 'close_open_note',
      arguments: { session_id: opened.session_id }
    }))
    assert.equal(closedA.closed, true)
    const closedToolsAgain = (await clientA.listTools()).tools.map(tool => tool.name)
    assert.ok(closedToolsAgain.includes('edit_note'))
    assert.equal(closedToolsAgain.includes('read_open_note'), false)

    const closedB = jsonResult(await clientB.callTool({
      name: 'close_open_note',
      arguments: { session_id: openedB.session_id, discard: true }
    }))
    assert.equal(closedB.closed, true)

    // A one-shot edit still works after closing.
    const oneshot = jsonResult(await clientA.callTool({
      name: 'edit_note',
      arguments: {
        note_id: note.id,
        content: 'final content',
        commit_mode: 'append'
      }
    }))
    assert.equal(oneshot.conflict, false)
    assert.equal(oneshot.note.content, 'final content')
  } finally {
    if (clientA) await clientA.close().catch(() => {})
    if (clientB) await clientB.close().catch(() => {})
    await server.stop()
  }
})

test('MCP open-note sessions participate in dashboard presence', async () => {
  const server = await startTestServer()
  let client
  let ws
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)
    const token = (await request('POST', '/api/mcp/tokens', { name: 'Presence Agent' })).token
    const note = await request('POST', '/api/notes', { title: 'Presence', content: 'hello' })

    client = await connectAgent(server.baseUrl, token, 'presence-agent')
    ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${sessionToken}`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })

    const presenceOpen = waitForMessage(
      ws,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 1
    )
    const opened = jsonResult(await client.callTool({
      name: 'edit_note',
      arguments: { note_id: note.id, mode: 'open' }
    }))
    const presence = await presenceOpen
    assert.equal(presence.users.some(user => user.username.includes('Presence Agent')), true)

    const presenceClosed = waitForMessage(
      ws,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 0
    )
    await client.callTool({
      name: 'close_open_note',
      arguments: { session_id: opened.session_id }
    })
    await presenceClosed
  } finally {
    if (ws) ws.close()
    if (client) await client.close().catch(() => {})
    await server.stop()
  }
})

test('MCP edit leases enforce one note per client and expire', async () => {
  const { createFreshContext } = await import('./helpers/testDb.js')
  const { createTextCollabService } = await import('../src/server/services/textCollab.js')
  const { createMcpEditingService } = await import('../src/server/services/mcpEditing.js')
  const ctx = createFreshContext()
  try {
    const first = ctx.notes.createNote({ title: 'First', content: 'one' })
    const second = ctx.notes.createNote({ title: 'Second', content: 'two' })
    const textCollab = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    let closed = 0
    const editing = createMcpEditingService({
      db: ctx.db,
      notes: ctx.notes,
      textCollab,
      ttlMs: 1000,
      onClose() { closed += 1; return { discarded: false, remaining: 0 } }
    })

    const opened = editing.open({ clientKey: 'mcp:one', noteId: first.id, actor: 'mcp:one' })
    assert.ok(opened.session.session_id)
    const again = editing.open({ clientKey: 'mcp:one', noteId: first.id, actor: 'mcp:one' })
    assert.equal(again.session.session_id, opened.session.session_id)

    assert.throws(
      () => editing.open({ clientKey: 'mcp:one', noteId: second.id, actor: 'mcp:one' }),
      error => error.code === 'already_open' && error.data.open_note_id === first.id
    )

    editing.close({ clientKey: 'mcp:one', sessionId: opened.session.session_id })
    assert.equal(closed, 1)

    const reopened = editing.open({ clientKey: 'mcp:one', noteId: first.id, actor: 'mcp:one' })
    await new Promise(resolve => setTimeout(resolve, 1150))
    assert.equal(editing.get('mcp:one'), null)
    assert.equal(closed, 2)
    assert.ok(reopened.session.session_id)
  } finally {
    ctx.cleanup()
  }
})
