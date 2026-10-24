import { parseNoteContent, isValidPropKey } from '../../shared/noteMeta.js'

/**
 * Materialized, queryable projection of a note's properties section.
 *
 * The fence in `notes.content` is the source of truth; `note_meta` exists so
 * property queries never have to parse fence text. Rebuilt whenever the head
 * moves, exactly like `note_tags` / `notes_fts` / `note_links`. Branch
 * revisions never touch it.
 */
export function createNoteMetaService({ db }) {
  const deleteMeta = db.prepare('DELETE FROM note_meta WHERE note_id = ?')
  const insertMeta = db.prepare(`
    INSERT OR REPLACE INTO note_meta (note_id, key, value_text, value_num, value_type)
    VALUES (?, ?, ?, ?, ?)
  `)

  /** Rebuild the shadow index from a note's head content. */
  function syncNote(noteId, content) {
    const { entries } = parseNoteContent(content || '')
    deleteMeta.run(noteId)
    let count = 0
    for (const entry of entries) {
      if (!entry || entry.blank || !isValidPropKey(entry.key)) continue
      const isList = entry.type === 'list'
      const values = isList ? entry.value : [entry.value]
      for (const value of values) {
        const text = value === null || value === undefined ? '' : String(value)
        insertMeta.run(
          noteId,
          entry.key,
          text,
          entry.type === 'number'
            ? Number(value)
            : (entry.type === 'date' ? Date.parse(text) : null),
          entry.type
        )
        count++
      }
    }
    return count
  }

  function removeNote(noteId) {
    deleteMeta.run(noteId)
  }

  /**
   * Notes matching property filters. Each filter is
   * `{ key, op: 'eq'|'lt'|'lte'|'gt'|'gte', value }`; filters combine with AND.
   */
  function query({ filters = [], limit = 200, offset = 0 } = {}) {
    const where = []
    const params = []
    for (const filter of filters) {
      const column = filter.op === 'eq' ? 'value_text' : 'value_num'
      const sqlOp = { eq: '=', lt: '<', lte: '<=', gt: '>', gte: '>=' }[filter.op]
      if (!sqlOp) throw new Error(`Unknown property operator: ${filter.op}`)
      where.push(`EXISTS (
        SELECT 1 FROM note_meta m
        WHERE m.note_id = notes.id AND m.key = ? AND m.${column} ${sqlOp} ?
      )`)
      params.push(filter.key, filter.op === 'eq' ? String(filter.value) : Number(filter.value))
    }
    const clause = where.length ? `AND ${where.join(' AND ')}` : ''
    return db.prepare(`
      SELECT * FROM notes
      WHERE archived_at IS NULL ${clause}
      ORDER BY updatedAt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
  }

  function valuesForNote(noteId) {
    return db.prepare(
      'SELECT key, value_text, value_num, value_type FROM note_meta WHERE note_id = ? ORDER BY key'
    ).all(noteId)
  }

  return { syncNote, removeNote, query, valuesForNote }
}
