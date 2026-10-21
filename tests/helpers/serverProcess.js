import { spawn } from 'node:child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'node:net'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function waitForServer(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`server did not start in ${timeoutMs}ms\n${output}`))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      child.off('exit', onExit)
    }
    function onData(chunk) {
      output += chunk.toString()
      if (output.includes('Local Keep server running at')) {
        cleanup()
        resolve()
      }
    }
    function onExit(code) {
      cleanup()
      reject(new Error(`server exited early (${code})\n${output}`))
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', onExit)
  })
}

export async function startTestServer({ env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-keep-server-'))
  const port = await getFreePort()
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEBUG: '',
      NODE_ENV: 'test',
      LOCAL_KEEP_DATA_DIR: dir,
      PORT: String(port),
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk.toString() })

  try {
    await waitForServer(child)
  } catch (error) {
    child.kill('SIGKILL')
    fs.rmSync(dir, { recursive: true, force: true })
    throw new Error(`${error.message}\n${stderr}`)
  }

  const baseUrl = `http://127.0.0.1:${port}`

  async function setupAuth(password = 'test-password') {
    const res = await fetch(`${baseUrl}/api/password/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (!res.ok) throw new Error(`setup failed: ${res.status} ${await res.text()}`)
    const data = await res.json()
    return data.token
  }

  function client(token) {
    const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token }
    return async function request(method, url, body) {
      const res = await fetch(`${baseUrl}${url}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      const text = await res.text()
      let data
      try { data = text ? JSON.parse(text) : null } catch (_) { data = text }
      if (!res.ok) {
        const error = new Error(data?.error || `HTTP ${res.status}`)
        error.status = res.status
        error.data = data
        throw error
      }
      return data
    }
  }

  async function stop() {
    child.kill('SIGTERM')
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 3000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })
    fs.rmSync(dir, { recursive: true, force: true })
  }

  return { child, dir, port, baseUrl, setupAuth, client, stop }
}
