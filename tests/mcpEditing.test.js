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

function toolNames(result) {
  return result.tools.map(tool => tool.name).sort()
}

test('MCP sessions use stable tools, explicit state, multiple writes, and reads', async () => {
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
    const other = jsonResult(await clientA.callTool({
      name: 'create_note',
      arguments: { title: 'Other', content: 'other body' }
    })).note

    const beforeTools = toolNames(await clientA.listTools())
    for (const name of ['get_note_state', 'note_session', 'edit_note', 'append_to_note']) {
      assert.ok(beforeTools.includes(name), `missing stable tool ${name}`)
    }
    assert.equal(beforeTools.includes('read_open_note'), false)

    const initial = jsonResult(await clientA.callTool({ name: 'get_note_state', arguments: {} }))
    assert.equal(initial.state.write, null)
    assert.deepEqual(initial.state.writes, [])
    assert.deepEqual(initial.state.reads, [])
    assert.equal(initial.state.limits.max_write_sessions, 5)
    assert.equal(initial.state.limits.max_read_sessions, 8)
    assert.ok(initial.guide)

    const opened = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: note.id }
    }))
    assert.ok(opened.session.session_id)
    assert.equal(opened.session.mode, 'write')
    assert.equal(opened.session.note_id, note.id)
    assert.equal(opened.snapshot.content, 'hello')
    assert.equal(opened.state.write.session_id, opened.session.session_id)
    assert.match(opened.guide, /Write session/i)

    const afterTools = toolNames(await clientA.listTools())
    assert.deepEqual(afterTools, beforeTools, 'tool list must stay stable while a session is open')

    const oneShotWhileOpen = await clientA.callTool({
      name: 'edit_note',
      arguments: { note_id: note.id, content: 'should not be written' }
    })
    const oneShotWhileOpenPayload = jsonResult(oneShotWhileOpen)
    assert.equal(oneShotWhileOpen.isError, true)
    assert.equal(oneShotWhileOpenPayload.error.code, 'active_write_session')

    const secondWrite = await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: other.id }
    })
    const secondWritePayload = jsonResult(secondWrite)
    assert.equal(secondWrite.isError, undefined)
    assert.equal(secondWritePayload.session.note_id, other.id)
    assert.equal(secondWritePayload.state.write.note_id, note.id)
    assert.equal(secondWritePayload.state.writes.length, 2)
    assert.match(secondWritePayload.guide, /Write sessions open/i)

    const closedSecond = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: secondWritePayload.session.session_id, discard: true }
    }))
    assert.equal(closedSecond.state.writes.length, 1)

    const readOther = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'open_read', note_id: other.id }
    }))
    assert.equal(readOther.session.mode, 'read')
    assert.equal(readOther.state.reads.length, 1)

    const readEdit = await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'replace',
        session_id: readOther.session.session_id,
        old_text: 'other body',
        new_text: 'changed'
      }
    })
    const readEditPayload = jsonResult(readEdit)
    assert.equal(readEdit.isError, true)
    assert.equal(readEditPayload.error.code, 'session_mode_mismatch')
    assert.match(readEditPayload.guide, /open_write/i)

    const closedFirst = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: opened.session.session_id, discard: true }
    }))
    assert.equal(closedFirst.state.write, null)

    const upgraded = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: other.id }
    }))
    assert.equal(upgraded.upgraded_from_read, true)
    assert.equal(upgraded.state.write.note_id, other.id)
    assert.equal(upgraded.state.reads.length, 0)

    const closedOther = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: upgraded.session.session_id, discard: true }
    }))
    assert.equal(closedOther.closed, true)
    assert.equal(closedOther.state.write, null)

    const reopened = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: note.id }
    }))
    const sessionId = reopened.session.session_id
    const read = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'read', session_id: sessionId }
    }))
    assert.equal(read.content, 'hello')
    assert.ok(read.version)

    const replaced = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'replace',
        session_id: sessionId,
        old_text: 'hello',
        new_text: 'hello from A',
        expected_version: read.version
      }
    }))
    assert.equal(replaced.content, 'hello from A')
    assert.equal(replaced.dirty, true)

    const inserted = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'insert',
        session_id: sessionId,
        line: 2,
        text: 'second line',
        expected_version: replaced.version
      }
    }))
    assert.match(inserted.content, /hello from A\nsecond line/)

    const appended = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'append',
        session_id: sessionId,
        text: 'tail',
        expected_version: inserted.version
      }
    }))
    assert.match(appended.content, /tail/)

    const titled = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'set_title',
        session_id: sessionId,
        title: 'Draft A',
        expected_version: appended.version
      }
    }))
    assert.equal(titled.title, 'Draft A')

    const saved = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'save', session_id: sessionId, message: 'MCP checkpoint' }
    }))
    assert.equal(saved.saved, true)
    assert.equal(saved.revision_no, 2)
    assert.equal(saved.conflict, false)
    assert.ok(saved.version)

    // Another token may write the same note; A's version must be rejected.
    const openedB = jsonResult(await clientB.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: note.id }
    }))
    const readB = jsonResult(await clientB.callTool({
      name: 'note_session',
      arguments: { action: 'read', session_id: openedB.session.session_id }
    }))
    jsonResult(await clientB.callTool({
      name: 'note_session',
      arguments: {
        action: 'append',
        session_id: openedB.session.session_id,
        text: 'from B',
        expected_version: readB.version
      }
    }))

    const stale = await clientA.callTool({
      name: 'note_session',
      arguments: {
        action: 'replace',
        session_id: sessionId,
        old_text: 'tail',
        new_text: 'tail A',
        expected_version: saved.version
      }
    })
    const stalePayload = jsonResult(stale)
    assert.equal(stale.isError, true)
    assert.equal(stalePayload.error.code, 'stale_version')
    assert.match(stalePayload.error.content, /from B/)

    const closedA = jsonResult(await clientA.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: sessionId }
    }))
    assert.equal(closedA.closed, true)

    const closedB = jsonResult(await clientB.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: openedB.session.session_id, discard: true }
    }))
    assert.equal(closedB.closed, true)

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

test('read-only MCP tokens can read but cannot open a write session', async () => {
  const server = await startTestServer()
  let client
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)
    const readToken = (await request('POST', '/api/mcp/tokens', {
      name: 'Reader',
      scopes: ['read']
    })).token
    const note = await request('POST', '/api/notes', { title: 'Read only', content: 'body' })

    client = await connectAgent(server.baseUrl, readToken, 'reader')
    const read = jsonResult(await client.callTool({
      name: 'note_session',
      arguments: { action: 'open_read', note_id: note.id }
    }))
    assert.equal(read.session.mode, 'read')

    const write = await client.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: note.id }
    })
    const writePayload = jsonResult(write)
    assert.equal(write.isError, true)
    assert.equal(writePayload.error.code, 'forbidden')

    const edit = await client.callTool({
      name: 'note_session',
      arguments: {
        action: 'replace',
        session_id: read.session.session_id,
        old_text: 'body',
        new_text: 'changed'
      }
    })
    const editPayload = jsonResult(edit)
    assert.equal(edit.isError, true)
    assert.equal(editPayload.error.code, 'forbidden')

    const closed = jsonResult(await client.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: read.session.session_id }
    }))
    assert.equal(closed.closed, true)
  } finally {
    if (client) await client.close().catch(() => {})
    await server.stop()
  }
})

test('MCP sessions participate in dashboard presence', async () => {
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
      name: 'note_session',
      arguments: { action: 'open_write', note_id: note.id }
    }))
    const presence = await presenceOpen
    assert.equal(presence.users.some(user => user.username.includes('Presence Agent')), true)

    const presenceClosed = waitForMessage(
      ws,
      msg => msg.type === 'presence' && msg.noteId === note.id && msg.count === 0
    )
    await client.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: opened.session.session_id }
    })
    await presenceClosed
  } finally {
    if (ws) ws.close()
    if (client) await client.close().catch(() => {})
    await server.stop()
  }
})

test('MCP session state enforces one write, multiple reads, upgrade, close, and TTL', async () => {
  const { createFreshContext } = await import('./helpers/testDb.js')
  const { createTextCollabService } = await import('../src/server/services/textCollab.js')
  const { createMcpEditingService } = await import('../src/server/services/mcpEditing.js')
  const ctx = createFreshContext()
  try {
    const first = ctx.notes.createNote({ title: 'First', content: 'one' })
    const second = ctx.notes.createNote({ title: 'Second', content: 'two' })
    const third = ctx.notes.createNote({ title: 'Third', content: 'three' })
    const fourth = ctx.notes.createNote({ title: 'Fourth', content: 'four' })
    const textCollab = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    let closed = 0
    const editing = createMcpEditingService({
      db: ctx.db,
      notes: ctx.notes,
      revisions: ctx.revisions,
      textCollab,
      ttlMs: 1000,
      maxWrites: 1,
      maxReads: 2,
      onClose() { closed += 1; return { discarded: false, remaining: 0 } }
    })

    const write = editing.open({ clientKey: 'token:one', noteId: first.id, actor: 'mcp:one' })
    assert.equal(write.session.mode, 'write')
    const readSecond = editing.open({ clientKey: 'token:one', noteId: second.id, mode: 'read', actor: 'mcp:one' })
    assert.equal(readSecond.session.mode, 'read')
    const readThird = editing.open({ clientKey: 'token:one', noteId: third.id, mode: 'read', actor: 'mcp:one' })
    assert.equal(readThird.session.mode, 'read')
    assert.equal(editing.getState('token:one').reads.length, 2)

    assert.throws(
      () => editing.open({ clientKey: 'token:one', noteId: fourth.id, mode: 'read', actor: 'mcp:one' }),
      error => error.code === 'too_many_reads'
    )

    editing.close({ clientKey: 'token:one', sessionId: write.session.session_id, discard: true })
    const upgrade = editing.open({ clientKey: 'token:one', noteId: second.id, actor: 'mcp:one' })
    assert.equal(upgrade.upgraded_from_read, true)
    assert.equal(editing.getState('token:one').write.note_id, second.id)
    assert.equal(editing.getState('token:one').reads.length, 1)

    assert.throws(
      () => editing.open({ clientKey: 'token:one', noteId: first.id, actor: 'mcp:one' }),
      error => error.code === 'too_many_writes' && error.data.max_write_sessions === 1
    )

    editing.close({ clientKey: 'token:one', sessionId: upgrade.session.session_id, discard: true })
    assert.equal(editing.getState('token:one').write, null)

    const reopened = editing.open({ clientKey: 'token:one', noteId: first.id, actor: 'mcp:one' })
    const tokenTwo = editing.open({ clientKey: 'token:two', noteId: second.id, mode: 'read', actor: 'mcp:two' })
    assert.equal(editing.getState('token:two').reads.length, 1)
    editing.closeForToken('token:two')
    const emptyTwo = editing.getState('token:two')
    assert.equal(emptyTwo.write, null)
    assert.deepEqual(emptyTwo.writes, [])
    assert.deepEqual(emptyTwo.reads, [])
    assert.ok(tokenTwo.session.session_id)

    await new Promise(resolve => setTimeout(resolve, 1150))
    const emptyOne = editing.getState('token:one')
    assert.equal(emptyOne.write, null)
    assert.deepEqual(emptyOne.writes, [])
    assert.deepEqual(emptyOne.reads, [])
    assert.equal(closed >= 3, true)
    assert.ok(reopened.session.session_id)
  } finally {
    ctx.cleanup()
  }
})

test('multiple write sessions are allowed up to the configured limit', async () => {
  const { createFreshContext } = await import('./helpers/testDb.js')
  const { createTextCollabService } = await import('../src/server/services/textCollab.js')
  const { createMcpEditingService } = await import('../src/server/services/mcpEditing.js')
  const { createMcpSettingsService } = await import('../src/server/services/mcpSettings.js')
  const ctx = createFreshContext()
  try {
    const notes = Array.from({ length: 7 }, (_, index) =>
      ctx.notes.createNote({ title: `Note ${index + 1}`, content: `body ${index + 1}` })
    )
    const textCollab = createTextCollabService({ db: ctx.db, persistDelay: 10 })
    const settings = createMcpSettingsService({ db: ctx.db })
    const editing = createMcpEditingService({
      db: ctx.db,
      notes: ctx.notes,
      revisions: ctx.revisions,
      textCollab,
      getLimits: () => settings.get(),
      onClose() { return { discarded: false, remaining: 0 } }
    })

    const initial = editing.getState('token:multi')
    assert.equal(initial.limits.max_write_sessions, 5)
    assert.equal(initial.limits.max_read_sessions, 8)

    const opened = notes.slice(0, 5).map(note =>
      editing.open({ clientKey: 'token:multi', noteId: note.id, actor: 'mcp:multi' })
    )
    const state = editing.getState('token:multi')
    assert.equal(state.writes.length, 5)
    assert.equal(state.write.session_id, opened[0].session.session_id)

    assert.throws(
      () => editing.open({ clientKey: 'token:multi', noteId: notes[5].id, actor: 'mcp:multi' }),
      error => error.code === 'too_many_writes' &&
        error.data.max_write_sessions === 5 &&
        error.data.writes.length === 5
    )

    editing.close({
      clientKey: 'token:multi',
      sessionId: opened[0].session.session_id,
      discard: true
    })
    const sixth = editing.open({ clientKey: 'token:multi', noteId: notes[5].id, actor: 'mcp:multi' })
    assert.equal(sixth.session.note_id, notes[5].id)
    assert.equal(editing.getState('token:multi').writes.length, 5)

    settings.update({ maxWriteSessions: 2, maxReadSessions: 3 })
    const updated = editing.getState('token:multi')
    assert.equal(updated.limits.max_write_sessions, 2)
    assert.equal(updated.limits.max_read_sessions, 3)
    assert.throws(
      () => editing.open({ clientKey: 'token:multi', noteId: notes[6].id, actor: 'mcp:multi' }),
      error => error.code === 'too_many_writes' && error.data.max_write_sessions === 2
    )
  } finally {
    ctx.cleanup()
  }
})
