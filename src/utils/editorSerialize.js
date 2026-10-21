// Serialise the rich contentEditable surface back to canonical markdown.
// Client-only: the caller supplies a DOM root.

import { normalizeMarkdown } from './markdown.js'

export function serializeEditorToMarkdown(root) {
  if (!root) return ''

  function serializeChildren(node) {
    let out = ''
    for (const child of node.childNodes) out += serialize(child)
    return out
  }

  function serialize(node) {
    if (node.nodeType === 3) return node.textContent
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
      return prefix + serializeChildren(node).trimEnd() + '\n'
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
      const label = node.getAttribute('data-note-label') || serializeChildren(node) || ''
      return noteId ? `[[note:${noteId}|${label}]]` : `[[${label}]]`
    }
    return serializeChildren(node)
  }

  let md = ''
  for (const child of root.childNodes) md += serialize(child)
  return normalizeMarkdown(md)
}
