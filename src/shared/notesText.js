// Shared note-text utilities used by both the browser bundle and the server.
// This module MUST stay free of DOM/browser APIs.

/**
 * Strip markdown/noise from a content string for display.
 * - Replaces ![alt](url) image syntax with `alt` (or empty when no alt)
 * - Strips data: URLs
 * - Collapses whitespace runs to a single space
 * - Trims leading/trailing whitespace
 * @param {string} content
 * @returns {string}
 */
export function cleanContent(content) {
  if (!content) return ''
  let s = String(content)
  // Replace markdown image syntax with its alt text (or empty if no alt)
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || '')
  // Strip any remaining data: URLs (long base64 blobs)
  s = s.replace(/data:[^\s)]+/g, '')
  // Collapse whitespace (incl. newlines) to single spaces and trim
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Convert markdown to a readable plain-text approximation for FTS/excerpts.
 * Keeps the text inside code blocks (useful for search) but removes fences and
 * formatting syntax. This is deliberately lossy and regex-based; the client
 * renderer is authoritative for display.
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToText(markdown) {
  if (!markdown) return ''
  let s = String(markdown)

  // Fenced code blocks: keep the code, drop the fence lines and language tag.
  s = s.replace(/^[ \t]*```[^\n]*\n?/gm, '')
  s = s.replace(/^[ \t]*~~~[^\n]*\n?/gm, '')

  // Images -> alt text
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)(?:\{width=\d+\})?/g, (_, alt) => alt || '')
  // Links -> label
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Wiki links -> label / target
  s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_, inner) => {
    const pipe = inner.indexOf('|')
    return (pipe === -1 ? inner : inner.slice(pipe + 1)).trim()
  })
  // HTML tags
  s = s.replace(/<[^>]+>/g, ' ')
  // Headings / blockquotes
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
  s = s.replace(/^[ \t]*>[ \t]?/gm, '')
  // List markers / task checkboxes
  s = s.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '')
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, '')
  s = s.replace(/^[ \t]*\d+\.[ \t]+/gm, '')
  // Emphasis / strikethrough / inline code markers
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2')
  s = s.replace(/(\*|_)(.*?)\1/g, '$2')
  s = s.replace(/~~(.*?)~~/g, '$1')
  s = s.replace(/`([^`]*)`/g, '$1')
  // Tags keep their readable text (without the # marker)
  s = s.replace(/(^|[\s(（\[{>])#([\p{L}][\p{L}\p{N}_/-]*)/gu, '$1$2')

  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Derive the display title for a note.
 *   1. The note's stored `title` (when non-empty after trimming)
 *   2. Otherwise, the leading ~50 characters of cleanContent(content)
 *      (with an ellipsis only when truncated)
 *   3. Otherwise, the localized fallback "Untitled"
 *
 * @param {{ title?: string, content?: string }} note
 * @param {object} [opts]
 * @param {number} [opts.maxLen=50]
 * @param {string} [opts.fallback='Untitled']
 * @returns {string}
 */
export function getDisplayTitle(note, opts = {}) {
  const { maxLen = 50, fallback = 'Untitled' } = opts
  if (!note) return fallback
  const title = (note.title || '').trim()
  if (title) return title
  const cleaned = cleanContent(note.content || '')
  if (!cleaned) return fallback
  if (cleaned.length > maxLen) return cleaned.slice(0, maxLen) + '…'
  return cleaned
}

export function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
