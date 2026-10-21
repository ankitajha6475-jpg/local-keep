import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

async function bearer(baseUrl, token, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch (_) { data = text }
  return { status: res.status, data }
}

test('admin tokens manage client tokens but cannot mint another admin token', async () => {
  const server = await startTestServer()
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)

    const adminCreated = await request('POST', '/api/mcp/tokens', {
      name: 'Admin Agent',
      scopes: ['read', 'write', 'admin']
    })
    assert.match(adminCreated.token, /^lk_mcp_/)
    assert.deepEqual(adminCreated.record.scopes, ['read', 'write', 'admin'])

    const adminToken = adminCreated.token
    const listed = await bearer(server.baseUrl, adminToken, 'GET', '/api/mcp/tokens')
    assert.equal(listed.status, 200)
    assert.equal(listed.data.some(token => token.name === 'Admin Agent'), true)

    const clientCreated = await bearer(server.baseUrl, adminToken, 'POST', '/api/mcp/tokens', {
      name: 'Client Agent',
      scopes: ['read', 'write']
    })
    assert.equal(clientCreated.status, 200)
    assert.deepEqual(clientCreated.data.record.scopes, ['read', 'write'])

    const forbiddenAdmin = await bearer(server.baseUrl, adminToken, 'POST', '/api/mcp/tokens', {
      name: 'Second Admin',
      scopes: ['read', 'write', 'admin']
    })
    assert.equal(forbiddenAdmin.status, 403)
    assert.equal(forbiddenAdmin.data.code, 'admin_token_requires_human')

    const clientToken = clientCreated.data.token
    const clientList = await bearer(server.baseUrl, clientToken, 'GET', '/api/mcp/tokens')
    assert.equal(clientList.status, 403)

    const adminConfig = await bearer(server.baseUrl, adminToken, 'GET', '/api/admin/embeddings')
    assert.equal(adminConfig.status, 200)

    const revoked = await bearer(server.baseUrl, adminToken, 'DELETE', `/api/mcp/tokens/${clientCreated.data.record.id}`)
    assert.equal(revoked.status, 200)
    const afterRevoke = await bearer(server.baseUrl, clientToken, 'GET', '/api/notes')
    assert.equal(afterRevoke.status, 401)

    const humanAdmin = await request('POST', '/api/mcp/tokens', {
      name: 'Human Created Admin',
      scopes: ['read', 'write', 'admin']
    })
    assert.deepEqual(humanAdmin.record.scopes, ['read', 'write', 'admin'])
  } finally {
    await server.stop()
  }
})
