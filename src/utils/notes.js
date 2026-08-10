// Display-title derivation utilities for notes.

/**
 * Strip markdown/noise from a content string for display as a title.
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
