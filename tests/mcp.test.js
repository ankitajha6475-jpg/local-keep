import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { startTestServer } from './helpers/serverProcess.js'

function jsonResult(result) {
  const block = result.content?.find(c => c.type === 'text')
  return block ? JSON.parse(block.text) : null
}

test('embedded MCP: tools, search timestamps, thread, links, whiteboard images', async () => {
  const server = await startTestServer()
  let client
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)

    const tokenResponse = await request('POST', '/api/mcp/tokens', { name: 'Test Agent' })
    assert.match(tokenResponse.token, /^lk_mcp_/)

    const transport = new StreamableHTTPClientTransport(
      new URL(`${server.baseUrl}/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${tokenResponse.token}` } } }
    )
    client = new Client({ name: 'local-keep-test', version: '1.0.0' })
    await client.connect(transport)

    const tools = await client.listTools()
    const names = tools.tools.map(t => t.name)
    for (const name of ['search_notes', 'semantic_search', 'create_note', 'edit_note', 'get_thread', 'get_whiteboard', 'get_backlinks', 'list_tags', 'get_graph', 'list_changes']) {
      assert.ok(names.includes(name), `missing tool ${name}`)
    }

    const beta = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: { title: 'Beta', content: 'Beta body #project/local' }
    }))
    const alpha = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: {
        title: 'Alpha',
        content: 'Hello #project/local [[Beta]]',
        related_note_ids: [beta.note.id]
      }
    }))
    assert.ok(alpha.note.id)
    assert.equal(alpha.note.revisionNo, 1)

    const search = jsonResult(await client.callTool({
      name: 'search_notes',
      arguments: { query: 'Hello' }
    }))
    assert.equal(search.results.length, 1)
    const hit = search.results[0]
    assert.ok(hit.created_at)
    assert.ok(hit.updated_at)
    assert.ok(hit.revision_created_at)
    assert.equal(hit.revision_no, 1)
    assert.ok(hit.tags.includes('project/local'))

    const edited = jsonResult(await client.callTool({
      name: 'edit_note',
      arguments: {
        note_id: alpha.note.id,
        content: 'Hello again #project/local [[Beta]]',
        base_revision_id: alpha.note.revisionId
      }
    }))
    assert.equal(edited.note.id, alpha.note.id)
    assert.equal(edited.note.revisionNo, 2)
    assert.match(edited.notice, /revision 2/i)

    const history = jsonResult(await client.callTool({
      name: 'get_thread',
      arguments: { note_id: alpha.note.id, format: 'json' }
    }))
    assert.equal(history.revisions.length, 2)
    assert.equal(history.headRevisionId, edited.note.revisionId)

    const backlinks = jsonResult(await client.callTool({
      name: 'get_backlinks',
      arguments: { note_id: beta.note.id }
    }))
    assert.ok(backlinks.some(link => link.sourceNoteId === alpha.note.id))

    const tags = jsonResult(await client.callTool({ name: 'list_tags', arguments: {} }))
    assert.ok(tags.tags.some(node => node.tag === 'project'))

    const graph = jsonResult(await client.callTool({
      name: 'get_graph',
      arguments: { note_id: alpha.note.id, depth: 1 }
    }))
    assert.ok(graph.nodes.some(node => node.id === beta.note.id))
    assert.ok(graph.edges.some(edge => edge.source === alpha.note.id && edge.target === beta.note.id))

    const noteResource = await client.readResource({ uri: `local-keep://notes/${alpha.note.id}` })
    assert.match(noteResource.contents[0].text, /Hello again/)
    const threadResource = await client.readResource({ uri: `local-keep://notes/${alpha.note.id}/thread` })
    assert.equal(JSON.parse(threadResource.contents[0].text).revisions.length, 2)

    const changes = jsonResult(await client.callTool({
      name: 'list_changes',
      arguments: { since: '1970-01-01T00:00:00.000Z' }
    }))
    assert.ok(changes.events.length >= 2)

    // Whiteboard pages: create a canvas note, upload a tiny image, store a manifest.
    const canvasData = JSON.stringify({
      elements: [{ id: 'e1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
      files: {}
    })
    const board = await request('POST', '/api/notes', { type: 'canvas', canvasData })
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
    const form = new FormData()
    form.append('image', new Blob([png], { type: 'image/png' }), 'page.png')
    const uploadRes = await fetch(`${server.baseUrl}/api/images`, {
      method: 'POST',
      headers: { 'X-Auth-Token': sessionToken },
      body: form
    })
    const upload = await uploadRes.json()
    await request('PUT', `/api/notes/${board.id}/renders`, {
      tiles: [{ pageIndex: 0, hash: upload.hash, ext: upload.ext, width: 1, height: 1, bbox: [0, 0, 100, 50], elementIds: ['e1'] }]
    })

    const whiteboard = await client.callTool({
      name: 'get_whiteboard',
      arguments: { note_id: board.id, format: 'images', max_tiles: 1 }
    })
    assert.equal(whiteboard.content.some(block => block.type === 'image'), true)
    const whiteboardText = whiteboard.content.find(block => block.type === 'text')
    assert.match(whiteboardText.text, /tile_count/)

    const whiteboardMarkdown = await client.callTool({
      name: 'get_whiteboard',
      arguments: { note_id: board.id, format: 'markdown' }
    })
    const md = whiteboardMarkdown.content.find(block => block.type === 'text').text
    assert.match(md, /!\[Whiteboard page 1\]/)
  } finally {
    if (client) await client.close().catch(() => {})
    await server.stop()
  }
})
