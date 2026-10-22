import {
  DEFAULT_UI_CONFIG,
  UI_CONFIG_FIELDS,
  pickUiConfig
} from '../../shared/uiConfig.js'

function fail(message, code = 'invalid_ui_config') {
  const error = new Error(message)
  error.status = 400
  error.code = code
  return error
}

function validatePatch(input) {
  if (input == null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw fail('ui config must be an object')
  }
  const result = {}
  for (const field of UI_CONFIG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue
    const value = Number(input[field.key])
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      throw fail(`${field.label} must be a whole number between ${field.min} and ${field.max}`)
    }
    result[field.key] = value
  }
  return result
}

export function createUiSettingsService({
  db,
  defaults = DEFAULT_UI_CONFIG,
  filePath = null,
  fileError = null
} = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const select = db.prepare('SELECT value, updated_at AS updatedAt FROM app_settings WHERE key = ?')
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)
  const remove = db.prepare('DELETE FROM app_settings WHERE key = ?')

  const fileDefaults = pickUiConfig(defaults)
  const effectiveDefaults = { ...DEFAULT_UI_CONFIG, ...fileDefaults }

  function overrides() {
    const row = select.get('ui')
    if (!row?.value) return {}
    try {
      return pickUiConfig(JSON.parse(row.value))
    } catch (_) {
      return {}
    }
  }

  function get() {
    const currentOverrides = overrides()
    return {
      defaults: { ...effectiveDefaults },
      overrides: currentOverrides,
      ui: { ...effectiveDefaults, ...currentOverrides },
      filePath,
      fileError
    }
  }

  function update(patch) {
    const values = validatePatch(patch)
    if (Object.keys(values).length === 0) throw fail('No UI settings were provided')
    upsert.run('ui', JSON.stringify({ ...overrides(), ...values }), new Date().toISOString())
    return get()
  }

  function reset() {
    remove.run('ui')
    return get()
  }

  return { get, update, reset }
}
