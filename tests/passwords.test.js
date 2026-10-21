import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hashPassword,
  verifyPassword,
  legacyHash,
  validatePassword,
  temporaryPassword
} from '../src/server/auth/passwords.js'

test('scrypt password hashes verify and reject wrong passwords', async () => {
  const stored = await hashPassword('correct horse battery staple')
  assert.match(stored, /^scrypt\$/)
  assert.deepEqual(await verifyPassword('correct horse battery staple', stored), {
    valid: true,
    needsUpgrade: false
  })
  assert.equal((await verifyPassword('wrong password', stored)).valid, false)
})

test('legacy hashes verify and request an upgrade', async () => {
  const stored = `legacy:${legacyHash('old-password')}`
  const result = await verifyPassword('old-password', stored)
  assert.equal(result.valid, true)
  assert.equal(result.needsUpgrade, true)
  assert.equal((await verifyPassword('nope', stored)).valid, false)
})

test('password policy and temporary passwords', () => {
  assert.match(validatePassword('short'), /at least 8/)
  assert.match(validatePassword('alicealice', { username: 'alicealice' }), /same as the username/)
  assert.equal(validatePassword('a-good-password', { username: 'alice' }), null)
  assert.match(temporaryPassword(), /^LK-/)
  assert.equal(temporaryPassword().length >= 10, true)
})
