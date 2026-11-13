import crypto from 'crypto'
import { hashPassword, verifyPassword, validatePassword } from '../auth/passwords.js'

function fail(status, message, code = 'auth_error') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function userDto(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    tagWhitelist: row.tag_whitelist ?? null,
    mustChangePassword: !!row.must_change_password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    disabledAt: row.disabled_at
  }
}

function normalizeUsername(value) {
  return String(value || '').trim()
}

function validateUsername(username) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return 'Username must be 3–32 characters using letters, numbers, dot, dash, or underscore'
  }
  return null
}

export function createUserService({ db }) {
  const byId = db.prepare('SELECT * FROM users WHERE id = ?')
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')

  function count() {
    return db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  }

  function activeAdminCount(excludeId = null) {
    return db.prepare(`
      SELECT COUNT(*) AS count FROM users
      WHERE role = 'admin' AND disabled_at IS NULL AND id != ?
    `).get(excludeId || '').count
  }

  function list() {
    return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(userDto)
  }

  function getById(id) {
    return userDto(byId.get(id))
  }

  function getRowById(id) {
    return byId.get(id)
  }

  function getByUsername(username) {
    return userDto(byUsername.get(normalizeUsername(username)))
  }

  async function create({ username, displayName, password, role = 'member', mustChangePassword = false, tagWhitelist = null }) {
    const cleanUsername = normalizeUsername(username)
    const usernameError = validateUsername(cleanUsername)
    if (usernameError) throw fail(400, usernameError, 'invalid_username')
    if (byUsername.get(cleanUsername)) throw fail(409, 'Username is already in use', 'username_taken')
    if (!['admin', 'member'].includes(role)) throw fail(400, 'Invalid role', 'invalid_role')
    const passwordError = validatePassword(password, { username: cleanUsername })
    if (passwordError) throw fail(400, passwordError, 'invalid_password')

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const passwordHash = await hashPassword(password)
    db.prepare(`
      INSERT INTO users
        (id, username, display_name, password_hash, role, must_change_password, created_at, updated_at, tag_whitelist)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanUsername,
      String(displayName || cleanUsername).trim().slice(0, 80) || cleanUsername,
      passwordHash,
      role,
      mustChangePassword ? 1 : 0,
      now,
      now,
      tagWhitelist !== null && tagWhitelist !== undefined ? String(tagWhitelist) : (role === 'admin' ? null : '*')
    )
    return userDto(byId.get(id))
  }

  async function verifyCredentials(username, password) {
    const row = byUsername.get(normalizeUsername(username))
    if (!row) return null
    if (row.disabled_at) throw fail(403, 'This account is disabled', 'account_disabled')
    const result = await verifyPassword(password, row.password_hash)
    if (!result.valid) return null
    if (result.needsUpgrade) {
      const upgraded = await hashPassword(password)
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(upgraded, new Date().toISOString(), row.id)
    }
    return userDto(byId.get(row.id))
  }

  function touchLogin(id) {
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
  }

  async function changePassword(id, newPassword, { mustChange = false } = {}) {
    const row = byId.get(id)
    if (!row) throw fail(404, 'User not found', 'user_not_found')
    const passwordError = validatePassword(newPassword, { username: row.username })
    if (passwordError) throw fail(400, passwordError, 'invalid_password')
    const passwordHash = await hashPassword(newPassword)
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET password_hash = ?, must_change_password = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, mustChange ? 1 : 0, now, id)
    return userDto(byId.get(id))
  }

  async function resetPassword(id, newPassword) {
    const user = getById(id)
    if (!user) throw fail(404, 'User not found', 'user_not_found')
    return changePassword(id, newPassword, { mustChange: true })
  }

  function update(id, { displayName, role, disabled, tagWhitelist }) {
    const row = byId.get(id)
    if (!row) throw fail(404, 'User not found', 'user_not_found')
    const nextRole = role !== undefined ? role : row.role
    if (!['admin', 'member'].includes(nextRole)) throw fail(400, 'Invalid role', 'invalid_role')
    const nextDisabled = disabled !== undefined ? !!disabled : !!row.disabled_at
    if (row.role === 'admin' && (nextRole !== 'admin' || nextDisabled) && activeAdminCount(id) === 0) {
      throw fail(409, 'At least one active admin is required', 'last_admin')
    }
    const nextWhitelist = tagWhitelist !== undefined
      ? (tagWhitelist === null ? null : String(tagWhitelist))
      : row.tag_whitelist
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET display_name = ?, role = ?, disabled_at = ?, tag_whitelist = ?, updated_at = ?
      WHERE id = ?
    `).run(
      displayName !== undefined
        ? (String(displayName).trim().slice(0, 80) || row.display_name)
        : row.display_name,
      nextRole,
      nextDisabled ? (row.disabled_at || now) : null,
      nextWhitelist,
      now,
      id
    )
    return userDto(byId.get(id))
  }

  return {
    count,
    list,
    getById,
    getRowById,
    getByUsername,
    create,
    verifyCredentials,
    touchLogin,
    changePassword,
    resetPassword,
    update,
    activeAdminCount
  }
}
