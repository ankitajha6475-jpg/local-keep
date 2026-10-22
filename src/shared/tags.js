import { transformOutsideCode } from './markdownCode.js'

export const MAX_TAG_LENGTH = 64
export const MAX_TAGS_PER_NOTE = 100

/**
 * Normalise a tag path: NFKC, lowercase, collapse duplicate separators, trim.
 * The leading '#' is optional in the input.
 */
export function normalizeTag(raw) {
  let value = String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/^#+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  if (value.length > MAX_TAG_LENGTH) value = value.slice(0, MAX_TAG_LENGTH)
  return value
}

export function tagAncestors(tag) {
  const parts = normalizeTag(tag).split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function tagMatchesPrefix(tag, prefix, { exact = false } = {}) {
  const normalized = normalizeTag(tag)
  const wanted = normalizeTag(prefix)
  if (!wanted) return true
  if (exact) return normalized === wanted
  return normalized === wanted || normalized.startsWith(wanted + '/')
}

/**
 * Parse inline tags outside fenced/inline code.
 * @param {string} text
 * @returns {string[]} unique normalised tag paths, capped
 */
export function parseTags(text) {
  const found = new Set()
  const source = String(text || '')
  if (!source) return []

  transformOutsideCode(source, segment => {
    const regex = /(?<![A-Za-z0-9_/])#([\p{L}][\p{L}\p{N}_/-]*)/gu
    let match
    while ((match = regex.exec(segment)) !== null) {
      const body = match[1].replace(/[/-]+$/, '')
      if (!body) continue
      // Reject CSS hex colours (3/4/6/8 hex chars) such as #e2ece4.
      if (/^[0-9a-f]{3,8}$/i.test(body)) continue
      const tag = normalizeTag(body)
      if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue
      found.add(tag)
      if (found.size >= MAX_TAGS_PER_NOTE) break
    }
    return segment
  })

  return [...found].slice(0, MAX_TAGS_PER_NOTE)
}

function canonicalTag(raw) {
  return normalizeTag(raw).replace(/[/-]+$/, '')
}

export function isValidTag(raw) {
  const tag = canonicalTag(raw)
  if (!tag || tag.length > MAX_TAG_LENGTH) return false
  if (/^[0-9a-f]{3,8}$/i.test(tag)) return false
  return /^[\p{L}][\p{L}\p{N}_/-]*$/u.test(tag)
}

/**
 * Add inline tags to markdown content without touching code blocks.
 * Returns the new content plus the tags that were actually added.
 */
export function addTagsToContent(content, tags = []) {
  const source = String(content ?? '')
  const normalized = []
  for (const raw of tags) {
    if (!isValidTag(raw)) continue
    const tag = canonicalTag(raw)
    if (!normalized.includes(tag)) normalized.push(tag)
  }

  const existing = new Set(parseTags(source))
  const additions = normalized.filter(tag => !existing.has(tag))
  if (additions.length === 0) {
    return { content: source, added: [], existing: [...existing] }
  }
  if (existing.size + additions.length > MAX_TAGS_PER_NOTE) {
    throw new Error(`A note can have at most ${MAX_TAGS_PER_NOTE} tags`)
  }

  const line = additions.map(tag => `#${tag}`).join(' ')
  const base = source
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '')

  // Prefer a trailing tag paragraph. If the note ends inside an unclosed
  // fence, the parser will not see it, so fall back to a leading tag line.
  let next = base ? `${base}\n\n${line}` : line
  const found = new Set(parseTags(next))
  if (!additions.every(tag => found.has(tag))) {
    next = base ? `${line}\n\n${base}` : line
  }

  return { content: next, added: additions, existing: [...existing] }
}

/**
 * Remove exact inline tags outside code blocks. Hierarchical tags are only
 * removed when the full path matches, so removing `area` leaves
 * `area/project` untouched.
 */
export function removeTagsFromContent(content, tags = []) {
  const source = String(content ?? '')
  const wanted = new Set()
  for (const raw of tags) {
    if (!isValidTag(raw)) continue
    wanted.add(canonicalTag(raw))
  }
  if (wanted.size === 0) return { content: source, removed: [] }

  const before = new Set(parseTags(source))
  const removed = [...wanted].filter(tag => before.has(tag))
  if (removed.length === 0) return { content: source, removed: [] }

  let next = transformOutsideCode(source, segment => {
    return segment
      .replace(/(?<![A-Za-z0-9_/])#([\p{L}][\p{L}\p{N}_/-]*)/gu, (match, body) => {
        const clean = body.replace(/[/-]+$/, '')
        return wanted.has(normalizeTag(clean)) ? '' : match
      })
      .replace(/[ \t]{2,}/g, ' ')
  })

  next = next
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+|\n+$/g, '')
  if (!next.trim()) next = ''

  return { content: next, removed }
}
