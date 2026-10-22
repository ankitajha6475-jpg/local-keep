import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFreshContext } from './helpers/testDb.js'
import { loadConfig } from '../src/server/config.js'
import { createUiSettingsService } from '../src/server/services/uiSettings.js'
import { DEFAULT_UI_CONFIG, normalizeUiConfig, pickUiConfig } from '../src/shared/uiConfig.js'

test('UI config normalization keeps known keys clamped to bounds', () => {
  assert.equal(DEFAULT_UI_CONFIG.noteModalWidth, 960)
  const picked = pickUiConfig({
    noteModalWidth: 1200,
    linkDialogWidth: 99999,
    unknown: 42,
    graphHeight: 'not-a-number'
  })
  assert.deepEqual(picked, {
    noteModalWidth: 1200,
    linkDialogWidth: 1200
  })
  assert.equal(normalizeUiConfig({ noteModalWidth: 10 }).noteModalWidth, 480)
})

test('config file defaults are loaded and malformed files fall back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-keep-config-'))
  try {
    const filePath = path.join(dir, 'config.json')
    fs.writeFileSync(filePath, JSON.stringify({
      ui: { noteModalWidth: 1111, linkDialogWidth: 620 }
    }))
    const loaded = loadConfig({ filePath })
    assert.equal(loaded.ui.noteModalWidth, 1111)
    assert.equal(loaded.ui.linkDialogWidth, 620)
    assert.equal(loaded.fileError, null)

    fs.writeFileSync(filePath, '{ not json')
    const broken = loadConfig({ filePath })
    assert.equal(broken.ui.noteModalWidth, DEFAULT_UI_CONFIG.noteModalWidth)
    assert.ok(broken.fileError)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime UI overrides persist, validate, and reset to file defaults', () => {
  const ctx = createFreshContext()
  try {
    const defaults = { noteModalWidth: 1000, linkDialogWidth: 600 }
    const settings = createUiSettingsService({
      db: ctx.db,
      defaults,
      filePath: '/test/config.json'
    })
    assert.equal(settings.get().ui.noteModalWidth, 1000)
    assert.equal(settings.get().filePath, '/test/config.json')

    settings.update({ noteModalWidth: 1200 })
    assert.equal(settings.get().ui.noteModalWidth, 1200)
    assert.equal(settings.get().ui.linkDialogWidth, 600)

    const reopened = createUiSettingsService({ db: ctx.db, defaults })
    assert.equal(reopened.get().ui.noteModalWidth, 1200)

    assert.throws(
      () => settings.update({ noteModalWidth: 100 }),
      /between 480 and 2400/
    )
    assert.equal(settings.reset().ui.noteModalWidth, 1000)
    assert.deepEqual(settings.get().overrides, {})
  } finally {
    ctx.cleanup()
  }
})
