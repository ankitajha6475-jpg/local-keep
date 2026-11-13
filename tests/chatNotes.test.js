import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers/serverProcess.js'

test('chat room: creation, discrete message deltas, version bumping, and FTS indexing', async () => {
  const server = await startTestServer()
  try {
    const token = await server.setupAuth()
    const request = server.client(token)

    // 1. Create a chat room note
    const created = await request('POST', '/api/notes', {
      title: 'Dev Discussion',
      type: 'chat'
    })

    assert.equal(created.type, 'chat')
    assert.equal(created.revisionNo, 1)
    const initData = JSON.parse(created.content)
    assert.deepEqual(initData.messages, [])

    // 2. Send first message via REST API
    const res1 = await request('POST', `/api/notes/${created.id}/chat/messages`, {
      text: 'Hello team, welcome to the chat room!'
    })

    assert.equal(res1.message.text, 'Hello team, welcome to the chat room!')
    assert.equal(res1.revision.revisionNo, 2)
    assert.equal(res1.transcript.messages.length, 1)

    // 3. Send second message
    const res2 = await request('POST', `/api/notes/${created.id}/chat/messages`, {
      text: 'Checking the deployment status.'
    })

    assert.equal(res2.message.text, 'Checking the deployment status.')
    assert.equal(res2.revision.revisionNo, 3)
    assert.equal(res2.transcript.messages.length, 2)

    // 4. Verify note head
    const fetched = await request('GET', `/api/notes/${created.id}`)
    assert.equal(fetched.revisionNo, 3)
    const fetchedData = JSON.parse(fetched.content)
    assert.equal(fetchedData.messages.length, 2)
    assert.equal(fetchedData.messages[0].text, 'Hello team, welcome to the chat room!')
    assert.equal(fetchedData.messages[1].text, 'Checking the deployment status.')

    // 5. Check revision history
    const history = await request('GET', `/api/notes/${created.id}/history`)
    assert.equal(history.revisions.length, 3)
    assert.equal(history.revisions[0].revisionNo, 1)
    assert.equal(history.revisions[1].revisionNo, 2)
    assert.equal(history.revisions[1].source, 'chat')
    assert.equal(history.revisions[2].revisionNo, 3)
    assert.equal(history.revisions[2].source, 'chat')

    // 6. Check discrete delta stored in revision 2
    const rev2 = await request('GET', `/api/notes/${created.id}/history/${history.revisions[1].id}`)
    const rev2Content = JSON.parse(rev2.content)
    assert.equal(rev2Content.type, 'chat_message')
    assert.equal(rev2Content.message.text, 'Hello team, welcome to the chat room!')

    // 7. Test FTS keyword search finds chat note by message text
    const searchRes = await request('GET', '/api/search?q=deployment')
    assert.ok(Array.isArray(searchRes) && searchRes.includes(created.id), 'Search finds chat room by message content')

    // 8. Test properties/tags on chat note
    const tagged = await request('PATCH', `/api/notes/${created.id}/properties`, {
      set: { tags: ['project/chat', 'team'] }
    })
    assert.deepEqual(tagged.tags, ['project/chat', 'team'])
    const fetchedTagged = await request('GET', `/api/notes/${created.id}`)
    assert.deepEqual(fetchedTagged.tags, ['project/chat', 'team'])
    // Head messages still intact
    const taggedBody = JSON.parse(fetchedTagged.content.replace(/^---[\s\S]*?---\n*/, ''))
    assert.equal(taggedBody.messages.length, 2)

    // 9. Send another message after tagging
    const res3 = await request('POST', `/api/notes/${created.id}/chat/messages`, {
      text: 'Third message with tags preserved'
    })
    assert.equal(res3.note.tags.length, 2)
    assert.equal(res3.transcript.messages.length, 3)

    // 10. Restore earlier revision (e.g. revision 2 with only 1 message)
    const restored = await request('POST', `/api/notes/${created.id}/history/${history.revisions[1].id}/restore`)
    const restoredData = JSON.parse(restored.content.replace(/^---[\s\S]*?---\n*/, ''))
    assert.equal(restoredData.messages.length, 1)
    assert.equal(restoredData.messages[0].text, 'Hello team, welcome to the chat room!')
  } finally {
    await server.stop()
  }
})
