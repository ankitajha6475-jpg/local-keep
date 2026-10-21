import { markdownToText } from '../shared/notesText.js'

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

export function indexNote(db, { noteId, title, content, canvasText }) {
  db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId)
  db.prepare(
    'INSERT INTO notes_fts(note_id, title, content, canvas_text) VALUES (?, ?, ?, ?)'
  ).run(noteId, title || '', markdownToText(content || ''), canvasText || '')
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
      markdownToText(note.content || ''),
      extractCanvasText(note.canvasData)
    )
  }
  return notes.length
}
