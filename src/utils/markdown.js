// Client-side markdown rendering, sanitisation, and rich-paste conversion.
// This module uses DOMPurify/Turndown and must only be imported in the browser
// bundle (or in tests after a DOM global has been installed).

import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { transformOutsideCode } from '../shared/markdownCode.js'

export { transformOutsideCode }

const marked = new Marked({ gfm: true, breaks: true })

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, ' ')
}

/**
 * Apply a transform only to text outside fenced code blocks and inline code.
 * The fence/inline segments are preserved verbatim.
 */
function preprocessWidthExtension(markdown) {
  return transformOutsideCode(markdown, text => text.replace(
    /(!\[[^\]]*\]\()([^)]*?)(\))\{width=(\d+)\}/g,
    (_, open, url, close, width) => `${open}${url} "local-keep-width=${width}"${close}`
  ))
}

function renderWikiLinks(markdown, resolveLink) {
  if (typeof resolveLink !== 'function') {
    return { markdown, replacements: [] }
  }
  const replacements = []
  const rendered = transformOutsideCode(markdown, text => text.replace(
    /\[\[([^\]\n]+)\]\]/g,
    (_, inner) => {
      const pipe = inner.indexOf('|')
      const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
      const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim() || target
      let resolved = null
      try { resolved = resolveLink(target, label) } catch (_) { resolved = null }
      if (resolved && resolved.noteId) {
        const pin = resolved.revisionNo != null
          ? ` data-note-revision="${escapeAttr(resolved.revisionNo)}" title="Pinned to v${escapeAttr(resolved.revisionNo)}"`
          : ''
        const html = `<a class="note-link" data-note-id="${escapeAttr(resolved.noteId)}" data-note-target="${escapeAttr(target)}" data-note-label="${escapeAttr(label)}"${pin} href="#">${escapeHtml(label)}</a>`
        const key = `@@LK_WIKI_${replacements.length}@@`
        replacements.push(html)
        return key
      }
      if (resolved && resolved.status === 'broken') {
        const html = `<span class="note-link note-link--broken" data-note-target="${escapeAttr(target)}" data-note-label="${escapeAttr(label)}">${escapeHtml(label)}</span>`
        const key = `@@LK_WIKI_${replacements.length}@@`
        replacements.push(html)
        return key
      }
      return _ // no resolver result: leave the original text
    }
  ))
  return { markdown: rendered, replacements }
}

// Marked's GFM strikethrough tokenizer accepts a single tilde (`~text~`).
// GFM strikethrough requires `~~`, and single tildes are common in file paths
// such as `~/.config`. Consume lone tildes as literal text so they never pair
// across a line and produce a false <del>.
marked.use({
  extensions: [{
    name: 'literalTilde',
    level: 'inline',
    start(src) {
      return src.indexOf('~')
    },
    tokenizer(src) {
      if (!src.startsWith('~') || src.startsWith('~~')) return undefined
      return { type: 'text', raw: '~', text: '~' }
    }
  }]
})

marked.use({
  renderer: {
    image(token) {
      const title = token.title || ''
      const match = String(title).match(/^local-keep-width=(\d+)$/)
      const width = match ? match[1] : null
      const dataMd = `![${token.text || ''}](${token.href || ''})${width ? `{width=${width}}` : ''}`
      const widthAttrs = width ? ` data-width="${width}" width="${width}"` : ''
      return `<img src="${escapeAttr(token.href)}" alt="${escapeAttr(token.text || '')}" data-md="${escapeAttr(dataMd)}"${widthAttrs}>`
    },
    link(token) {
      const href = token.href || ''
      const external = /^https?:\/\//i.test(href)
      const title = token.title ? ` title="${escapeAttr(token.title)}"` : ''
      const target = external ? ' target="_blank" rel="noopener noreferrer"' : ''
      const body = this.parser ? this.parser.parseInline(token.tokens || []) : escapeHtml(token.text || '')
      return `<a href="${escapeAttr(href)}"${title}${target}>${body}</a>`
    },
    html(token) {
      // Existing notes may contain literal <type> placeholders. Preserve them
      // as text rather than interpreting/stripping them as raw HTML.
      return escapeHtml(token.text || token.raw || '')
    },
    code(token) {
      const lang = String(token.lang || '').trim().split(/\s+/)[0]
      if (lang === 'mermaid') {
        // Keep the source as escaped text inside the block. DOMPurify refuses
        // attributes containing `-->` (HTML comment end), which is common in
        // Mermaid syntax, so an attribute is not suitable here.
        return `<div class="mermaid-block"><pre class="mermaid-source">${escapeHtml(token.text || '')}</pre></div>`
      }
      const className = lang ? ` class="language-${escapeAttr(lang)}"` : ''
      return `<pre><code${className}>${escapeHtml(token.text || '')}</code></pre>`
    }
  }
})

const PURIFY_OPTIONS = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  ADD_ATTR: ['data-md', 'data-width', 'data-note-id', 'data-note-target', 'data-note-label', 'data-mermaid', 'target', 'rel'],
  ADD_DATA_URI_TAGS: ['img'],
  ALLOW_UNKNOWN_PROTOCOLS: false
}

/**
 * Render markdown to sanitised HTML.
 * @param {string} markdown
 * @param {{ resolveLink?: (target:string,label:string)=>({noteId?:string,status?:string}|null) }} [opts]
 */
export function renderMarkdown(markdown, opts = {}) {
  let source = preprocessWidthExtension(markdown || '')
  const wiki = renderWikiLinks(source, opts.resolveLink)
  source = wiki.markdown
  let html = marked.parse(source)
  if (wiki.replacements.length > 0) {
    html = html.replace(/@@LK_WIKI_(\d+)@@/g, (_, index) => {
      return wiki.replacements[Number(index)] || ''
    })
  }
  return DOMPurify.sanitize(html, PURIFY_OPTIONS)
}

function wrapElementContents(element, tagName) {
  const document = element.ownerDocument
  const wrapper = document.createElement(tagName)
  while (element.firstChild) wrapper.appendChild(element.firstChild)
  element.appendChild(wrapper)
}

function normalizeInlineStyles(doc) {
  for (const element of doc.querySelectorAll('[style]')) {
    const style = element.getAttribute('style') || ''
    const tag = element.tagName
    const weight = style.match(/font-weight\s*:\s*(bold|[6-9]00)/i)
    const normalWeight = style.match(/font-weight\s*:\s*(normal|400)/i)
    const italic = /font-style\s*:\s*italic/i.test(style)
    const strike = /text-decoration[^;]*line-through/i.test(style)

    if (tag === 'IMG') {
      const width = style.match(/width\s*:\s*(\d+)px/i)
      if (width && !element.getAttribute('width')) element.setAttribute('width', width[1])
    }

    if (normalWeight && (tag === 'B' || tag === 'STRONG')) {
      element.replaceWith(...element.childNodes)
      continue
    }

    element.removeAttribute('style')
    if (weight && tag !== 'B' && tag !== 'STRONG') {
      wrapElementContents(element, 'strong')
    }
    if (italic && tag !== 'I' && tag !== 'EM') {
      wrapElementContents(element, 'em')
    }
    if (strike && tag !== 'S' && tag !== 'DEL' && tag !== 'STRIKE') {
      wrapElementContents(element, 's')
    }
  }
}

function normalizeTables(doc) {
  for (const table of doc.querySelectorAll('table')) {
    let header = table.querySelector('thead')
    if (!header) {
      const firstRow = table.querySelector('tr')
      if (!firstRow) continue
      header = doc.createElement('thead')
      const headerRow = doc.createElement('tr')
      for (const cell of [...firstRow.children]) {
        const th = doc.createElement('th')
        th.innerHTML = cell.innerHTML
        if (cell.getAttribute('colspan')) th.setAttribute('colspan', cell.getAttribute('colspan'))
        if (cell.getAttribute('rowspan')) th.setAttribute('rowspan', cell.getAttribute('rowspan'))
        headerRow.appendChild(th)
      }
      header.appendChild(headerRow)
      table.insertBefore(header, table.firstChild)
      firstRow.remove()
    }
    for (const cell of header.querySelectorAll('td')) {
      const th = doc.createElement('th')
      th.innerHTML = cell.innerHTML
      cell.replaceWith(th)
    }

    // GFM tables cannot express colspan/rowspan. Flatten colspans into empty
    // cells and pad short rows so the table remains aligned.
    const rows = [...table.querySelectorAll('tr')]
    for (const row of rows) {
      const expanded = []
      for (const cell of [...row.children]) {
        const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1)
        cell.removeAttribute('colspan')
        expanded.push(cell)
        for (let index = 1; index < span; index += 1) {
          expanded.push(doc.createElement(cell.tagName.toLowerCase() === 'th' ? 'th' : 'td'))
        }
      }
      row.replaceChildren(...expanded)
    }
    const maxColumns = rows.reduce((max, row) => Math.max(max, row.children.length), 0)
    for (const row of rows) {
      while (row.children.length < maxColumns) {
        row.appendChild(doc.createElement(row.querySelector('th') ? 'th' : 'td'))
      }
    }
  }
}

/**
 * Convert pasted/received HTML to clean markdown.
 *
 * Turndown + GFM handles common structure. The DOM is normalised first for
 * Google Docs/Word markup and inline styles, and tables without a thead are
 * promoted to a header row. Unsupported presentation (underline, highlight,
 * colours, super/subscript) becomes plain text because markdown has no
 * equivalent and the renderer escapes raw HTML.
 */
export function htmlToMarkdown(html) {
  const source = String(html || '')
  if (!source.trim()) return ''

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(source, 'text/html')
  for (const node of doc.querySelectorAll('script, style, meta, link, iframe, object, embed')) {
    node.remove()
  }
  normalizeInlineStyles(doc)
  normalizeTables(doc)

  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })
  turndown.use(gfm)
  turndown.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: content => `~~${content}~~`
  })
  turndown.addRule('fencedPre', {
    filter: node => node.nodeName === 'PRE' && !node.querySelector('code'),
    replacement: (content, node) => {
      const text = (node.textContent || '').replace(/\n$/, '')
      return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`
    }
  })
  turndown.addRule('imageWidth', {
    filter: node => node.nodeName === 'IMG' && /^\d+$/.test(node.getAttribute('width') || ''),
    replacement: (content, node) => {
      const rawSrc = node.getAttribute('src') || ''
      const src = /\s/.test(rawSrc) ? `<${rawSrc}>` : rawSrc
      const alt = (node.getAttribute('alt') || '').replace(/\]/g, '\\]')
      const width = node.getAttribute('width')
      return `![${alt}](${src}){width=${width}}`
    }
  })

  let markdown = turndown.turndown(doc.body)
  markdown = markdown
    .replace(/^(\s*)([-*+])\s{2,}/gm, '$1$2 ')
    .replace(/^(\s*)(\d+\.)\s{2,}/gm, '$1$2 ')
    .replace(
      /^(\s*[-*+]\s+)\[([ xX]?)\]\s+/gm,
      (_, prefix, checked) => `${prefix}[${checked.toLowerCase() === 'x' ? 'x' : ' '}] `
    )
  return normalizeMarkdown(markdown)
}

/**
 * Normalise line endings and blank-line runs without touching code indentation.
 */
export function normalizeMarkdown(markdown) {
  return String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

export function normalizePlainText(text) {
  return normalizeMarkdown(String(text ?? ''))
}
