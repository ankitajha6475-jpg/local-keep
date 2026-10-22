import * as Y from 'yjs'

const DEFAULT_PERSIST_MS = 400

function nowIso() {
  return new Date().toISOString()
}

/**
 * Server-side Yjs documents for live text notes.
 *
 * A document is a shared, uncommitted draft. It is persisted separately from
 * the note head so a refresh/reconnect does not lose editing state, but it only
 * becomes a revision when a client explicitly saves.
 */
export function createTextCollabService({ db, persistDelay = DEFAULT_PERSIST_MS }) {
  const docs = new Map()
  const timers = new Map()

  const selectHead = db.prepare(
    'SELECT id, title, content, head_revision_id, revision_no, archived_at FROM notes WHERE id = ?'
  )
  const selectDoc = db.prepare(
    'SELECT update_data, base_revision_id FROM note_text_docs WHERE note_id = ?'
  )
  const upsertDoc = db.prepare(`
    INSERT INTO note_text_docs (note_id, update_data, base_revision_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(note_id) DO UPDATE SET
      update_data = excluded.update_data,
      base_revision_id = excluded.base_revision_id,
      updated_at = excluded.updated_at
  `)
  const deleteDoc = db.prepare('DELETE FROM note_text_docs WHERE note_id = ?')

  function createDocFromHead(head) {
    const doc = new Y.Doc()
    doc.transact(() => {
      doc.getText('content').insert(0, head.content || '')
      const meta = doc.getMap('meta')
      meta.set('title', head.title || '')
      meta.set('noteId', head.id)
    }, 'init')
    return doc
  }

  function readHead(noteId) {
    return selectHead.get(noteId) || null
  }

  function load(noteId) {
    if (docs.has(noteId)) return docs.get(noteId)
    const head = readHead(noteId)
    if (!head || head.archived_at) return null

    const row = selectDoc.get(noteId)
    let doc
    let initialized = false
    if (row?.update_data) {
      try {
        doc = new Y.Doc()
        Y.applyUpdate(doc, row.update_data, 'persisted')
      } catch (_) {
        try { doc?.destroy() } catch (_) { /* noop */ }
        doc = createDocFromHead(head)
        initialized = true
      }
    } else {
      doc = createDocFromHead(head)
      initialized = true
    }

    const entry = {
      doc,
      noteId,
      baseRevisionId: row?.base_revision_id || head.head_revision_id || null,
      revisionNo: head.revision_no || 1,
      dirty: false
    }
    docs.set(noteId, entry)
    if (row && isCleanEntry(entry, head)) {
      discard(noteId)
      return load(noteId)
    }
    return entry
  }

  function isCleanEntry(entry, head) {
    if (!entry || !head) return false
    return entry.doc.getText('content').toString() === (head.content || '') &&
      (entry.doc.getMap('meta').get('title') || '') === (head.title || '')
  }

  function discardIfClean(noteId) {
    const entry = docs.get(noteId)
    const head = readHead(noteId)
    if (!entry || !head) return false
    if (!isCleanEntry(entry, head)) return false
    discard(noteId)
    return true
  }

  function snapshot(noteId) {
    const entry = load(noteId)
    if (!entry) return null
    return {
      noteId,
      update: Y.encodeStateAsUpdate(entry.doc),
      stateVector: Y.encodeStateVector(entry.doc),
      text: entry.doc.getText('content').toString(),
      title: entry.doc.getMap('meta').get('title') || '',
      baseRevisionId: entry.baseRevisionId,
      revisionNo: entry.revisionNo
    }
  }

  function textChange(oldText, newText) {
    let start = 0
    const maxStart = Math.min(oldText.length, newText.length)
    while (start < maxStart && oldText[start] === newText[start]) start += 1
    let oldEnd = oldText.length
    let newEnd = newText.length
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd -= 1
      newEnd -= 1
    }
    return { index: start, deleteCount: oldEnd - start, insertText: newText.slice(start, newEnd) }
  }

  /**
   * Replace the shared draft text from a server-side editor (MCP). The caller
   * must enforce its own concurrency/expected-version check; this method only
   * translates the snapshot difference into a Yjs transaction and returns the
   * exact update for WebSocket broadcast.
   */
  function applyTextSnapshot(noteId, nextText) {
    const entry = load(noteId)
    if (!entry) return null
    const currentText = entry.doc.getText('content').toString()
    const next = String(nextText ?? '')
    if (next === currentText) {
      return {
        update: null,
        text: currentText,
        title: entry.doc.getMap('meta').get('title') || ''
      }
    }
    const change = textChange(currentText, next)
    const stateVector = Y.encodeStateVector(entry.doc)
    entry.doc.transact(() => {
      const text = entry.doc.getText('content')
      if (change.deleteCount > 0) text.delete(change.index, change.deleteCount)
      if (change.insertText) text.insert(change.index, change.insertText)
    }, 'mcp')
    const update = Y.encodeStateAsUpdate(entry.doc, stateVector)
    entry.dirty = true
    schedulePersist(noteId)
    return {
      update,
      text: entry.doc.getText('content').toString(),
      title: entry.doc.getMap('meta').get('title') || ''
    }
  }

  function applyTitle(noteId, nextTitle) {
    const entry = load(noteId)
    if (!entry) return null
    const meta = entry.doc.getMap('meta')
    const current = meta.get('title') || ''
    const next = String(nextTitle ?? '')
    if (current === next) return { update: null, text: entry.doc.getText('content').toString(), title: current }
    const stateVector = Y.encodeStateVector(entry.doc)
    entry.doc.transact(() => meta.set('title', next), 'mcp')
    const update = Y.encodeStateAsUpdate(entry.doc, stateVector)
    entry.dirty = true
    schedulePersist(noteId)
    return { update, text: entry.doc.getText('content').toString(), title: next }
  }

  function applyUpdate(noteId, update) {
    const entry = load(noteId)
    if (!entry || !update) return false
    Y.applyUpdate(entry.doc, update, 'remote')
    entry.dirty = true
    schedulePersist(noteId)
    return true
  }

  function persistNow(noteId) {
    clearTimeout(timers.get(noteId))
    timers.delete(noteId)
    const entry = docs.get(noteId)
    if (!entry) return false
    if (!entry.dirty) return true
    const head = readHead(noteId)
    if (!head || head.archived_at) {
      discard(noteId)
      return false
    }
    const update = Buffer.from(Y.encodeStateAsUpdate(entry.doc))
    upsertDoc.run(noteId, update, entry.baseRevisionId || null, nowIso())
    entry.dirty = false
    return true
  }

  function schedulePersist(noteId) {
    if (timers.has(noteId)) clearTimeout(timers.get(noteId))
    const timer = setTimeout(() => {
      timers.delete(noteId)
      try { persistNow(noteId) } catch (error) {
        console.error('Text draft persist failed:', error.message)
      }
    }, Math.max(50, Number(persistDelay) || DEFAULT_PERSIST_MS))
    if (typeof timer.unref === 'function') timer.unref()
    timers.set(noteId, timer)
  }

  function setBaseRevision(noteId, revisionId) {
    const entry = docs.get(noteId)
    if (!entry || !revisionId) return false
    entry.baseRevisionId = revisionId
    entry.dirty = true
    persistNow(noteId)
    return true
  }

  function resetToHead(noteId) {
    const head = readHead(noteId)
    if (!head || head.archived_at) {
      discard(noteId)
      return null
    }
    const old = docs.get(noteId)
    if (old) {
      try { old.doc.destroy() } catch (_) { /* noop */ }
    }
    clearTimeout(timers.get(noteId))
    timers.delete(noteId)
    const doc = createDocFromHead(head)
    const entry = {
      doc,
      noteId,
      baseRevisionId: head.head_revision_id || null,
      revisionNo: head.revision_no || 1,
      dirty: false
    }
    docs.set(noteId, entry)
    // The reset document is exactly the head; do not leave an old draft row
    // behind that would be loaded the next time the note is opened.
    try { deleteDoc.run(noteId) } catch (_) { /* note may already be gone */ }
    return snapshot(noteId)
  }

  function discard(noteId) {
    clearTimeout(timers.get(noteId))
    timers.delete(noteId)
    const entry = docs.get(noteId)
    if (entry) {
      try { entry.doc.destroy() } catch (_) { /* noop */ }
      docs.delete(noteId)
    }
    try { deleteDoc.run(noteId) } catch (_) { /* note may already be gone */ }
  }

  /**
   * Dashboard draft listing. Read each persisted Yjs document without keeping
   * it in the live `docs` map; clean drafts (same title/content as the head)
   * are omitted.
   */
  function listDrafts() {
    const rows = db.prepare(`
      SELECT d.note_id, d.update_data, d.base_revision_id, d.updated_at,
             n.title, n.content, n.type, n.color, n.head_revision_id, n.revision_no
      FROM note_text_docs d
      JOIN notes n ON n.id = d.note_id
      WHERE n.archived_at IS NULL
      ORDER BY d.updated_at DESC
    `).all()

    const drafts = []
    for (const row of rows) {
      const doc = new Y.Doc()
      try {
        Y.applyUpdate(doc, row.update_data, 'list-drafts')
        const title = doc.getMap('meta').get('title') || ''
        const content = doc.getText('content').toString()
        if (title === (row.title || '') && content === (row.content || '')) continue
        drafts.push({
          noteId: row.note_id,
          title,
          content,
          headTitle: row.title || '',
          noteType: row.type || 'text',
          color: row.color || null,
          baseRevisionId: row.base_revision_id || null,
          headRevisionId: row.head_revision_id || null,
          revisionNo: row.revision_no || 1,
          updatedAt: row.updated_at
        })
      } catch (_) {
        // Ignore a corrupt draft row; the head remains usable.
      } finally {
        try { doc.destroy() } catch (_) { /* noop */ }
      }
    }
    return drafts
  }

  function hasDraft(noteId) {
    try {
      return !!db.prepare('SELECT 1 AS present FROM note_text_docs WHERE note_id = ?').get(noteId)
    } catch (_) {
      return false
    }
  }

  function flushAll() {
    for (const noteId of [...docs.keys()]) persistNow(noteId)
  }

  return {
    load,
    snapshot,
    applyUpdate,
    applyTextSnapshot,
    applyTitle,
    persistNow,
    schedulePersist,
    setBaseRevision,
    resetToHead,
    discard,
    discardIfClean,
    listDrafts,
    hasDraft,
    flushAll
  }
}
