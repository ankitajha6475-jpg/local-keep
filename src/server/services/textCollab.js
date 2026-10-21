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

  function flushAll() {
    for (const noteId of [...docs.keys()]) persistNow(noteId)
  }

  return {
    load,
    snapshot,
    applyUpdate,
    persistNow,
    schedulePersist,
    setBaseRevision,
    resetToHead,
    discard,
    discardIfClean,
    flushAll
  }
}
