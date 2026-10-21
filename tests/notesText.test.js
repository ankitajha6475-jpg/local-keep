import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanContent, markdownToText, getDisplayTitle } from '../src/shared/notesText.js'

test('display title prefers an explicit title, then cleaned content', () => {
  assert.equal(getDisplayTitle({ title: 'Explicit', content: 'body' }), 'Explicit')
  assert.equal(getDisplayTitle({ title: '  ', content: 'leading content' }), 'leading content')
  assert.equal(getDisplayTitle({ title: '', content: '![cat](/api/images/abc.png)' }), 'cat')
  assert.equal(getDisplayTitle({ title: '', content: '' }), 'Untitled')
  const long = getDisplayTitle({ title: '', content: 'x'.repeat(80) })
  assert.equal(long.endsWith('…'), true)
  assert.equal(long.length, 51)
})

test('cleanContent strips image syntax and data URLs', () => {
  assert.equal(cleanContent('hello ![alt](x) world'), 'hello alt world')
  assert.equal(cleanContent('data:image/png;base64,AAAA'), '')
})

test('markdownToText keeps readable text and drops syntax noise', () => {
  const source = [
    '# Heading',
    '',
    'A [link](https://example.com) and ![alt](/api/images/abc.png).',
    '',
    '- item one',
    '- [x] done',
    '',
    '```js',
    'const keepMe = true',
    '```',
    '',
    'Tags: #project/local-keep and [[Other note|label]]'
  ].join('\n')
  const text = markdownToText(source)
  assert.match(text, /Heading/)
  assert.match(text, /link/)
  assert.match(text, /alt/)
  assert.match(text, /item one/)
  assert.match(text, /done/)
  assert.match(text, /const keepMe = true/)
  assert.match(text, /project\/local-keep/)
  assert.match(text, /label/)
  assert.equal(text.includes('```'), false)
  assert.equal(text.includes('# Heading'), false)
  assert.equal(text.includes('/api/images'), false)
  assert.equal(text.includes('data:image'), false)
})
