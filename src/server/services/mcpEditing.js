import crypto from 'node:crypto'

const DEFAULT_TTL_MS = 30 * 60 * 1000

function fail(status, message, code, data = null) {
  const error = new Error(message)
  error.status = status
  error.code = code
  if (data) error.data = data
  return error
}

function versionOf(title, text) {
  return crypto
    .createHash('sha256')
    .update(String(title ?? ''))
    .update('\u0000')
    .update(String(text ?? ''))
    .digest('hex')
}

function lineCount(text) {
  if (!text) return 0
  return text.split('\n').length
}

function lineStartOffset(text, line) {
  if (line <= 1) return 0
  let seen = 1
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      seen += 1
      if (seen === line) return index + 1
    }
  }
  if (seen === line - 1) return text.length
  return -1
}

/**
 * Persistent MCP edit leases.
 *
 * One MCP client (identified by the bearer token's clientId) may hold one text
 * note open at a time. A lease is advisory: it never locks other clients out;
 * all edits operate on the shared Yjs draft and use optimistic versions.
 */
export function createMcpEditingService({
  db,
  notes,
  textCollab,
  onOpen,
  onClose,
  onSaved,
  onDraftChange,
  onToolsChanged,
  ttlMs = DEFAULT_TTL_MS
}) {
  const sessions = new Map() // clientKey -> session
  const timers = new Map() // clientKey -> timeout

  const selectHead = db.prepare('SELECT id, type, archived_at FROM notes WHERE id = ?')

  function schedule(session) {
    clearTimeout(timers.get(session.clientKey))
    const timer = setTimeout(() => expire(session.clientKey), Math.max(1000, ttlMs))
    if (typeof timer.unref === 'function') timer.unref()
    timers.set(session.clientKey, timer)
  }

  function touch(session) {
    session.lastSeenAt = Date.now()
    session.expiresAt = Date.now() + ttlMs
    schedule(session)
  }

  function publicSession(session) {
    return {
      session_id: session.id,
      note_id: session.noteId,
      base_revision_id: session.baseRevisionId,
      revision_no: session.revisionNo,
      version: session.version,
      expires_at: new Date(session.expiresAt).toISOString()
    }
  }

  function describe(session, snapshot) {
    const title = snapshot.title || ''
    const text = snapshot.text || ''
    session.version = versionOf(title, text)
    return {
      ...publicSession(session),
      title,
      content: text,
      line_count: lineCount(text)
    }
  }

  function currentSnapshot(session) {
    const snapshot = textCollab.snapshot(session.noteId)
    if (!snapshot) throw fail(404, 'The open note no longer exists', 'note_gone')
    return snapshot
  }

  function get(clientKey) {
    const session = sessions.get(clientKey)
    if (!session) return null
    if (Date.now() > session.expiresAt) {
      closeInternal(clientKey, { discard: false, reason: 'expired' })
      return null
    }
    return session
  }

  function requireSession(clientKey, sessionId) {
    const session = get(clientKey)
    if (!session) throw fail(404, 'No note is open for this MCP client', 'no_open_note')
    if (sessionId && sessionId !== session.id) {
      throw fail(409, 'The session id does not belong to this client', 'session_mismatch')
    }
    if (session.noteId && selectHead.get(session.noteId)?.archived_at) {
      closeInternal(clientKey, { discard: false, reason: 'archived' })
      throw fail(410, 'The open note was archived', 'note_archived')
    }
    touch(session)
    return session
  }

  function open({ clientKey, noteId, actor = 'mcp' }) {
    const existing = get(clientKey)
    if (existing) {
      if (existing.noteId === noteId) {
        touch(existing)
        return { session: publicSession(existing), snapshot: describe(existing, currentSnapshot(existing)) }
      }
      throw fail(
        409,
        'This MCP client already has another note open; close it first',
        'already_open',
        { open_note_id: existing.noteId, open_session_id: existing.id }
      )
    }

    const head = selectHead.get(noteId)
    if (!head || head.archived_at) throw fail(404, 'Note not found', 'note_not_found')
    if (head.type !== 'text') {
      throw fail(400, 'Persistent MCP editing is only available for text notes', 'unsupported_note_type')
    }

    const snapshot = textCollab.snapshot(noteId)
    if (!snapshot) throw fail(404, 'Note not found', 'note_not_found')

    const now = Date.now()
    const session = {
      id: crypto.randomUUID(),
      clientKey,
      noteId,
      actor,
      baseRevisionId: snapshot.baseRevisionId,
      revisionNo: snapshot.revisionNo || 1,
      version: versionOf(snapshot.title, snapshot.text),
      openedAt: now,
      lastSeenAt: now,
      expiresAt: now + ttlMs
    }
    sessions.set(clientKey, session)
    schedule(session)
    touch(session)
    onOpen?.(session)
    onToolsChanged?.('open', session)
    return { session: publicSession(session), snapshot: describe(session, snapshot) }
  }

  function read({ clientKey, sessionId }) {
    const session = requireSession(clientKey, sessionId)
    const snapshot = currentSnapshot(session)
    return describe(session, snapshot)
  }

  function assertVersion(session, expectedVersion, snapshot) {
    const version = versionOf(snapshot.title, snapshot.text)
    if (expectedVersion && expectedVersion !== version) {
      throw fail(
        409,
        'The shared draft changed since it was read; re-read before editing',
        'stale_version',
        { version, title: snapshot.title, content: snapshot.text, line_count: lineCount(snapshot.text) }
      )
    }
    return version
  }

  function applyMutation({ clientKey, sessionId, expectedVersion, mutate }) {
    const session = requireSession(clientKey, sessionId)
    const snapshot = currentSnapshot(session)
    assertVersion(session, expectedVersion, snapshot)

    const next = mutate({ title: snapshot.title || '', text: snapshot.text || '' })
    let title = next.title
    let text = next.text
    let changed = false

    if (title !== (snapshot.title || '')) {
      const result = textCollab.applyTitle(session.noteId, title)
      if (result) {
        title = result.title
        text = result.text
        changed = true
        if (result.update?.length) onDraftChange?.(session.noteId, result.update)
      }
    }

    if (text !== (snapshot.text || '')) {
      const result = textCollab.applyTextSnapshot(session.noteId, text)
      if (result) {
        text = result.text
        title = result.title
        changed = true
        if (result.update?.length) onDraftChange?.(session.noteId, result.update)
      }
    }

    session.version = versionOf(title, text)
    touch(session)
    return { ...describe(session, { title, text }), changed }
  }

  function replace({ clientKey, sessionId, oldText, newText, replaceAll = false, expectedVersion }) {
    return applyMutation({
      clientKey,
      sessionId,
      expectedVersion,
      mutate: ({ title, text }) => {
        if (!oldText) throw fail(400, 'old_text is required', 'invalid_edit')
        const occurrences = text.split(oldText).length - 1
        if (occurrences === 0) {
          throw fail(404, 'old_text was not found in the open note', 'text_not_found')
        }
        if (occurrences > 1 && !replaceAll) {
          throw fail(
            409,
            'old_text occurs more than once; pass replace_all or use a longer exact match',
            'text_ambiguous',
            { occurrences }
          )
        }
        return {
          title,
          text: replaceAll ? text.split(oldText).join(newText) : text.replace(oldText, () => newText)
        }
      }
    })
  }

  function insert({ clientKey, sessionId, line, text: insertText, expectedVersion }) {
    return applyMutation({
      clientKey,
      sessionId,
      expectedVersion,
      mutate: ({ title, text }) => {
        const lines = lineCount(text)
        const target = Number(line)
        if (!Number.isInteger(target) || target < 1 || target > lines + 1) {
          throw fail(400, `line must be between 1 and ${lines + 1}`, 'invalid_line')
        }
        const offset = target === lines + 1 ? text.length : lineStartOffset(text, target)
        if (offset < 0) throw fail(400, 'line is outside the open note', 'invalid_line')
        let block = String(insertText ?? '')
        if (block && !block.endsWith('\n')) block += '\n'
        if (offset > 0 && text[offset - 1] !== '\n' && block && !block.startsWith('\n')) {
          block = `\n${block}`
        }
        return { title, text: text.slice(0, offset) + block + text.slice(offset) }
      }
    })
  }

  function append({ clientKey, sessionId, text: appended, expectedVersion }) {
    return applyMutation({
      clientKey,
      sessionId,
      expectedVersion,
      mutate: ({ title, text }) => {
        const separator = text && !text.endsWith('\n') ? '\n' : ''
        return { title, text: `${text}${separator}${String(appended ?? '')}` }
      }
    })
  }

  function remove({ clientKey, sessionId, oldText, startLine, endLine, replaceAll = false, expectedVersion }) {
    return applyMutation({
      clientKey,
      sessionId,
      expectedVersion,
      mutate: ({ title, text }) => {
        if (oldText) {
          const occurrences = text.split(oldText).length - 1
          if (occurrences === 0) throw fail(404, 'old_text was not found in the open note', 'text_not_found')
          if (occurrences > 1 && !replaceAll) {
            throw fail(409, 'old_text occurs more than once; pass replace_all', 'text_ambiguous', { occurrences })
          }
          return { title, text: replaceAll ? text.split(oldText).join('') : text.replace(oldText, '') }
        }
        const start = Number(startLine)
        const end = Number(endLine)
        const lines = text.split('\n')
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
          throw fail(400, 'start_line/end_line are outside the open note', 'invalid_line_range')
        }
        lines.splice(start - 1, end - start + 1)
        return { title, text: lines.join('\n') }
      }
    })
  }

  function setTitle({ clientKey, sessionId, title: nextTitle, expectedVersion }) {
    return applyMutation({
      clientKey,
      sessionId,
      expectedVersion,
      mutate: ({ title, text }) => ({ title: String(nextTitle ?? ''), text })
    })
  }

  function save({ clientKey, sessionId, message = null, commitMode = 'append' }) {
    const session = requireSession(clientKey, sessionId)
    const snapshot = currentSnapshot(session)
    const result = notes.updateNote({
      id: session.noteId,
      title: snapshot.title || '',
      content: snapshot.text || '',
      baseRevisionId: session.baseRevisionId,
      mode: commitMode,
      actor: session.actor || 'mcp',
      source: 'mcp-open',
      message
    })
    if (!result.conflict) {
      session.baseRevisionId = result.revisionId || result.headRevisionId || session.baseRevisionId
      session.revisionNo = result.revisionNo || session.revisionNo
      session.version = versionOf(snapshot.title, snapshot.text)
      textCollab.setBaseRevision(session.noteId, session.baseRevisionId)
    }
    touch(session)
    onSaved?.(session, result)
    return {
      ...publicSession(session),
      saved: !!result.revision,
      conflict: !!result.conflict,
      unchanged: !!result.unchanged,
      revision: result.revision,
      notice: result.notice
    }
  }

  function closeInternal(clientKey, { discard = false, reason = 'close' } = {}) {
    const session = sessions.get(clientKey)
    if (!session) return null
    clearTimeout(timers.get(clientKey))
    timers.delete(clientKey)
    sessions.delete(clientKey)
    const closeResult = onClose?.(session, { discard: !!discard, reason }) || {}
    onToolsChanged?.(reason, session)
    return {
      closed: true,
      note_id: session.noteId,
      session_id: session.id,
      discarded: !!closeResult.discarded,
      draft_kept: !closeResult.discarded,
      remaining_editors: closeResult.remaining ?? null
    }
  }

  function close({ clientKey, sessionId, discard = false }) {
    const session = requireSession(clientKey, sessionId)
    return closeInternal(clientKey, { discard: !!discard, reason: 'close' })
  }

  function expire(clientKey) {
    closeInternal(clientKey, { discard: false, reason: 'expired' })
  }

  function closeForNote(noteId, { discard = false, reason = 'note-closed' } = {}) {
    let closed = 0
    for (const [clientKey, session] of [...sessions.entries()]) {
      if (session.noteId === noteId) {
        closeInternal(clientKey, { discard, reason })
        closed += 1
      }
    }
    return closed
  }

  function applySavedHead(noteId, revisionId, revisionNo) {
    if (!revisionId) return
    for (const session of sessions.values()) {
      if (session.noteId === noteId) {
        session.baseRevisionId = revisionId
        if (revisionNo) session.revisionNo = revisionNo
      }
    }
  }

  function closeAll() {
    for (const clientKey of [...sessions.keys()]) {
      closeInternal(clientKey, { discard: false, reason: 'shutdown' })
    }
  }

  return {
    get,
    open,
    read,
    replace,
    insert,
    append,
    remove,
    setTitle,
    save,
    close,
    closeForNote,
    applySavedHead,
    closeAll
  }
}
