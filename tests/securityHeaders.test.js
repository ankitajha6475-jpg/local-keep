import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

/**
 * The baseline security headers are a contract with the browser: they tell it
 * what the document may embed, what it may sniff, and what it may leak.
 */

const EXPECTED = {
  'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY'
}

function assertSecurityHeaders(res, label) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(res.headers.get(name), value, `${label}: ${name}`)
  }
}

test('security headers: every response carries the baseline set', async () => {
  const server = await startTestServer()
  try {
    const status = await fetch(`${server.baseUrl}/api/auth/status`)
    assert.equal(status.status, 200)
    assertSecurityHeaders(status, 'GET /api/auth/status')

    const unauthorized = await fetch(`${server.baseUrl}/api/notes`)
    assert.equal(unauthorized.status, 401)
    assertSecurityHeaders(unauthorized, 'GET /api/notes (401)')

    const setup = await fetch(`${server.baseUrl}/api/password/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'header-test-password' })
    })
    assert.equal(setup.status, 200)
    assertSecurityHeaders(setup, 'POST /api/password/setup')

    const missingImage = await fetch(`${server.baseUrl}/api/images/deadbeef.png`)
    assert.ok(missingImage.status >= 400 && missingImage.status < 500,
      `expected a client error, got ${missingImage.status}`)
    assertSecurityHeaders(missingImage, 'GET /api/images/<missing>')
  } finally {
    await server.stop()
  }
})

test('security headers: the content policy does not constrain the app resources', async () => {
  const server = await startTestServer()
  try {
    const res = await fetch(`${server.baseUrl}/api/auth/status`)
    const csp = res.headers.get('content-security-policy')
    // A `default-src` would block the Excalidraw bundle, its fonts, and the
    // `blob:` URLs it exports images to.
    assert.doesNotMatch(csp, /default-src/, 'the policy must not name default-src')
    assert.doesNotMatch(csp, /script-src/, 'the policy must not constrain script sources')
    assert.doesNotMatch(csp, /style-src/, 'the policy must not constrain style sources')
    assert.doesNotMatch(csp, /img-src/, 'the policy must not constrain image sources')
    assert.doesNotMatch(csp, /connect-src/, 'the policy must not constrain connect sources')
    // The three directives it does name are the ones that matter.
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /base-uri 'none'/)
  } finally {
    await server.stop()
  }
})
