import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

async function raw(baseUrl, method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Auth-Token'] = token
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch (_) { data = text }
  return { status: res.status, data }
}

test('multiuser auth: login, roles, reset, disable, and revision actors', async () => {
  const server = await startTestServer()
  try {
    const adminToken = await server.setupAuth('admin-password-123')

    const bootstrap = await raw(server.baseUrl, 'GET', '/api/auth/bootstrap')
    assert.equal(bootstrap.data.needsSetup, false)

    const me = await raw(server.baseUrl, 'GET', '/api/auth/me', undefined, adminToken)
    assert.equal(me.status, 200)
    assert.equal(me.data.user.username, 'admin')
    assert.equal(me.data.user.role, 'admin')

    // Admin creates a member with a temporary password.
    const created = await raw(server.baseUrl, 'POST', '/api/users', {
      username: 'alice',
      displayName: 'Alice',
      password: 'alice-temp-123',
      role: 'member'
    }, adminToken)
    assert.equal(created.status, 200)
    assert.equal(created.data.user.mustChangePassword, true)

    const memberLogin = await raw(server.baseUrl, 'POST', '/api/auth/login', {
      username: 'alice',
      password: 'alice-temp-123'
    })
    assert.equal(memberLogin.status, 200)
    assert.equal(memberLogin.data.user.role, 'member')
    assert.equal(memberLogin.data.mustChangePassword, true)
    const memberToken = memberLogin.data.token

    // A forced password change blocks normal API access until completed.
    const blocked = await raw(server.baseUrl, 'GET', '/api/notes', undefined, memberToken)
    assert.equal(blocked.status, 403)
    assert.equal(blocked.data.code, 'password_change_required')

    // The member changes the forced temporary password.
    const changed = await raw(server.baseUrl, 'POST', '/api/auth/change-password', {
      currentPassword: 'alice-temp-123',
      newPassword: 'alice-secure-456'
    }, memberToken)
    assert.equal(changed.status, 200)
    assert.equal(changed.data.user.mustChangePassword, false)

    const oldLogin = await raw(server.baseUrl, 'POST', '/api/auth/login', {
      username: 'alice',
      password: 'alice-temp-123'
    })
    assert.equal(oldLogin.status, 401)
    const newLogin = await raw(server.baseUrl, 'POST', '/api/auth/login', {
      username: 'alice',
      password: 'alice-secure-456'
    })
    assert.equal(newLogin.status, 200)

    // Members can use the shared workspace but cannot manage users.
    const notes = await raw(server.baseUrl, 'GET', '/api/notes', undefined, newLogin.data.token)
    assert.equal(notes.status, 200)
    const usersForbidden = await raw(server.baseUrl, 'GET', '/api/users', undefined, newLogin.data.token)
    assert.equal(usersForbidden.status, 403)

    // The member's revision actor identifies the human account.
    const note = await raw(server.baseUrl, 'POST', '/api/notes', {
      title: 'Alice note',
      content: 'owned by alice'
    }, newLogin.data.token)
    assert.equal(note.status, 200)
    const history = await raw(server.baseUrl, 'GET', `/api/notes/${note.data.id}/history`, undefined, adminToken)
    assert.equal(history.status, 200)
    assert.equal(history.data.revisions[0].actor, 'user:alice')

    // An admin reset revokes the member's sessions and returns a temp password.
    const reset = await raw(server.baseUrl, 'POST', `/api/users/${created.data.user.id}/reset-password`, {}, adminToken)
    assert.equal(reset.status, 200)
    assert.match(reset.data.temporaryPassword, /^LK-/)
    const revoked = await raw(server.baseUrl, 'GET', '/api/notes', undefined, newLogin.data.token)
    assert.equal(revoked.status, 401)

    // Disabling the account blocks login.
    const disabled = await raw(server.baseUrl, 'PATCH', `/api/users/${created.data.user.id}`, {
      disabled: true
    }, adminToken)
    assert.equal(disabled.status, 200)
    const disabledLogin = await raw(server.baseUrl, 'POST', '/api/auth/login', {
      username: 'alice',
      password: reset.data.temporaryPassword
    })
    assert.equal(disabledLogin.status, 403)

    // The last active admin cannot be demoted.
    const selfDemote = await raw(server.baseUrl, 'PATCH', `/api/users/${me.data.user.id}`, {
      role: 'member'
    }, adminToken)
    assert.equal(selfDemote.status, 409)
  } finally {
    await server.stop()
  }
})
