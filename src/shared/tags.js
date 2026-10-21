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
