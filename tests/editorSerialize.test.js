import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Node = dom.window.Node
globalThis.Element = dom.window.Element
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLDocument = dom.window.HTMLDocument

const { serializeEditorToMarkdown } = await import('../src/utils/editorSerialize.js')

function serialize(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  return serializeEditorToMarkdown(root)
}

test('serializes headings, paragraphs, and emphasis', () => {
  const md = serialize('<h2>Title</h2><p>Hello <strong>bold</strong> and <em>italic</em>.</p>')
  assert.match(md, /^## Title/m)
  assert.match(md, /\*\*bold\*\*/)
  assert.match(md, /\*italic\*/)
})

test('serializes unordered and ordered lists', () => {
  const md = serialize('<ul><li>One</li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol>')
  assert.match(md, /^- One$/m)
  assert.match(md, /^- Two$/m)
  assert.match(md, /^1\. First$/m)
  assert.match(md, /^2\. Second$/m)
})

test('serializes blockquotes and code', () => {
  const md = serialize([
    '<blockquote><p>quoted</p></blockquote>',
    '<pre><code class="language-js">const x = 1</code></pre>',
    '<p>inline <code>x</code></p>'
  ].join(''))
  assert.match(md, /^> quoted$/m)
  assert.match(md, /```js\nconst x = 1\n```/)
  assert.match(md, /`x`/)
})

test('serializes images with width and wiki links', () => {
  const md = serialize([
    '<p><img src="/api/images/a.png" alt="cat" data-md="![cat](/api/images/a.png){width=320}" data-width="320"></p>',
    '<p><a class="note-link" data-note-id="n1" data-note-target="Other" data-note-label="Other" href="#">Other</a></p>',
    '<p><span class="note-link note-link--broken" data-note-target="Missing" data-note-label="Missing">Missing</span></p>',
    '<p><span class="note-link note-link--broken" data-note-target="Missing note" data-note-label="alias">alias</span></p>'
  ].join(''))
  assert.match(md, /!\[cat\]\(\/api\/images\/a.png\)\{width=320\}/)
  assert.match(md, /\[\[note:n1\|Other\]\]/)
  assert.match(md, /\[\[Missing\]\]/)
  assert.match(md, /\[\[Missing note\|alias\]\]/)
})

test('serializes a simple table', () => {
  const md = serialize('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')
  assert.match(md, /\| A \| B \|/)
  assert.match(md, /\| --- \| --- \|/)
  assert.match(md, /\| 1 \| 2 \|/)
})

test('serializes rendered mermaid blocks back to a mermaid fence', () => {
  const md = serialize('<div class="mermaid-block"><pre class="mermaid-source">graph TD\nA--&gt;B</pre><div class="mermaid-diagram"><svg></svg></div></div>')
  assert.match(md, /```mermaid/)
  assert.match(md, /graph TD/)
  assert.match(md, /A-->B/)
  assert.equal(md.includes('<svg'), false)
})
