import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'
import { createTokenService } from '../src/server/services/tokens.js'

test('MCP tokens are created hashed, verified, listed, and revoked', () => {
  const ctx = createFreshContext()
  try {
    const service = createTokenService({ db: ctx.db })
    const created = service.create({ name: 'Claude' })
    assert.match(created.token, /^lk_mcp_/)
    assert.equal(created.record.name, 'Claude')

    const verified = service.verify(created.token)
    assert.equal(verified.name, 'Claude')
    assert.deepEqual(verified.scopes, ['read', 'write'])
    assert.equal(service.hasScope(verified, 'write'), true)

    const list = service.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'Claude')
    assert.equal(Object.prototype.hasOwnProperty.call(list[0], 'token_hash'), false)

    service.revoke(created.record.id)
    assert.equal(service.verify(created.token), null)

    const readOnly = service.create({ name: 'Reader', scopes: 'read' })
    const readToken = service.verify(readOnly.token)
    assert.equal(service.hasScope(readToken, 'write'), false)
  } finally {
    ctx.cleanup()
  }
})
