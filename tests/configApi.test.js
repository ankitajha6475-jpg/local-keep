import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startTestServer } from './helpers/serverProcess.js'

test('config API exposes file defaults and admin runtime overrides', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-keep-config-api-'))
  const configPath = path.join(dir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify({
    ui: { noteModalWidth: 1234, linkDialogWidth: 560 }
  }))

  const server = await startTestServer({ env: { LOCAL_KEEP_CONFIG: configPath } })
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    const initial = await request('GET', '/api/config')
    assert.equal(initial.ui.noteModalWidth, 1234)
    assert.equal(initial.ui.linkDialogWidth, 560)
    assert.equal(initial.search.semanticEnabled, false)
    assert.equal(initial.search.rerankEnabled, false)

    const admin = await request('GET', '/api/admin/config')
    assert.equal(admin.defaults.noteModalWidth, 1234)
    assert.equal(admin.filePath, configPath)
    assert.deepEqual(admin.overrides, {})

    const updated = await request('PUT', '/api/admin/config', {
      ui: { noteModalWidth: 1400, linkDialogWidth: 640 }
    })
    assert.equal(updated.ui.noteModalWidth, 1400)
    assert.equal(updated.overrides.linkDialogWidth, 640)

    const runtime = await request('GET', '/api/config')
    assert.equal(runtime.ui.noteModalWidth, 1400)
    assert.equal(runtime.ui.linkDialogWidth, 640)

    await assert.rejects(
      request('PUT', '/api/admin/config', { ui: { noteModalWidth: 10 } }),
      /between 480 and 2400/
    )

    const reset = await request('DELETE', '/api/admin/config')
    assert.equal(reset.ui.noteModalWidth, 1234)
    assert.deepEqual(reset.overrides, {})
  } finally {
    await server.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
