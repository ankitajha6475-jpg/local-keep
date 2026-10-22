import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_UI_CONFIG, normalizeUiConfig } from '../shared/uiConfig.js'

export const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config.json')

/**
 * Load the optional JSON config file. Missing or malformed files fall back to
 * the built-in defaults; the error is kept so the admin UI can explain it.
 */
export function loadConfig({ filePath = process.env.LOCAL_KEEP_CONFIG || DEFAULT_CONFIG_PATH } = {}) {
  let fileError = null
  let raw = {}
  try {
    if (fs.existsSync(filePath)) {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch (error) {
    fileError = error.message
    console.error(`⚠️ Could not read config file ${filePath}: ${error.message}`)
  }

  return {
    ui: normalizeUiConfig(raw?.ui, DEFAULT_UI_CONFIG),
    filePath,
    fileError
  }
}
