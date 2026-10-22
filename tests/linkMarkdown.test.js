import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLinkMarkdown, buildMarkdownLink, buildWikiLink } from '../src/shared/linkMarkdown.js'

test('builds a standard markdown link and escapes the label', () => {
  assert.equal(
    buildMarkdownLink({ text: 'Docs', url: ' https://example.com ' }),
    '[Docs](https://example.com)'
  )
  assert.equal(
    buildMarkdownLink({ text: 'a]b', url: 'https://example.com' }),
    '[a\\]b](https://example.com)'
  )
})

test('builds stable wiki links with note ids and labels', () => {
  assert.equal(
    buildWikiLink({ target: { noteId: 'n1', title: 'Alpha' }, label: 'Alpha' }),
    '[[note:n1|Alpha]]'
  )
  assert.equal(
    buildWikiLink({ target: { noteId: 'n1', title: 'Alpha' }, label: 'read this' }),
    '[[note:n1|read this]]'
  )
})

test('builds title wiki links and preserves aliases', () => {
  assert.equal(
    buildWikiLink({ target: { title: 'New note' }, label: 'New note' }),
    '[[New note]]'
  )
  assert.equal(
    buildWikiLink({ target: { title: 'New note' }, label: 'alias' }),
    '[[New note|alias]]'
  )
})

test('dispatches link dialog payloads by mode', () => {
  assert.equal(
    buildLinkMarkdown({ mode: 'link', text: 'Site', url: 'https://example.com' }),
    '[Site](https://example.com)'
  )
  assert.equal(
    buildLinkMarkdown({ mode: 'wiki', target: { noteId: 'n2', title: 'Beta' }, label: 'Beta' }),
    '[[note:n2|Beta]]'
  )
})
