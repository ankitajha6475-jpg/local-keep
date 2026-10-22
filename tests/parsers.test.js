import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTags,
  normalizeTag,
  tagAncestors,
  tagMatchesPrefix,
  isValidTag,
  addTagsToContent,
  removeTagsFromContent
} from '../src/shared/tags.js'
import { parseWikiLinks, normalizeLinkTitle } from '../src/shared/links.js'

test('parseTags extracts hierarchical tags and ignores code/colours', () => {
  const tags = parseTags([
    'Tags: #project/local-keep and #项目/设计.',
    '',
    '`#inline-code`',
    '```',
    '#fenced',
    '```',
    'CSS #e2ece4 and URL https://x.test/#frag and foo#bar',
    '#project/local-keep'
  ].join('\n'))
  assert.deepEqual(tags.sort(), ['project/local-keep', '项目/设计'].sort())
})

test('tag normalisation and hierarchy helpers', () => {
  assert.equal(normalizeTag('  ##Project//Local-Keep/ '), 'project/local-keep')
  assert.deepEqual(tagAncestors('a/b/c'), ['a', 'a/b', 'a/b/c'])
  assert.equal(tagMatchesPrefix('project/local-keep', 'project'), true)
  assert.equal(tagMatchesPrefix('project/local-keep', 'project', { exact: true }), false)
  assert.equal(tagMatchesPrefix('project/local/design', 'project/local'), true)
})

test('tag editing helpers add and remove tags without touching code', () => {
  assert.equal(isValidTag('#Project/Local'), true)
  assert.equal(isValidTag('#e2ece4'), false)
  assert.equal(isValidTag(''), false)

  const added = addTagsToContent('Body\n\n```\n#code\n```', ['#Project/Local', 'project/local', 'bad tag'])
  assert.equal(added.added.length, 1)
  assert.equal(added.added[0], 'project/local')
  assert.deepEqual(parseTags(added.content), ['project/local'])
  assert.match(added.content, /```\n#code\n```/)
  assert.match(added.content, /#project\/local$/)

  const unchanged = addTagsToContent(added.content, ['project/local'])
  assert.deepEqual(unchanged.added, [])
  assert.equal(unchanged.content, added.content)

  const removed = removeTagsFromContent('See #project/local and #project/local/design.\n\n```\n#project/local\n```', ['project/local'])
  assert.deepEqual(removed.removed, ['project/local'])
  assert.equal(removed.content, 'See and #project/local/design.\n\n```\n#project/local\n```')

  const leadingFence = addTagsToContent('```\n#code\nunclosed', ['tag'])
  assert.deepEqual(parseTags(leadingFence.content), ['tag'])
  assert.match(leadingFence.content, /^#tag\n\n```/)
})

test('parseWikiLinks handles labels, explicit ids, and code', () => {
  const links = parseWikiLinks([
    'See [[Another note]] and [[Another note|details]] plus [[note:n1|Stable]].',
    '`[[Inline code]]`',
    '```',
    '[[Fenced code]]',
    '```'
  ].join('\n'))
  assert.equal(links.length, 3)
  assert.deepEqual(links[0], { raw: '[[Another note]]', target: 'Another note', label: 'Another note', kind: 'title' })
  assert.equal(links[1].label, 'details')
  assert.equal(links[2].kind, 'id')
  assert.equal(links[2].target, 'n1')
  assert.equal(normalizeLinkTitle('  A   Note '), 'a note')
})
