// Build canonical markdown for the link dialog results.

export function buildMarkdownLink({ text, url }) {
  const label = String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
  return `[${label}](${String(url || '').trim()})`
}

export function buildWikiLink({ target, label }) {
  const title = String(target?.title || '').trim()
  const resolvedLabel = String(label || title).trim() || title
  if (target?.noteId) {
    return `[[note:${target.noteId}|${resolvedLabel}]]`
  }
  return resolvedLabel !== title
    ? `[[${title}|${resolvedLabel}]]`
    : `[[${title}]]`
}

export function buildLinkMarkdown(payload) {
  if (!payload) return ''
  if (payload.mode === 'link') return buildMarkdownLink(payload)
  return buildWikiLink(payload)
}
