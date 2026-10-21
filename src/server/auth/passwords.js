import crypto from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(crypto.scrypt)
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64

// Legacy Local Keep password hash (32-bit string hash). Kept only to migrate
// an existing single-password install on its first successful login.
export function legacyHash(value) {
  let hash = 0
  const str = String(value || '')
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

export function validatePassword(password, { username = '' } = {}) {
  const value = String(password || '')
  if (value.length < 8) return 'Password must be at least 8 characters'
  if (value.length > 200) return 'Password is too long'
  if (username && value.toLowerCase() === String(username).toLowerCase()) {
    return 'Password must not be the same as the username'
  }
  return null
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = await scrypt(String(password), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    Buffer.from(derived).toString('base64')
  ].join('$')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

/**
 * Verify a password against a stored hash.
 * Supports current scrypt hashes and the legacy single-password hash.
 * @returns {Promise<{valid:boolean, needsUpgrade:boolean}>}
 */
export async function verifyPassword(password, stored) {
  const value = String(stored || '')
  if (!value) return { valid: false, needsUpgrade: false }

  if (value.startsWith('legacy:')) {
    const expected = value.slice('legacy:'.length)
    const valid = safeEqual(legacyHash(password), expected)
    return { valid, needsUpgrade: valid }
  }

  if (!value.startsWith('scrypt$')) {
    // Very old rows may contain the bare simple hash.
    const valid = safeEqual(legacyHash(password), value)
    return { valid, needsUpgrade: valid }
  }

  const parts = value.split('$')
  if (parts.length !== 6) return { valid: false, needsUpgrade: false }
  const [, n, r, p, saltB64, hashB64] = parts
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  try {
    const derived = await scrypt(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    })
    const valid = expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
    return { valid, needsUpgrade: false }
  } catch (_) {
    return { valid: false, needsUpgrade: false }
  }
}

export function temporaryPassword() {
  return `LK-${crypto.randomBytes(9).toString('base64url')}`
}
