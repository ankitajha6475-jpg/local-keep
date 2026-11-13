import { markdownToText } from '../shared/notesText.js'
import { parseNoteContent } from '../shared/noteMeta.js'

/** Extract text from canvasData JSON for FTS indexing. */
export function extractCanvasText(canvasData) {
  if (!canvasData) return ''
  try {
    const data = typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
    const elements = data.elements || []
    return elements
      .filter(el => el.type === 'text' && !el.isDeleted)
      .map(el => el.text || '')
      .join(' ')
  } catch (_) {
    return ''
  }
}

/**
 * Indexable text for a note: the body with the properties fence stripped, plus
 * the tag paths (which no longer live in the body, so they would otherwise drop
 * out of keyword search). Fence keys and values are never searchable prose.
 */
export function noteIndexText(content) {
  const { body, props } = parseNoteContent(content)
  const tags = Array.isArray(props.tags) ? props.tags : []
  let bodyText = ''
  try {
    const trimmed = (body || '').trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed)
      if (parsed && Array.isArray(parsed.messages)) {
        bodyText = parsed.messages
          .map(m => `${m.senderName || m.sender || ''}: ${m.text || ''}`)
          .join('\n')
      } else if (parsed && Array.isArray(parsed.cards)) {
        bodyText = parsed.cards
          .map(c => `${c.title || ''}\n${c.description || ''}`)
          .join('\n')
      } else {
        bodyText = markdownToText(body)
      }
    } else {
      bodyText = markdownToText(body)
    }
  } catch (_) {
    bodyText = markdownToText(body)
  }
  return `${bodyText}\n${tags.join('\n')}`.trim()
}

export function indexNote(db, { noteId, title, content, canvasText }) {
  db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId)
  db.prepare(
    'INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)'
  ).run(noteId, title || '', noteIndexText(content || ''), canvasText || '')
}

export function removeNoteFromIndex(db, noteId) {
  try { db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId) } catch (_) { /* noop */ }
}

export function rebuildFts(db) {
  db.exec('DELETE FROM notes_fts')
  const notes = db.prepare('SELECT id, title, content, canvasData FROM notes').all()
  const insert = db.prepare(
    'INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)'
  )
  for (const note of notes) {
    insert.run(
      note.id,
      note.title || '',
      noteIndexText(note.content || ''),
      extractCanvasText(note.canvasData)
    )
  }
  return notes.length
}
