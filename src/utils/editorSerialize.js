// Serialise the rich contentEditable surface back to canonical markdown.
// Client-only: the caller supplies a DOM root.

import { normalizeMarkdown } from './markdown.js'

// Block-level elements in rendered markdown. Whitespace-only text nodes that sit
// between these are insignificant in HTML but would become real blank lines in
// the serialised markdown, so they must be dropped for a faithful round-trip.
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR'
])

function isBlockNode(node) {
  return !!node && node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)
}

export function serializeEditorToMarkdown(root) {
  if (!root) return ''

  function serializeChildren(node) {
    let out = ''
    for (const child of node.childNodes) out += serialize(child)
    return out
  }

  function serialize(node) {
    if (node.nodeType === 3) {
      const text = node.textContent
      // Drop whitespace-only text nodes that lie between block-level elements:
      // marked emits "\n" separators there which must not become blank lines.
      if (/^\s*$/.test(text) && (isBlockNode(node.previousSibling) || isBlockNode(node.nextSibling))) {
        return ''
      }
      return text
    }
    if (node.nodeType !== 1) return ''
    const tag = node.tagName

    if (tag === 'IMG') {
      const md = node.getAttribute('data-md') || `![${node.alt || 'image'}](${node.getAttribute('src') || ''})`
      const w = node.getAttribute('data-width')
      return w ? md.replace(/\{width=\d+\}$/, '') + `{width=${w}}` : md
    }
    if (tag === 'BR') return '\n'
    if (tag === 'HR') return '\n---\n'
    if (tag === 'P') return serializeChildren(node) + '\n\n'
    if (tag === 'DIV' && node.classList && node.classList.contains('mermaid-block')) {
      const source = node.querySelector('.mermaid-source')?.textContent || ''
      return `\n\`\`\`mermaid\n${source.replace(/\n$/, '')}\n\`\`\`\n\n`
    }
    if (tag === 'DIV') return serializeChildren(node) + '\n'
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1))
      return `${'#'.repeat(level)} ${serializeChildren(node).trim()}\n\n`
    }
    if (tag === 'UL' || tag === 'OL') {
      return serializeChildren(node) + '\n'
    }
    if (tag === 'LI') {
      const parent = node.parentNode
      const ordered = parent && parent.tagName === 'OL'
      const index = parent
        ? Array.prototype.indexOf.call(parent.children, node) + 1
        : 1
      const prefix = ordered ? `${index}. ` : '- '
      const content = serializeChildren(node).trimEnd()
      // Loose-list items (marked wraps them in <p>) are separated by a blank
      // line; tight items sit on consecutive lines. Preserving this keeps the
      // markdown byte-identical across Visual↔Source round-trips.
      const loose = Array.prototype.some.call(node.children, child => child.tagName === 'P')
      return prefix + content + (loose ? '\n\n' : '\n')
    }
    if (tag === 'BLOCKQUOTE') {
      const inner = serializeChildren(node).trimEnd()
      return inner.split('\n').map(line => `> ${line}`).join('\n') + '\n\n'
    }
    if (tag === 'PRE') {
      const code = node.querySelector('code')
      const className = code ? code.className || '' : ''
      const langMatch = className.match(/language-([\w-]+)/)
      const lang = langMatch ? langMatch[1] : ''
      const text = (code ? code.textContent : node.textContent) || ''
      return `\n\`\`\`${lang}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`
    }
    if (tag === 'CODE') {
      const text = node.textContent || ''
      const ticks = text.includes('`') ? '``' : '`'
      return `${ticks}${text}${ticks}`
    }
    if (tag === 'TABLE') {
      const rows = [...node.querySelectorAll('tr')].map(tr =>
        [...tr.children].map(cell => serializeChildren(cell).replace(/\s+/g, ' ').trim())
      )
      if (rows.length === 0) return ''
      const header = rows[0]
      const body = rows.slice(1)
      const sep = header.map(() => '---')
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${sep.join(' | ')} |`,
        ...body.map(row => `| ${row.join(' | ')} |`)
      ]
      return lines.join('\n') + '\n\n'
    }
    if (tag === 'B' || tag === 'STRONG') {
      return `**${serializeChildren(node)}**`
    }
    if (tag === 'I' || tag === 'EM') {
      return `*${serializeChildren(node)}*`
    }
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') {
      return `~~${serializeChildren(node)}~~`
    }
    if (tag === 'A') {
      const noteId = node.getAttribute('data-note-id')
      const inner = serializeChildren(node)
      if (noteId) return `[[note:${noteId}|${inner}]]`
      const href = node.getAttribute('href') || ''
      if (!href || href === '#') return inner
      return `[${inner}](${href})`
    }
    if (tag === 'SPAN' && node.classList && node.classList.contains('note-link')) {
      const noteId = node.getAttribute('data-note-id')
      const target = node.getAttribute('data-note-target') ||
        node.getAttribute('data-note-label') ||
        serializeChildren(node) || ''
      const label = node.getAttribute('data-note-label') ||
        serializeChildren(node) || target
      if (noteId) return `[[note:${noteId}|${label}]]`
      return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`
    }
    return serializeChildren(node)
  }

  let md = ''
  for (const child of root.childNodes) md += serialize(child)
  return normalizeMarkdown(md)
}
