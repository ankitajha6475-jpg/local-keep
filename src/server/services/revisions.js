import crypto from 'crypto'
import { getDisplayTitle } from '../../shared/notesText.js'
import {
  computeCanvasHashFromData,
  hydrateCanvasData,
  leanCanvasData,
  snapshotHash
} from '../canvas.js'
import { extractCanvasText, indexNote } from '../fts.js'
import { EVENTS } from '../events.js'

function nowIso() {
  return new Date().toISOString()
}

function fail(status, message, code = 'revision_error') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function parseCanvas(canvasData) {
  if (!canvasData) return null
  try {
    return typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData
  } catch (_) {
    return null
  }
}

export function createRevisionService({ db, imageStore, imageRefs, bus, tags, links }) {
  const insertRevisionStmt = db.prepare(`
    INSERT INTO note_revisions
      (id, note_id, parent_revision_id, revision_no, title, content, display_title,
       type, canvas_data, thumbnail, snapshot_hash, actor, source, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEventStmt = db.prepare(`
    INSERT INTO note_events (note_id, revision_id, type, actor, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  function getHead(noteId) {
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) || null
  }

  function getRevision(revisionId) {
    return db.prepare('SELECT * FROM note_revisions WHERE id = ?').get(revisionId) || null
  }

  function nextRevisionNo(noteId) {
    const row = db.prepare(
      'SELECT MAX(revision_no) AS maxNo FROM note_revisions WHERE note_id = ?'
    ).get(noteId)
    return (row?.maxNo || 0) + 1
  }

  function insertRevision({
    noteId,
    parentRevisionId,
    revisionNo,
    title,
    content,
    displayTitle,
    type,
    canvasData,
    thumbnail,
    hash,
    actor,
    source,
    message
  }) {
    const revisionId = crypto.randomUUID()
    insertRevisionStmt.run(
      revisionId,
      noteId,
      parentRevisionId,
      revisionNo,
      title || '',
      content || '',
      displayTitle || getDisplayTitle({ title, content }),
      type || 'text',
      canvasData || null,
      thumbnail || null,
      hash,
      actor || 'ui',
      source || 'ui',
      message || null,
      nowIso()
    )
    return getRevision(revisionId)
  }

  function updateHead(noteId, revision, { canvasData, thumbnail, snapshot, canvasHash }) {
    const displayTitle = revision.display_title || getDisplayTitle(revision)
    const updatedAt = revision.created_at || nowIso()
    db.prepare(`
      UPDATE notes
      SET title = ?, content = ?, type = ?, canvasData = ?, thumbnail = ?,
          display_title = ?, head_revision_id = ?, revision_no = ?, content_hash = ?,
          canvas_hash = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      revision.title || '',
      revision.content || '',
      revision.type || 'text',
      canvasData ?? null,
      thumbnail ?? null,
      displayTitle,
      revision.id,
      revision.revision_no,
      snapshot,
      canvasHash || null,
      updatedAt,
      noteId
    )
    return displayTitle
  }

  function indexHead(head, revision) {
    indexNote(db, {
      noteId: head.id,
      title: revision.title || '',
      content: revision.content || '',
      canvasText: extractCanvasText(head.canvasData)
    })
  }

  /**
   * Insert revision 1 for a freshly created note. The caller owns the
   * transaction and has already inserted the `notes` row.
   */
  function insertInitialRevision({
    noteId,
    title,
    content,
    type = 'text',
    canvasData = null,
    thumbnail = null,
    actor = 'ui',
    source = 'ui'
  }) {
    const canvasHash = computeCanvasHashFromData(canvasData)
    const hash = snapshotHash({ title: title || '', content: content || '', canvasHash })
    const displayTitle = getDisplayTitle({ title, content })
    const lean = leanCanvasData(canvasData, imageStore)
    const revision = insertRevision({
      noteId,
      parentRevisionId: null,
      revisionNo: 1,
      title,
      content,
      displayTitle,
      type,
      canvasData: lean,
      thumbnail,
      hash,
      actor,
      source
    })
    updateHead(noteId, revision, {
      canvasData,
      thumbnail,
      snapshot: hash,
      canvasHash
    })
    imageRefs.syncHeadRefs(noteId, content, lean)
    imageRefs.syncRevisionRefs(revision.id, content, lean)
    tags?.syncNote(noteId, content, lean)
    links?.syncNote(noteId, revision.id, content, lean)
    const head = getHead(noteId)
    indexHead(head, revision)
    insertEventStmt.run(
      noteId, revision.id, 'created', actor,
      JSON.stringify({ source }), revision.created_at
    )
    return revision
  }

  function commitInternal({
    noteId,
    title,
    content,
    type,
    canvasData,
    thumbnail,
    baseRevisionId = null,
    mode = 'append',
    actor = 'ui',
    source = 'ui',
    message = null,
    force = false
  }) {
    if (!['append', 'branch', 'take_head'].includes(mode)) {
      throw fail(400, `Unknown commit mode: ${mode}`, 'invalid_mode')
    }
    const head = getHead(noteId)
    if (!head) throw fail(404, 'Note not found', 'note_not_found')
    if (head.archived_at) {
      throw fail(409, 'Note is archived; restore it before editing', 'note_archived')
    }

    const previousHead = head.head_revision_id ? getRevision(head.head_revision_id) : null
    const baseRevision = baseRevisionId ? getRevision(baseRevisionId) : previousHead
    if (baseRevisionId && !baseRevision) {
      throw fail(400, 'Unknown base revision', 'invalid_base_revision')
    }
    if (baseRevision && baseRevision.note_id !== noteId) {
      throw fail(400, 'Base revision belongs to another note', 'invalid_base_revision')
    }

    const effectiveTitle = title !== undefined ? title : (head.title || '')
    const effectiveContent = content !== undefined ? content : (head.content || '')
    const effectiveType = type || head.type || 'text'
    const effectiveCanvas = canvasData !== undefined ? canvasData : head.canvasData
    const effectiveThumbnail = thumbnail !== undefined ? thumbnail : head.thumbnail

    const canvasHash = computeCanvasHashFromData(effectiveCanvas)
    const hash = snapshotHash({
      title: effectiveTitle,
      content: effectiveContent,
      canvasHash
    })

    if (!force && hash === head.content_hash) {
      return {
        note: head,
        revision: previousHead,
        previousRevision: null,
        conflict: false,
        unchanged: true,
        notice: 'No changes to save.'
      }
    }

    const stale = !!(baseRevision && previousHead && baseRevision.id !== previousHead.id)
    const branch = mode === 'branch' || (stale && mode !== 'take_head')
    const branchBase = baseRevision || previousHead
    const parentRevisionId = branch ? branchBase?.id || null : previousHead?.id || null
    const revisionNo = nextRevisionNo(noteId)
    const displayTitle = getDisplayTitle({ title: effectiveTitle, content: effectiveContent })
    const lean = leanCanvasData(effectiveCanvas, imageStore)

    const revision = insertRevision({
      noteId,
      parentRevisionId,
      revisionNo,
      title: effectiveTitle,
      content: effectiveContent,
      displayTitle,
      type: effectiveType,
      canvasData: lean,
      thumbnail: effectiveThumbnail,
      hash,
      actor,
      source,
      message
    })

    imageRefs.syncRevisionRefs(revision.id, effectiveContent, lean)

    let finalHead = head
    if (!branch) {
      updateHead(noteId, revision, {
        canvasData: effectiveCanvas,
        thumbnail: effectiveThumbnail,
        snapshot: hash,
        canvasHash
      })
      imageRefs.syncHeadRefs(noteId, effectiveContent, lean)
      finalHead = getHead(noteId)
      indexHead(finalHead, revision)
      tags?.syncNote(noteId, effectiveContent, lean)
      links?.syncNote(noteId, revision.id, effectiveContent, lean)
    }

    const notice = branch
      ? `Note changed elsewhere; your edit was kept as revision ${revisionNo} (branch).`
      : `Saved revision ${revisionNo}; revision ${previousHead?.revision_no ?? 0} kept.`

    insertEventStmt.run(
      noteId,
      revision.id,
      branch ? 'branched' : 'revised',
      actor,
      JSON.stringify({ source, mode, branch, baseRevisionId: baseRevision?.id || null }),
      revision.created_at
    )
    const event = {
      noteId: finalHead.id,
      revisionId: revision.id,
      revisionNo,
      actor,
      source,
      conflict: branch,
      headRevisionId: finalHead.head_revision_id,
      notice
    }

    return {
      note: finalHead,
      revision,
      previousRevision: previousHead,
      conflict: branch,
      unchanged: false,
      notice,
      event
    }
  }

  function commitText(input) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = commitInternal(input)
      db.exec('COMMIT')
      if (result.event) bus?.emit(EVENTS.NOTE_REVISED, result.event)
      return result
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
  }

  function checkpointCanvas({
    noteId,
    canvasData,
    thumbnail = null,
    actor = 'ui',
    force = false
  }) {
    const head = getHead(noteId)
    if (!head || head.archived_at) return null
    const canvasHash = computeCanvasHashFromData(canvasData)
    if (canvasHash && canvasHash === head.canvas_hash) return null

    db.exec('BEGIN IMMEDIATE')
    try {
      const fresh = getHead(noteId)
      if (!fresh) { db.exec('ROLLBACK'); return null }
      if (canvasHash && canvasHash === fresh.canvas_hash) {
        db.exec('ROLLBACK')
        return null
      }
      const lean = leanCanvasData(canvasData, imageStore)
      const hash = snapshotHash({
        title: fresh.title || '',
        content: fresh.content || '',
        canvasHash
      })
      const parentRevisionId = fresh.head_revision_id || null
      const revision = insertRevision({
        noteId,
        parentRevisionId,
        revisionNo: nextRevisionNo(noteId),
        title: fresh.title || '',
        content: fresh.content || '',
        displayTitle: fresh.display_title || getDisplayTitle(fresh),
        type: fresh.type || 'canvas',
        canvasData: lean,
        thumbnail,
        hash,
        actor,
        source: 'checkpoint',
        message: 'whiteboard checkpoint'
      })
      db.prepare(`
        UPDATE notes
        SET canvasData = ?, thumbnail = ?, canvas_hash = ?, content_hash = ?,
            head_revision_id = ?, revision_no = ?, last_checkpoint_at = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        canvasData,
        thumbnail,
        canvasHash,
        hash,
        revision.id,
        revision.revision_no,
        revision.created_at,
        revision.created_at,
        noteId
      )
      imageRefs.syncHeadRefs(noteId, fresh.content || '', lean)
      imageRefs.syncRevisionRefs(revision.id, fresh.content || '', lean)
      tags?.syncNote(noteId, fresh.content || '', lean)
      links?.syncNote(noteId, revision.id, fresh.content || '', lean)
      const updatedHead = getHead(noteId)
      indexHead(updatedHead, revision)
      insertEventStmt.run(
        noteId, revision.id, 'checkpoint', actor,
        JSON.stringify({ source: 'whiteboard' }), revision.created_at
      )
      db.exec('COMMIT')
      bus?.emit(EVENTS.NOTE_REVISED, {
        noteId,
        revisionId: revision.id,
        revisionNo: revision.revision_no,
        actor,
        source: 'checkpoint',
        conflict: false,
        headRevisionId: revision.id,
        notice: `Whiteboard checkpoint saved as revision ${revision.revision_no}.`
      })
      return revision
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
  }

  function headChainIds(noteId, headRevisionId) {
    const ids = new Set()
    let current = headRevisionId
    const guard = new Set()
    while (current && !guard.has(current)) {
      guard.add(current)
      ids.add(current)
      const row = getRevision(current)
      if (!row || row.note_id !== noteId) break
      current = row.parent_revision_id
    }
    return ids
  }

  function buildTree(revisions) {
    const byId = new Map(revisions.map(r => [r.id, { ...r, children: [] }]))
    const roots = []
    for (const node of byId.values()) {
      const parent = node.parent_revision_id ? byId.get(node.parent_revision_id) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return roots.length === 1 ? roots[0] : roots
  }

  function history(noteId) {
    const head = getHead(noteId)
    if (!head) throw fail(404, 'Note not found', 'note_not_found')
    const revisions = db.prepare(
      'SELECT * FROM note_revisions WHERE note_id = ? ORDER BY revision_no ASC'
    ).all(noteId)
    const headChain = headChainIds(noteId, head.head_revision_id)
    const flat = revisions.map(r => ({
      id: r.id,
      noteId: r.note_id,
      parentId: r.parent_revision_id,
      revisionNo: r.revision_no,
      title: r.title,
      displayTitle: r.display_title,
      type: r.type,
      actor: r.actor,
      source: r.source,
      message: r.message,
      createdAt: r.created_at,
      onHeadChain: headChain.has(r.id),
      isHead: r.id === head.head_revision_id
    }))
    return {
      noteId,
      headRevisionId: head.head_revision_id,
      headRevisionNo: head.revision_no,
      revisions: flat,
      tree: buildTree(flat)
    }
  }

  function revisionSnapshot(noteId, revisionId) {
    const revision = getRevision(revisionId)
    if (!revision || revision.note_id !== noteId) {
      throw fail(404, 'Revision not found', 'revision_not_found')
    }
    return revision
  }

  function copyRevisionToHead({ noteId, revisionId, source, actor = 'ui' }) {
    const head = getHead(noteId)
    if (!head) throw fail(404, 'Note not found', 'note_not_found')
    const revision = revisionSnapshot(noteId, revisionId)
    const canvasData = revision.type === 'canvas'
      ? hydrateCanvasData(revision.canvas_data, imageStore)
      : null
    return commitText({
      noteId,
      title: revision.title || '',
      content: revision.content || '',
      type: revision.type || 'text',
      canvasData,
      thumbnail: revision.thumbnail || null,
      baseRevisionId: head.head_revision_id,
      mode: 'take_head',
      actor,
      source,
      message: `${source} ${revision.id}`,
      force: true
    })
  }

  return {
    getHead,
    getRevision,
    insertInitialRevision,
    commitText,
    checkpointCanvas,
    history,
    revisionSnapshot,
    restoreRevision: ({ noteId, revisionId, actor }) =>
      copyRevisionToHead({ noteId, revisionId, source: 'restore', actor }),
    promoteRevision: ({ noteId, revisionId, actor }) =>
      copyRevisionToHead({ noteId, revisionId, source: 'promote', actor })
  }
}
