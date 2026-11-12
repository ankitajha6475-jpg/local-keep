import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'
import { secureCookies } from '../src/server/sessionStore.js'

/**
 * The `__Host-` prefix binds the session cookie to the exact host that set
 * it. The browser only accepts a `__Host-` cookie when it is `Secure`, has
 * `Path=/`, and carries no `Domain` attribute, so the prefix and the
 * `Secure` attribute have to be decided by the same condition.
 */

function parseSetCookie(header) {
  const [pair, ...flags] = String(header || '').split(';').map(s => s.trim())
  const eq = pair.indexOf('=')
  const name = pair.slice(0, eq)
  const value = pair.slice(eq + 1)
  const attributes = new Map()
  for (const flag of flags) {
    const i = flag.indexOf('=')
    if (i === -1) attributes.set(flag.toLowerCase(), true)
    else attributes.set(flag.slice(0, i).toLowerCase(), flag.slice(i + 1))
  }
  return { name, value, attributes }
}

async function setupAndReadCookie(env) {
  const server = await startTestServer({ env })
  try {
    const res = await fetch(`${server.baseUrl}/api/password/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'cookie-test-password' })
    })
    assert.equal(res.status, 200)
    return { server, cookie: parseSetCookie(res.headers.get('set-cookie')) }
  } catch (error) {
    await server.stop()
    throw error
  }
}

test('secureCookies: production and COOKIE_SECURE both mean secure', () => {
  assert.equal(secureCookies({ NODE_ENV: 'production' }), true)
  assert.equal(secureCookies({ NODE_ENV: 'development', COOKIE_SECURE: '1' }), true)
  assert.equal(secureCookies({ NODE_ENV: 'development' }), false)
  assert.equal(secureCookies({ NODE_ENV: 'test' }), false)
})

test('session cookie: a secure cookie uses the __Host- prefix', async () => {
  const { server, cookie } = await setupAndReadCookie({ COOKIE_SECURE: '1' })
  try {
    assert.equal(cookie.name, '__Host-local_keep_session')
    assert.equal(cookie.attributes.get('secure'), true, 'a __Host- cookie must be Secure')
    assert.equal(cookie.attributes.get('path'), '/')
    assert.equal(cookie.attributes.get('httponly'), true)
    assert.equal(cookie.attributes.get('samesite'), 'Strict')
    assert.equal(cookie.attributes.has('domain'), false, 'a __Host- cookie must not carry Domain')
  } finally {
    await server.stop()
  }
})

test('session cookie: an insecure cookie keeps the plain name', async () => {
  const { server, cookie } = await setupAndReadCookie({})
  try {
    assert.equal(cookie.name, 'local_keep_session')
    assert.equal(cookie.attributes.has('secure'), false)
    assert.equal(cookie.attributes.get('path'), '/')
  } finally {
    await server.stop()
  }
})

test('session cookie: the secure cookie authenticates a request', async () => {
  const { server, cookie } = await setupAndReadCookie({ COOKIE_SECURE: '1' })
  try {
    const authorized = await fetch(`${server.baseUrl}/api/notes`, {
      headers: { Cookie: `${cookie.name}=${cookie.value}` }
    })
    assert.equal(authorized.status, 200)
  } finally {
    await server.stop()
  }
})

test('session cookie: the pre-rename cookie name is not accepted', async () => {
  const { server, cookie } = await setupAndReadCookie({ COOKIE_SECURE: '1' })
  try {
    // The same signed value under the old name must not authenticate: that
    // is exactly the shadowing the `__Host-` prefix prevents.
    const rejected = await fetch(`${server.baseUrl}/api/notes`, {
      headers: { Cookie: `local_keep_session=${cookie.value}` }
    })
    assert.equal(rejected.status, 401)
  } finally {
    await server.stop()
  }
})

test('session cookie: logout clears the cookie under the same name', async () => {
  const { server, cookie } = await setupAndReadCookie({ COOKIE_SECURE: '1' })
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${cookie.name}=${cookie.value}` }
    })
    assert.equal(res.status, 200)
    const cleared = parseSetCookie(res.headers.get('set-cookie'))
    assert.equal(cleared.name, cookie.name)
    assert.equal(cleared.attributes.get('max-age'), '0')
    assert.equal(cleared.attributes.get('secure'), true)
  } finally {
    await server.stop()
  }
})
