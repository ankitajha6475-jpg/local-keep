// Compatibility re-export. The shared implementation lives in src/shared so
// the server can use the same display-title/markdown-text rules.
export { cleanContent, markdownToText, getDisplayTitle, normalizeWhitespace } from '../shared/notesText.js'
