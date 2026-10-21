import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTags, normalizeTag, tagAncestors, tagMatchesPrefix } from '../src/shared/tags.js'
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
