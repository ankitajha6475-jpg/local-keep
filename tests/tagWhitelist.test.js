import test from 'node:test'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { startTestServer } from './helpers/serverProcess.js'

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

async function rawRequest(baseUrl, method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Auth-Token'] = token
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch (_) { data = text }
  return { status: res.status, ok: res.ok, data }
}

test('Tag whitelist enforces note boundaries across REST and MCP for users and tokens', async () => {
  const server = await startTestServer()
  let adminClient
  let restrictedClient
  try {
    const adminSessionToken = await server.setupAuth()
    const adminReq = server.client(adminSessionToken)

    // Admin creates an admin MCP token
    const adminMcpCreated = await adminReq('POST', '/api/mcp/tokens', { name: 'Admin MCP Token' })
    assert.ok(adminMcpCreated.token)

    // Admin creates notes with different tag configurations
    // 1. Untagged note
    const untaggedNote = await adminReq('POST', '/api/notes', {
      title: 'Untagged Note',
      content: 'This note has no tags'
    })
    // 2. Allowed work tag
    const workDocNote = await adminReq('POST', '/api/notes', {
      title: 'Work Docs',
      content: '---\ntags:\n  - work/docs\n---\nDocumentation for work'
    })
    // 3. Personal tag
    const personalNote = await adminReq('POST', '/api/notes', {
      title: 'Personal Note',
      content: '---\ntags:\n  - personal\n---\nMy secret grocery list'
    })
    // 4. Multi-tag with work and forbidden tag
    const secretWorkNote = await adminReq('POST', '/api/notes', {
      title: 'Secret Work Note',
      content: '---\ntags:\n  - work/docs\n  - work/secret\n---\nClassified work'
    })

    // Admin creates a restricted member user with tagWhitelist
    const newUserRes = await adminReq('POST', '/api/users', {
      username: 'bob',
      displayName: 'Bob Restricted',
      password: 'bob-password-123',
      role: 'member',
      tagWhitelist: 'work/*\n!:untagged\n!work/secret'
    })
    assert.equal(newUserRes.user.username, 'bob')
    assert.equal(newUserRes.user.tagWhitelist, 'work/*\n!:untagged\n!work/secret')

    // Bob signs in
    const loginRes = await rawRequest(server.baseUrl, 'POST', '/api/password/verify', {
      body: {
        username: 'bob',
        password: 'bob-password-123'
      }
    })
    assert.equal(loginRes.status, 200)
    const bobSessionToken = loginRes.data.token

    // Bob changes temporary password
    const changePwRes = await rawRequest(server.baseUrl, 'POST', '/api/auth/change-password', {
      token: bobSessionToken,
      body: {
        currentPassword: 'bob-password-123',
        newPassword: 'bob-new-password-456'
      }
    })
    assert.equal(changePwRes.status, 200)

    const bobReq = server.client(bobSessionToken)

    // Bob lists notes index -> should only see workDocNote
    const bobIndex = await bobReq('GET', '/api/notes/index')
    const bobNoteIds = bobIndex.map(n => n.id)
    assert.ok(bobNoteIds.includes(workDocNote.id), 'Bob should see work/docs')
    assert.ok(!bobNoteIds.includes(untaggedNote.id), 'Bob should not see untagged note')
    assert.ok(!bobNoteIds.includes(personalNote.id), 'Bob should not see personal note')
    assert.ok(!bobNoteIds.includes(secretWorkNote.id), 'Bob should not see work/secret note')

    // Direct GET /api/notes/:id
    const getWork = await rawRequest(server.baseUrl, 'GET', `/api/notes/${workDocNote.id}`, {
      token: bobSessionToken
    })
    assert.equal(getWork.status, 200)

    const getUntagged = await rawRequest(server.baseUrl, 'GET', `/api/notes/${untaggedNote.id}`, {
      token: bobSessionToken
    })
    assert.equal(getUntagged.status, 404)

    const getPersonal = await rawRequest(server.baseUrl, 'GET', `/api/notes/${personalNote.id}`, {
      token: bobSessionToken
    })
    assert.equal(getPersonal.status, 404)

    const getSecretWork = await rawRequest(server.baseUrl, 'GET', `/api/notes/${secretWorkNote.id}`, {
      token: bobSessionToken
    })
    assert.equal(getSecretWork.status, 404)

    // Bob attempts to create an untagged note -> rejected (403 tag_whitelist_violation)
    const createUntagged = await rawRequest(server.baseUrl, 'POST', '/api/notes', {
      token: bobSessionToken,
      body: { title: 'Bob untagged', content: 'No tags here' }
    })
    assert.equal(createUntagged.status, 403)
    assert.equal(createUntagged.data.code, 'tag_whitelist_violation')

    // Bob creates an allowed note tagged #work/tickets
    const createAllowed = await rawRequest(server.baseUrl, 'POST', '/api/notes', {
      token: bobSessionToken,
      body: {
        title: 'Bob Tickets',
        content: '---\ntags:\n  - work/tickets\n---\nTickets list'
      }
    })
    assert.equal(createAllowed.status, 200)
    assert.ok(createAllowed.data.id)

    // Bob creates an API token for MCP
    const bobTokenRes = await bobReq('POST', '/api/mcp/tokens', {
      name: 'Bob Agent',
      scopes: ['read', 'write']
    })
    assert.ok(bobTokenRes.token)
    assert.equal(bobTokenRes.record.userId, newUserRes.user.id)

    // Bob tries to revoke admin's token -> 403 forbidden
    const revokeAdminToken = await rawRequest(server.baseUrl, 'DELETE', `/api/mcp/tokens/${adminMcpCreated.record.id}`, {
      token: bobSessionToken
    })
    assert.equal(revokeAdminToken.status, 403)

    // Bob connects MCP client
    restrictedClient = await connectAgent(server.baseUrl, bobTokenRes.token, 'bob-agent')

    // MCP search_notes
    const searchRes = jsonResult(await restrictedClient.callTool({
      name: 'search_notes',
      arguments: { query: '' }
    }))
    const searchIds = searchRes.results.map(r => r.note_id)
    assert.ok(searchIds.includes(workDocNote.id))
    assert.ok(searchIds.includes(createAllowed.data.id))
    assert.ok(!searchIds.includes(untaggedNote.id))
    assert.ok(!searchIds.includes(personalNote.id))
    assert.ok(!searchIds.includes(secretWorkNote.id))

    // MCP get_note on disallowed note
    const getDisallowedMcp = await restrictedClient.callTool({
      name: 'get_note',
      arguments: { note_id: personalNote.id }
    })
    assert.ok(getDisallowedMcp.isError)

    // MCP get_note on allowed note
    const getAllowedMcpRes = await restrictedClient.callTool({
      name: 'get_note',
      arguments: { note_id: workDocNote.id }
    })
    assert.equal(getAllowedMcpRes.isError, undefined)
    const getAllowedMcp = jsonResult(getAllowedMcpRes)
    assert.equal(getAllowedMcp.note.id, workDocNote.id)

    // MCP create_note with disallowed tag
    const createDisallowedMcp = await restrictedClient.callTool({
      name: 'create_note',
      arguments: { title: 'Disallowed MCP', content: 'Untagged content' }
    })
    assert.ok(createDisallowedMcp.isError)

    // MCP create_note with allowed tag
    const createAllowedMcpRes = await restrictedClient.callTool({
      name: 'create_note',
      arguments: {
        title: 'Allowed MCP',
        content: 'Allowed MCP note',
        tags: ['work/mcp']
      }
    })
    assert.equal(createAllowedMcpRes.isError, undefined)
    const createAllowedMcp = jsonResult(createAllowedMcpRes)
    assert.ok(createAllowedMcp.note.id)

    // Admin can revoke Bob's token
    const adminRevoke = await adminReq('DELETE', `/api/mcp/tokens/${bobTokenRes.record.id}`)
    assert.equal(adminRevoke.success, true)
  } finally {
    if (adminClient) try { await adminClient.close() } catch (_) {}
    if (restrictedClient) try { await restrictedClient.close() } catch (_) {}
    await server.stop()
  }
})
