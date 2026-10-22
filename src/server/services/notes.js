import { getDisplayTitle } from '../../shared/notesText.js'
import { normalizeNoteColor } from '../../shared/noteColors.js'
import { removeNoteFromIndex } from '../fts.js'
import { EVENTS } from '../events.js'

function fail(status, message, code = 'note_error') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

export function createNoteService({ db, revisions, imageRefs, bus, tags, links, embeddings }) {
  function revisionDto(revision) {
    if (!revision) return null
    return {
      id: revision.id,
      noteId: revision.note_id,
      parentId: revision.parent_revision_id,
      revisionNo: revision.revision_no,
      title: revision.title,
      content: revision.content,
      displayTitle: revision.display_title,
      type: revision.type,
      canvasData: revision.canvas_data,
      thumbnail: revision.thumbnail,
      snapshotHash: revision.snapshot_hash,
      actor: revision.actor,
      source: revision.source,
      message: revision.message,
      createdAt: revision.created_at
    }
  }

  function toDto(row, extras = {}) {
    if (!row) return null
    return {
      ...row,
      revisionId: row.head_revision_id || null,
      revisionNo: row.revision_no || 1,
      displayTitle: row.display_title || getDisplayTitle(row),
      archivedAt: row.archived_at || null,
      tags: extras.tags || [],
      linkCount: extras.linkCount || 0,
      backlinkCount: extras.backlinkCount || 0
    }
  }

  function decorateRow(row) {
    if (!row) return null
    const tagMap = tags?.tagsByNote([row.id])
    const counts = links?.countsByNote([row.id])
    return toDto(row, {
      tags: tagMap?.get(row.id) || [],
      linkCount: counts?.get(row.id)?.links || 0,
      backlinkCount: counts?.get(row.id)?.backlinks || 0
    })
  }

  function listNotes({
    includeArchived = false,
    type = null,
    limit = null,
    offset = 0,
    tag = null,
    exactTag = false
  } = {}) {
    const where = []
    const params = []
    if (!includeArchived) where.push('archived_at IS NULL')
    if (type) { where.push('type = ?'); params.push(type) }
    const sql = `SELECT * FROM notes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updatedAt DESC`
    let rows = db.prepare(sql).all(...params)

    if (tag) {
      const ids = tags?.noteIdsForTag(tag, { exact: exactTag })
      if (ids) rows = rows.filter(row => ids.has(row.id))
    }

    const start = Math.max(0, Number(offset) || 0)
    const end = limit != null ? start + Math.max(0, Number(limit) || 0) : undefined
    rows = rows.slice(start, end)

    const ids = rows.map(row => row.id)
    const tagMap = tags?.tagsByNote(ids) || new Map()
    const counts = links?.countsByNote(ids) || new Map()
    return rows.map(row => toDto(row, {
      tags: tagMap.get(row.id) || [],
      linkCount: counts.get(row.id)?.links || 0,
      backlinkCount: counts.get(row.id)?.backlinks || 0
    }))
  }

  /**
   * Lightweight dashboard index. It deliberately excludes `content` and
   * `canvasData`: the dashboard uses it for ordering, filters, counts, links,
   * and selection, then hydrates card bodies in bounded windows.
   */
  function listNoteIndex({ includeArchived = true } = {}) {
    const where = includeArchived ? '' : ' WHERE archived_at IS NULL'
    const rows = db.prepare(`
      SELECT id, title, display_title, type, head_revision_id, revision_no,
             archived_at, createdAt, updatedAt, color,
             substr(content, 1, 400) AS content_preview
      FROM notes${where}
      ORDER BY updatedAt DESC
    `).all()

    // Keep SQL variable counts bounded for very large libraries.
    const ids = rows.map(row => row.id)
    const tagMap = new Map()
    const counts = new Map()
    for (let index = 0; index < ids.length; index += 500) {
      const chunk = ids.slice(index, index + 500)
      for (const [id, value] of tags?.tagsByNote(chunk) || []) tagMap.set(id, value)
      for (const [id, value] of links?.countsByNote(chunk) || []) counts.set(id, value)
    }
    return rows.map(row => ({
      id: row.id,
      title: row.title || '',
      displayTitle: row.display_title || getDisplayTitle({
        title: row.title,
        content: row.content_preview
      }),
      type: row.type,
      revisionId: row.head_revision_id || null,
      revisionNo: row.revision_no || 1,
      archivedAt: row.archived_at || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      color: row.color || null,
      tags: tagMap.get(row.id) || [],
      linkCount: counts.get(row.id)?.links || 0,
      backlinkCount: counts.get(row.id)?.backlinks || 0
    }))
  }

  /**
   * Batched card details for the virtualized dashboard. Returns rows in the
   * requested order, omits canvas scene data, and is capped by the caller.
   */
  function listNoteCardsByIds(ids = []) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    if (unique.length === 0) return []
    const placeholders = unique.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT id, title, substr(content, 1, 12000) AS content,
             length(content) AS content_length, display_title, type, thumbnail,
             createdAt, updatedAt, head_revision_id, revision_no, archived_at,
             color, last_checkpoint_at
      FROM notes
      WHERE id IN (${placeholders})
    `).all(...unique)
    const byId = new Map(rows.map(row => [row.id, row]))
    const ordered = unique.map(id => byId.get(id)).filter(Boolean)

    const orderedIds = ordered.map(row => row.id)
    const tagMap = tags?.tagsByNote(orderedIds) || new Map()
    const counts = links?.countsByNote(orderedIds) || new Map()
    return ordered.map(row => {
      const note = toDto(row, {
        tags: tagMap.get(row.id) || [],
        linkCount: counts.get(row.id)?.links || 0,
        backlinkCount: counts.get(row.id)?.backlinks || 0
      })
      note.contentTruncated = Number(row.content_length || 0) > String(row.content || '').length
      return note
    })
  }

  function listArchivedNotes() {
    return db.prepare(`
      SELECT id, title, display_title, revision_no, archived_at, updatedAt
      FROM notes
      WHERE archived_at IS NOT NULL
      ORDER BY archived_at ASC, updatedAt DESC
    `).all().map(row => ({
      id: row.id,
      title: row.title || '',
      displayTitle: row.display_title || row.title || 'Untitled',
      revisionNo: row.revision_no || 1,
      archivedAt: row.archived_at,
      updatedAt: row.updatedAt
    }))
  }

  function getNote(id) {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    if (!row) throw fail(404, 'Note not found', 'note_not_found')
    return decorateRow(row)
  }

  function createNote({
    title = '',
    content = '',
    type = 'text',
    canvasData = null,
    thumbnail = null,
    actor = 'ui',
    source = 'ui'
  } = {}) {
    const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 11)
    const now = new Date().toISOString()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        INSERT INTO notes (id, title, content, type, canvasData, thumbnail, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title || '', content || '', type || 'text', canvasData || null, thumbnail || null, now, now)
      revisions.insertInitialRevision({
        noteId: id,
        title,
        content,
        type,
        canvasData,
        thumbnail,
        actor,
        source
      })
      db.exec('COMMIT')
      const revision = revisions.getHead(id)
      bus?.emit(EVENTS.NOTE_CREATED, {
        noteId: id,
        revisionId: revision?.head_revision_id || null,
        revisionNo: revision?.revision_no || 1,
        actor,
        source
      })
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
    return getNote(id)
  }

  function updateNote({
    id,
    title,
    content,
    type,
    canvasData,
    thumbnail,
    baseRevisionId = null,
    mode = 'append',
    actor = 'ui',
    source = 'ui',
    message = null
  }) {
    const result = revisions.commitText({
      noteId: id,
      title,
      content,
      type,
      canvasData,
      thumbnail,
      baseRevisionId,
      mode,
      actor,
      source,
      message
    })
    return {
      ...decorateRow(result.note),
      revision: revisionDto(result.revision),
      createdRevisionId: result.revision?.id || null,
      headRevisionId: result.note?.head_revision_id || null,
      previousRevision: revisionDto(result.previousRevision),
      conflict: !!result.conflict,
      unchanged: !!result.unchanged,
      notice: result.notice
    }
  }

  function setNoteColor(id, color) {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    if (!row) throw fail(404, 'Note not found', 'note_not_found')
    const normalized = normalizeNoteColor(color)
    if (normalized === undefined) {
      throw fail(400, 'Unknown note color', 'invalid_note_color')
    }
    // Color is presentation metadata: do not bump updatedAt or create a revision.
    db.prepare('UPDATE notes SET color = ? WHERE id = ?').run(normalized, id)
    return getNote(id)
  }

  function archiveNote(id, actor = 'ui', source = 'ui') {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    if (!row) throw fail(404, 'Note not found', 'note_not_found')
    if (row.archived_at) return decorateRow(row)
    const archivedAt = new Date().toISOString()
    db.prepare('UPDATE notes SET archived_at = ?, updatedAt = ? WHERE id = ?')
      .run(archivedAt, archivedAt, id)
    links?.resolveAll()
    embeddings?.enqueueNote(id)
    bus?.emit(EVENTS.NOTE_ARCHIVED, { noteId: id, actor, source, archivedAt })
    return decorateRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(id))
  }

  function archiveNotes(ids, actor = 'ui', source = 'ui') {
    const archivedAt = new Date().toISOString()
    const unique = [...new Set(ids)].filter(Boolean)
    if (unique.length === 0) return 0
    db.exec('BEGIN IMMEDIATE')
    try {
      const stmt = db.prepare(
        'UPDATE notes SET archived_at = COALESCE(archived_at, ?), updatedAt = ? WHERE id = ?'
      )
      let changed = 0
      const changedIds = []
      for (const id of unique) {
        const info = stmt.run(archivedAt, archivedAt, id)
        if (info.changes > 0) {
          changed += info.changes
          changedIds.push(id)
        }
      }
      db.exec('COMMIT')
      links?.resolveAll()
      for (const id of changedIds) {
        embeddings?.enqueueNote(id)
        bus?.emit(EVENTS.NOTE_ARCHIVED, { noteId: id, actor, source, archivedAt })
      }
      return changed
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
  }

  function restoreNote(id, actor = 'ui', source = 'ui') {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    if (!row) throw fail(404, 'Note not found', 'note_not_found')
    if (!row.archived_at) return decorateRow(row)
    const updatedAt = new Date().toISOString()
    db.prepare('UPDATE notes SET archived_at = NULL, updatedAt = ? WHERE id = ?')
      .run(updatedAt, id)
    links?.resolveAll()
    embeddings?.enqueueNote(id)
    bus?.emit(EVENTS.NOTE_RESTORED, { noteId: id, actor, source })
    return decorateRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(id))
  }

  function purgeNote(id, actor = 'ui', source = 'ui') {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    if (!row) throw fail(404, 'Note not found', 'note_not_found')
    imageRefs.releaseNoteRefs(id)
    removeNoteFromIndex(db, id)
    tags?.deleteNote(id)
    links?.deleteNote(id)
    embeddings?.deleteNoteEverywhere(id)
    db.prepare('DELETE FROM note_events WHERE note_id = ?').run(id)
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    links?.resolveAll()
    bus?.emit(EVENTS.NOTE_PURGED, { noteId: id, actor, source })
    return { success: true }
  }

  function history(noteId) {
    return revisions.history(noteId)
  }

  function revisionSnapshot(noteId, revisionId) {
    return revisionDto(revisions.revisionSnapshot(noteId, revisionId))
  }

  function restoreRevision(noteId, revisionId, actor = 'ui') {
    const result = revisions.restoreRevision({ noteId, revisionId, actor })
    return {
      ...decorateRow(result.note),
      revision: revisionDto(result.revision),
      createdRevisionId: result.revision?.id || null,
      headRevisionId: result.note?.head_revision_id || null,
      previousRevision: revisionDto(result.previousRevision),
      conflict: !!result.conflict,
      notice: result.notice
    }
  }

  function promoteRevision(noteId, revisionId, actor = 'ui') {
    const result = revisions.promoteRevision({ noteId, revisionId, actor })
    return {
      ...decorateRow(result.note),
      revision: revisionDto(result.revision),
      createdRevisionId: result.revision?.id || null,
      headRevisionId: result.note?.head_revision_id || null,
      previousRevision: revisionDto(result.previousRevision),
      conflict: !!result.conflict,
      notice: result.notice
    }
  }

  return {
    listNotes,
    listNoteIndex,
    listNoteCardsByIds,
    listArchivedNotes,
    getNote,
    createNote,
    updateNote,
    setNoteColor,
    archiveNote,
    archiveNotes,
    restoreNote,
    purgeNote,
    history,
    revisionSnapshot,
    restoreRevision,
    promoteRevision,
    toDto,
    revisionDto
  }
}
