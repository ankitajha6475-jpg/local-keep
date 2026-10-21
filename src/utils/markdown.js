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
        const html = `<a class="note-link" data-note-id="${escapeAttr(resolved.noteId)}" data-note-label="${escapeAttr(label)}" href="#">${escapeHtml(label)}</a>`
        const key = `@@LK_WIKI_${replacements.length}@@`
        replacements.push(html)
        return key
      }
      if (resolved && resolved.status === 'broken') {
        const html = `<span class="note-link note-link--broken" data-note-label="${escapeAttr(label)}">${escapeHtml(label)}</span>`
        const key = `@@LK_WIKI_${replacements.length}@@`
        replacements.push(html)
        return key
      }
      return _ // no resolver result: leave the original text
    }
  ))
  return { markdown: rendered, replacements }
}

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
    }
  }
})

const PURIFY_OPTIONS = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  ADD_ATTR: ['data-md', 'data-width', 'data-note-id', 'data-note-label', 'target', 'rel'],
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

/**
 * Convert pasted/received HTML to clean markdown.
 */
export function htmlToMarkdown(html) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  })
  turndown.use(gfm)
  turndown.remove(['script', 'style', 'meta', 'link', 'iframe', 'object', 'embed'])
  return normalizeMarkdown(turndown.turndown(String(html || '')))
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
