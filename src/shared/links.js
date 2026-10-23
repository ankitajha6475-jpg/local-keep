import { transformOutsideCode } from './markdownCode.js'

export const MAX_LINK_LENGTH = 200
export const MAX_LINKS_PER_NOTE = 200

export function normalizeLinkTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse wiki links outside fenced/inline code.
 * @param {string} text
 * @returns {{raw:string,target:string,label:string,kind:'title'|'id',revision:number|null}[]}
 */
export function parseWikiLinks(text) {
  const links = []
  const source = String(text || '')
  if (!source) return links

  transformOutsideCode(source, segment => {
    const regex = /\[\[([^\]\n]+)\]\]/g
    let match
    while ((match = regex.exec(segment)) !== null) {
      const inner = match[1]
      const pipe = inner.indexOf('|')
      const targetRaw = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
      const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim() || targetRaw
      if (!targetRaw || targetRaw.length > MAX_LINK_LENGTH) continue
      const explicit = targetRaw.startsWith('note:')
      let target = explicit ? targetRaw.slice(5).trim() : targetRaw
      // Explicit version pin: [[note:<id>@<rev>]] pins a specific revision.
      let revision = null
      if (explicit) {
        const at = target.lastIndexOf('@')
        if (at > 0) {
          const revStr = target.slice(at + 1).trim()
          if (/^\d+$/.test(revStr)) {
            revision = Number(revStr)
            target = target.slice(0, at).trim()
          }
        }
      }
      if (!target) continue
      links.push({
        raw: match[0],
        target,
        label,
        kind: explicit ? 'id' : 'title',
        revision
      })
      if (links.length >= MAX_LINKS_PER_NOTE) break
    }
    return segment
  })

  return links.slice(0, MAX_LINKS_PER_NOTE)
}
