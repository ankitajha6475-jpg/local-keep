import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// Install a DOM before importing the browser-only renderer.
const dom = new JSDOM('')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Node = dom.window.Node
globalThis.Element = dom.window.Element
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLDocument = dom.window.HTMLDocument

const {
  renderMarkdown,
  htmlToMarkdown,
  normalizeMarkdown,
  transformOutsideCode
} = await import('../src/utils/markdown.js')
const { serializeEditorToMarkdown } = await import('../src/utils/editorSerialize.js')

test('renderMarkdown renders common markdown with GFM', () => {
  const html = renderMarkdown([
    '# Heading',
    '',
    'A **bold** and *italic* [link](https://example.com).',
    '',
    '- one',
    '- two',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1',
    '```'
  ].join('\n'))

  assert.match(html, /<h1[^>]*>Heading<\/h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<em>italic<\/em>/)
  assert.match(html, /<a href="https:\/\/example.com"[^>]*>link<\/a>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<table>/)
  assert.match(html, /<pre><code/)
})

test('single tildes in paths stay literal while double tildes strike through', () => {
  const html = renderMarkdown([
    '"~/.claude/settings.json": false,',
    '"~/.github/hooks": true,',
    '',
    '~~done~~',
    '',
    '~not struck~'
  ].join('\n'))

  assert.equal(html.includes('<del>/.claude'), false)
  assert.match(html, /~\/\.claude\/settings\.json/)
  assert.match(html, /<del>done<\/del>/)
  assert.equal(html.includes('<del>not struck</del>'), false)
  assert.match(html, /~not struck~/)
})

test('rendering and serialising a path with tildes does not create strikethrough', () => {
  const content = '"~/.claude/settings.json": false,\n"~/.github/hooks": true'
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(content)
  const serialized = serializeEditorToMarkdown(root)
  assert.equal(serialized.includes('~~'), false)
  assert.match(serialized, /~\/\.claude\/settings\.json/)
  assert.match(serialized, /~\/\.github\/hooks/)
})

test('mermaid fences become a hydratable placeholder', () => {
  const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```')
  assert.match(html, /class="mermaid-block"/)
  assert.match(html, /class="mermaid-source"/)
  assert.match(html, /graph TD/)
  assert.match(html, /A--&gt;B/)
  assert.equal(html.includes('<svg'), false)
})

test('renderMarkdown preserves the width extension and data-md', () => {
  const html = renderMarkdown('![cat](/api/images/abc.png){width=320}')
  assert.match(html, /src="\/api\/images\/abc.png"/)
  assert.match(html, /data-md="!\[cat\]\(\/api\/images\/abc.png\)\{width=320\}"/)
  assert.match(html, /data-width="320"/)
  assert.match(html, /width="320"/)
})

test('renderMarkdown sanitises scripts, styles, iframes, and handlers', () => {
  const html = renderMarkdown([
    '<script>alert(1)</script>',
    '<style>body{display:none}</style>',
    '<iframe src="https://evil.example"></iframe>',
    '<img src="x" onerror="alert(1)">',
    '<p style="color:red">safe text</p>'
  ].join('\n\n'))

  assert.equal(/<script/i.test(html), false)
  assert.equal(/<style/i.test(html), false)
  assert.equal(/<iframe/i.test(html), false)
  assert.equal(/<img[^>]*onerror/i.test(html), false)
  assert.equal(/<[^>]*style=/i.test(html), false)
  assert.match(html, /safe text/)
})

test('wiki links use the resolver and stay literal in code', () => {
  const resolver = (target) => {
    if (target === 'Other') return { noteId: 'n1', status: 'ok' }
    return { noteId: null, status: 'broken' }
  }
  const html = renderMarkdown('See [[Other]] and [[Missing]].\n\n`[[Other]]`\n\n```\n[[Other]]\n```', { resolveLink: resolver })
  assert.match(html, /class="note-link" data-note-id="n1"/)
  assert.match(html, /note-link--broken/)
  assert.match(html, /<code>\[\[Other\]\]<\/code>/)
  assert.match(html, /<pre><code>\[\[Other\]\]/)
})

test('htmlToMarkdown handles common rich structures and normalises spans', () => {
  const markdown = htmlToMarkdown([
    '<h2>Title</h2>',
    '<p>Hello <s>gone</s> <span style="font-weight:700">bold style</span> <span style="font-style:italic">italic style</span></p>',
    '<table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>',
    '<table><tr><th colspan="2">Header</th></tr><tr><td>A</td><td>B</td></tr></table>',
    '<pre>line 1\n  indented</pre>',
    '<ul><li><input type="checkbox" checked> Done</li></ul>',
    '<b style="font-weight:normal"><p>Docs normal wrapper</p></b>',
    '<img src="/a.png" alt="A" style="width: 320px">'
  ].join(''))

  assert.match(markdown, /^## Title/m)
  assert.match(markdown, /~~gone~~/)
  assert.match(markdown, /\*\*bold style\*\*/)
  assert.match(markdown, /\*italic style\*/)
  assert.match(markdown, /\| A \| 1 \|/)
  assert.match(markdown, /\| Header \|  \|/)
  assert.match(markdown, /```\nline 1\n  indented\n```/)
  assert.match(markdown, /- \[x\] Done/)
  assert.match(markdown, /Docs normal wrapper/)
  assert.equal(markdown.includes('**\n\nDocs'), false)
  assert.match(markdown, /!\[A\]\(\/a\.png\)\{width=320\}/)
})

test('htmlToMarkdown strips rich context and keeps semantics', () => {
  const html = [
    '<style>.x{color:red}</style>',
    '<h1 class="x">Title</h1>',
    '<p><strong>Bold</strong> and <a href="https://example.com">link</a></p>',
    '<ul><li>One</li><li>Two</li></ul>',
    '<script>alert(1)</script>'
  ].join('')
  const markdown = htmlToMarkdown(html)
  assert.match(markdown, /^# Title/m)
  assert.match(markdown, /\*\*Bold\*\*/)
  assert.match(markdown, /\[link\]\(https:\/\/example.com\)/)
  assert.match(markdown, /-\s+One/)
  assert.equal(markdown.includes('<style'), false)
  assert.equal(markdown.includes('<script'), false)
  assert.equal(markdown.includes('class='), false)
})

test('transformOutsideCode leaves fenced and inline code untouched', () => {
  const seen = []
  const out = transformOutsideCode('a `code` b\n```\nfenced\n```\nc', segment => {
    seen.push(segment)
    return segment.toUpperCase()
  })
  assert.equal(out, 'A `code` B\n```\nfenced\n```\nC')
  assert.deepEqual(seen, ['a ', ' b', 'c'])
})

test('normalizeMarkdown collapses blank runs and trims edges', () => {
  assert.equal(normalizeMarkdown('\r\n\r\na\r\n\r\n\r\nb\r\n'), 'a\n\nb')
})

test('renderMarkdown strips exactly one leading properties fence', () => {
  const html = renderMarkdown('---\ntags: [project/alpha]\nstatus: active\n---\n# Heading\n\nbody')
  assert.match(html, /<h1[^>]*>Heading<\/h1>/)
  assert.match(html, /<p[^>]*>body<\/p>/)
  assert.equal(html.includes('tags:'), false, 'fence text never renders')
  assert.equal(html.includes('status:'), false, 'fence keys never render')
})

test('body hash text is a heading or literal text, never a tag', () => {
  const html = renderMarkdown('#project/alpha\n\n# Heading')
  assert.equal(html.includes('note-tag'), false)
  assert.match(html, /<h1[^>]*>Heading<\/h1>/)
})

test('a note without a fence renders entirely as body', () => {
  const html = renderMarkdown('# Heading\n\ntext')
  assert.match(html, /<h1[^>]*>Heading<\/h1>/)
  assert.match(html, /<p[^>]*>text<\/p>/)
})
