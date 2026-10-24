import test from 'node:test'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { startTestServer } from './helpers/serverProcess.js'

function jsonResult(result) {
  const block = result.content?.find(c => c.type === 'text')
  return block ? JSON.parse(block.text) : null
}

async function connectAgent(baseUrl, token, name) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const client = new Client({ name, version: '1.0.0' })
  await client.connect(transport)
  return client
}

test('MCP administration: archived flags, tag tools, compact responses, and purge guards', async () => {
  const server = await startTestServer()
  let client
  try {
    const sessionToken = await server.setupAuth()
    const request = server.client(sessionToken)
    const token = (await request('POST', '/api/mcp/tokens', { name: 'Admin Agent' })).token
    client = await connectAgent(server.baseUrl, token, 'admin-agent')

    const tools = (await client.listTools()).tools.map(tool => tool.name)
    for (const name of ['add_tags', 'remove_tags', 'purge_note', 'purge_archived']) {
      assert.ok(tools.includes(name), `missing tool ${name}`)
    }

    const one = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: { title: 'Tag one', content: 'Body one' }
    })).note
    const two = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: { title: 'Tag two', content: 'Body two' }
    })).note
    const archivedOne = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: { title: 'Old one', content: 'Old body one' }
    })).note
    const archivedTwo = jsonResult(await client.callTool({
      name: 'create_note',
      arguments: { title: 'Old two', content: 'Old body two' }
    })).note

    const archivedResult = jsonResult(await client.callTool({
      name: 'archive_note',
      arguments: { note_id: archivedOne.id }
    }))
    assert.equal(archivedResult.note.archivedAt !== null, true)
    assert.equal(archivedResult.note.content, undefined, 'archive result should be compact')
    await client.callTool({ name: 'archive_note', arguments: { note_id: archivedTwo.id } })

    const listed = jsonResult(await client.callTool({
      name: 'list_notes',
      arguments: { include_archived: true, limit: 100 }
    }))
    const archivedRow = listed.results.find(note => note.note_id === archivedOne.id)
    const activeRow = listed.results.find(note => note.note_id === one.id)
    assert.equal(archivedRow.is_archived, true)
    assert.ok(archivedRow.archived_at)
    assert.equal(activeRow.is_archived, false)
    assert.equal(activeRow.archived_at, null)

    const archivedSession = await client.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: archivedOne.id }
    })
    assert.equal(archivedSession.isError, true)
    assert.equal(jsonResult(archivedSession).error.code, 'note_archived')

    const dryRun = jsonResult(await client.callTool({
      name: 'add_tags',
      arguments: { note_ids: [one.id, two.id], tags: ['#Project/Local'], dry_run: true }
    }))
    assert.equal(dryRun.mode, 'add')
    assert.equal(dryRun.summary.changed, 2)
    assert.deepEqual(dryRun.results[0].would_add, ['project/local'])

    const before = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: one.id }
    }))
    assert.equal(before.note.revision_no, 1)

    const added = jsonResult(await client.callTool({
      name: 'add_tags',
      arguments: { note_ids: [one.id, two.id], tags: ['project/local'] }
    }))
    assert.equal(added.summary.changed, 2)
    assert.equal(added.results[0].revisionNo, 2)
    assert.ok(added.results[0].tags.includes('project/local'))
    assert.equal(added.results[0].content, undefined, 'tag result should be compact')

    const skipped = jsonResult(await client.callTool({
      name: 'add_tags',
      arguments: { note_ids: [archivedOne.id], tags: ['archived'] }
    }))
    assert.equal(skipped.summary.skipped, 1)
    assert.equal(skipped.results[0].skipped, 'note_archived')

    const removed = jsonResult(await client.callTool({
      name: 'remove_tags',
      arguments: { note_ids: [one.id], tags: ['#project/local'] }
    }))
    assert.equal(removed.summary.changed, 1)
    assert.deepEqual(removed.results[0].removed, ['project/local'])
    assert.equal(removed.results[0].tags.includes('project/local'), false)

    const edited = jsonResult(await client.callTool({
      name: 'edit_note',
      arguments: {
        note_id: two.id,
        content: 'Fresh body',
        tags: ['edited'],
        message: 'Rewrite with tag'
      }
    }))
    assert.equal(edited.note.content, undefined, 'edit result should be compact by default')
    // Tags live in the fence, so the body is untouched and the file is longer
    // than the old inline-tag form ("Fresh body\n\n#edited").
    assert.ok(edited.note.contentLength > 'Fresh body\n\n#edited'.length)
    assert.ok(edited.note.tags.includes('edited'))
    assert.equal(edited.revision.message, 'Rewrite with tag')

    const appended = jsonResult(await client.callTool({
      name: 'append_to_note',
      arguments: {
        note_id: two.id,
        content: 'tail',
        tags: ['tail'],
        message: 'Add tail'
      }
    }))
    assert.equal(appended.note.content, undefined)
    assert.equal(appended.revision.message, 'Add tail')
    assert.ok(appended.note.tags.includes('tail'))

    const twoAfter = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: two.id }
    }))
    // get_note returns body-only content plus structured meta by default.
    assert.equal(twoAfter.note.content, 'Fresh body\n\ntail')
    assert.deepEqual(twoAfter.note.meta.tags, ['edited', 'tail'])

    const twoRaw = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: two.id, include_frontmatter: true }
    }))
    assert.equal(twoRaw.note.content, '---\ntags: [edited, tail]\n---\nFresh body\n\ntail')

    const opened = jsonResult(await client.callTool({
      name: 'note_session',
      arguments: { action: 'open_write', note_id: one.id }
    }))
    await client.callTool({
      name: 'note_session',
      arguments: {
        action: 'append',
        session_id: opened.session.session_id,
        text: 'session tail'
      }
    })
    const saved = jsonResult(await client.callTool({
      name: 'note_session',
      arguments: {
        action: 'save',
        session_id: opened.session.session_id,
        message: 'Session save'
      }
    }))
    assert.equal(saved.dirty, false)
    const closed = jsonResult(await client.callTool({
      name: 'note_session',
      arguments: { action: 'close', session_id: opened.session.session_id }
    }))
    assert.equal(closed.draft_kept, false, 'save should leave no dirty draft after close')

    const activePurge = await client.callTool({
      name: 'purge_note',
      arguments: { note_id: one.id, confirm: true }
    })
    assert.equal(activePurge.isError, true)
    assert.equal(jsonResult(activePurge).error.code, 'note_not_archived')

    const preview = jsonResult(await client.callTool({
      name: 'purge_note',
      arguments: { note_id: archivedOne.id }
    }))
    assert.equal(preview.mode, 'preview')
    assert.equal(preview.note.id, archivedOne.id)

    const stillThere = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: archivedOne.id }
    }))
    assert.equal(stillThere.note.archived_at !== null, true)

    const purged = jsonResult(await client.callTool({
      name: 'purge_note',
      arguments: { note_id: archivedOne.id, confirm: true, expected_title: 'Old one' }
    }))
    assert.equal(purged.mode, 'purged')
    assert.equal(purged.note.content, undefined)
    const gone = await client.callTool({
      name: 'get_note',
      arguments: { note_id: archivedOne.id }
    })
    assert.equal(gone.isError, true)

    const allPreview = jsonResult(await client.callTool({
      name: 'purge_archived',
      arguments: {}
    }))
    assert.equal(allPreview.mode, 'preview')
    assert.equal(allPreview.count, 1)
    assert.equal(allPreview.notes[0].id, archivedTwo.id)

    const missingCount = await client.callTool({
      name: 'purge_archived',
      arguments: { confirm: true }
    })
    assert.equal(missingCount.isError, true)
    assert.equal(jsonResult(missingCount).error.code, 'expected_count_required')

    const wrongCount = await client.callTool({
      name: 'purge_archived',
      arguments: { confirm: true, expected_count: 2 }
    })
    assert.equal(wrongCount.isError, true)
    assert.equal(jsonResult(wrongCount).error.code, 'count_mismatch')

    const purgedAll = jsonResult(await client.callTool({
      name: 'purge_archived',
      arguments: { confirm: true, expected_count: 1 }
    }))
    assert.equal(purgedAll.mode, 'purged')
    assert.equal(purgedAll.count, 1)
    assert.equal(purgedAll.notes[0].id, archivedTwo.id)

    // Whiteboard payloads are omitted from get_note unless explicitly requested.
    const canvasData = JSON.stringify({ elements: [], files: {} })
    const board = await request('POST', '/api/notes', { type: 'canvas', canvasData })
    const boardNote = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: board.id }
    }))
    assert.equal(boardNote.note.canvasData, undefined)
    assert.equal(boardNote.note.canvas_omitted, true)
    const boardFull = jsonResult(await client.callTool({
      name: 'get_note',
      arguments: { note_id: board.id, include_canvas: true }
    }))
    assert.equal(boardFull.note.canvasData, canvasData)
  } finally {
    if (client) await client.close().catch(() => {})
    await server.stop()
  }
})
