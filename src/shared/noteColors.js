/**
 * Dashboard note tints. `null` means "use the note-type default" (blue text
 * notes, violet whiteboards); the other ids are stored on `notes.color`.
 */
export const NOTE_COLOR_OPTIONS = [
  { id: null, label: 'Default' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'amber', label: 'Amber' },
  { id: 'rose', label: 'Rose' },
  { id: 'violet', label: 'Violet' },
  { id: 'slate', label: 'Slate' }
]

export const NOTE_COLOR_IDS = NOTE_COLOR_OPTIONS
  .map(option => option.id)
  .filter(Boolean)

const NOTE_COLOR_ID_SET = new Set(NOTE_COLOR_IDS)

/**
 * @returns {string|null|undefined} The stored id, `null` for the default tint,
 *   or `undefined` when the value is not a known color.
 */
export function normalizeNoteColor(value) {
  if (value === null || value === undefined || value === '' || value === 'default') {
    return null
  }
  const id = String(value).trim().toLowerCase()
  return NOTE_COLOR_ID_SET.has(id) ? id : undefined
}

export function noteColorLabel(value) {
  const id = normalizeNoteColor(value)
  return NOTE_COLOR_OPTIONS.find(option => option.id === (id || null))?.label || 'Default'
}

/**
 * Normalize the DashboardNoteCard `select-color` payload. The component emits
 * `{ note, color }` as one argument; treating that payload as the note object
 * produces `/api/notes/undefined/color`.
 */
export function readNoteColorChange(payload) {
  const note = payload?.note
  if (!note?.id) return null
  return {
    noteId: note.id,
    color: payload.color || null,
    previous: note.color || null
  }
}
