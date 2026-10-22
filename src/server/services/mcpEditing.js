import crypto from 'node:crypto'

const DEFAULT_TTL_MS = 30 * 60 * 1000
const DEFAULT_MAX_WRITES = 5
const DEFAULT_MAX_READS = 8
const MAX_SESSIONS = 64

function clampLimit(value, fallback) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric)) return fallback
  return Math.max(1, Math.min(MAX_SESSIONS, numeric))
}

function fail(status, message, code, data = null, guide = null) {
  const error = new Error(message)
  error.status = status
  error.code = code
  if (data) error.data = data
  if (guide) error.guide = guide
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
 * Persistent MCP editing sessions.
 *
 * State is held per MCP token (clientKey):
 *   - up to maxWrites write sessions (default 5)
 *   - up to maxReads read sessions (default 8)
 *
 * Limits can be supplied dynamically via getLimits(), so admin changes apply to
 * new session opens without restarting the server. The state is advisory. It
 * never locks other tokens out; every write uses optimistic versions against the
 * shared Yjs draft.
 */
export function createMcpEditingService({
  db,
  notes,
  revisions,
  textCollab,
  onOpen,
  onClose,
  onSaved,
  onDraftChange,
  ttlMs = DEFAULT_TTL_MS,
  maxWrites = DEFAULT_MAX_WRITES,
  maxReads = DEFAULT_MAX_READS,
  getLimits = null
}) {
  const states = new Map() // clientKey -> { writes: Map<sessionId, session>, reads: Map<sessionId, session> }
  const sessionsById = new Map()
  const timers = new Map()
  const fallbackLimits = {
    maxWrites: clampLimit(maxWrites, DEFAULT_MAX_WRITES),
    maxReads: clampLimit(maxReads, DEFAULT_MAX_READS)
  }
  const sessionTtl = Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS)

  const selectHead = db.prepare('SELECT id, type, archived_at FROM notes WHERE id = ?')

  function currentLimits() {
    let configured = null
    try {
      configured = typeof getLimits === 'function' ? getLimits() : null
    } catch (_) { /* fall back to constructor limits */ }
    return {
      maxWrites: clampLimit(configured?.maxWriteSessions ?? configured?.maxWrites, fallbackLimits.maxWrites),
      maxReads: clampLimit(configured?.maxReadSessions ?? configured?.maxReads, fallbackLimits.maxReads)
    }
  }

  function publicLimits() {
    const limits = currentLimits()
    return {
      max_write_sessions: limits.maxWrites,
      max_read_sessions: limits.maxReads
    }
  }

  function emptyState() {
    return { writes: new Map(), reads: new Map() }
  }

  function schedule(session) {
    clearTimeout(timers.get(session.id))
    const timer = setTimeout(() => expire(session.id), sessionTtl)
    if (typeof timer.unref === 'function') timer.unref()
    timers.set(session.id, timer)
  }

  function touch(session) {
    session.lastSeenAt = Date.now()
    session.expiresAt = Date.now() + sessionTtl
    schedule(session)
  }

  function publicSession(session) {
    return {
      session_id: session.id,
      mode: session.mode,
      note_id: session.noteId,
      base_revision_id: session.baseRevisionId,
      revision_no: session.revisionNo,
      version: session.version,
      expires_at: new Date(session.expiresAt).toISOString(),
      dirty: !!session.dirty
    }
  }

  function baseContent(session) {
    const revision = session.baseRevisionId ? revisions?.getRevision(session.baseRevisionId) : null
    if (revision) return { title: revision.title || '', text: revision.content || '' }
    try {
      const note = notes.getNote(session.noteId)
      return { title: note.title || '', text: note.content || '' }
    } catch (_) {
      return null
    }
  }

  function refreshSession(session) {
    const snapshot = textCollab.snapshot(session.noteId)
    if (!snapshot) return false
    session.version = versionOf(snapshot.title, snapshot.text)
    const base = baseContent(session)
    session.dirty = base
      ? (snapshot.title || '') !== base.title || (snapshot.text || '') !== base.text
      : false
    return true
  }

  function describe(session, snapshot) {
    const title = snapshot.title || ''
    const text = snapshot.text || ''
    session.version = versionOf(title, text)
    const base = baseContent(session)
    session.dirty = base ? title !== base.title || text !== base.text : false
    return {
      ...publicSession(session),
      title,
      content: text,
      line_count: lineCount(text)
    }
  }

  function detachSession(session, { discard = false, reason = 'close' } = {}) {
    const state = states.get(session.clientKey)
    clearTimeout(timers.get(session.id))
    timers.delete(session.id)
    sessionsById.delete(session.id)
    if (state) {
      state.writes.delete(session.id)
      state.reads.delete(session.id)
      if (state.writes.size === 0 && state.reads.size === 0) states.delete(session.clientKey)
    }
    return onClose?.(session, { discard: !!discard, reason }) || {}
  }

  function closeInternal(session, { discard = false, reason = 'close' } = {}) {
    // A read session never owns the draft; discard only applies to write sessions.
    const closeResult = detachSession(session, { discard: session.mode === 'write' ? discard : false, reason })
    return {
      closed: true,
      note_id: session.noteId,
      session_id: session.id,
      mode: session.mode,
      discarded: !!closeResult.discarded,
      draft_kept: typeof closeResult.draftKept === 'boolean'
        ? closeResult.draftKept
        : !closeResult.discarded,
      remaining_editors: closeResult.remaining ?? null
    }
  }

  function expire(sessionId) {
    const session = sessionsById.get(sessionId)
    if (!session) return
    closeInternal(session, { discard: false, reason: 'expired' })
  }

  function cleanupState(clientKey) {
    const state = states.get(clientKey)
    if (!state) return null
    const sessions = [
      ...state.writes.values(),
      ...state.reads.values()
    ]
    for (const session of sessions) {
      if (Date.now() > session.expiresAt) {
        closeInternal(session, { discard: false, reason: 'expired' })
        continue
      }
      if (!refreshSession(session)) {
        closeInternal(session, { discard: false, reason: 'note-gone' })
      }
    }
    const current = states.get(clientKey)
    if (!current || (current.writes.size === 0 && current.reads.size === 0)) {
      states.delete(clientKey)
      return null
    }
    return current
  }

  function stateFor(clientKey) {
    cleanupState(clientKey)
    let state = states.get(clientKey)
    if (!state) {
      state = emptyState()
      states.set(clientKey, state)
    }
    return state
  }

  function getState(clientKey) {
    const state = cleanupState(clientKey)
    const limits = publicLimits()
    if (!state) return { write: null, writes: [], reads: [], limits }
    const writes = [...state.writes.values()]
      .sort((left, right) => left.openedAt - right.openedAt)
      .map(publicSession)
    return {
      // Keep `write` for older clients; new clients should use the full `writes` list.
      write: writes[0] || null,
      writes,
      reads: [...state.reads.values()]
        .sort((left, right) => left.openedAt - right.openedAt)
        .map(publicSession),
      limits
    }
  }

  function get(clientKey) {
    const state = cleanupState(clientKey)
    return state?.writes.values().next().value || null
  }

  function newSession({ clientKey, noteId, mode, actor, snapshot }) {
    const now = Date.now()
    return {
      id: crypto.randomUUID(),
      clientKey,
      noteId,
      mode,
      actor,
      baseRevisionId: snapshot.baseRevisionId,
      revisionNo: snapshot.revisionNo || 1,
      version: versionOf(snapshot.title, snapshot.text),
      dirty: false,
      openedAt: now,
      lastSeenAt: now,
      expiresAt: now + sessionTtl
    }
  }

  function attachSession(state, session) {
    sessionsById.set(session.id, session)
    if (session.mode === 'write') state.writes.set(session.id, session)
    else state.reads.set(session.id, session)
    schedule(session)
    onOpen?.(session)
  }

  function openResult(session, snapshot, extra = {}) {
    const described = describe(session, snapshot)
    return { session: publicSession(session), snapshot: described, ...extra }
  }

  function open({ clientKey, noteId, mode = 'write', actor = 'mcp' }) {
    if (!noteId) throw fail(400, 'note_id is required', 'note_id_required', null, 'Pass note_id from list_notes or search_notes.')
    if (mode !== 'read' && mode !== 'write') {
      throw fail(400, 'mode must be read or write', 'invalid_mode')
    }
    const head = selectHead.get(noteId)
    if (!head) {
      throw fail(404, 'Note not found', 'note_not_found', null, 'Choose an active text note from list_notes/search_notes.')
    }
    if (head.archived_at) {
      throw fail(
        409,
        'The note is archived',
        'note_archived',
        { note_id: noteId, archived_at: head.archived_at },
        'Restore the note with restore_note, then open a read or write session.'
      )
    }
    if (head.type !== 'text') {
      throw fail(400, 'Persistent MCP sessions are only available for text notes', 'unsupported_note_type', null, 'Open a text note instead of a whiteboard.')
    }
    const snapshot = textCollab.snapshot(noteId)
    if (!snapshot) {
      throw fail(404, 'Note not found', 'note_not_found', null, 'Choose an active text note from list_notes/search_notes.')
    }

    const state = stateFor(clientKey)

    const limits = currentLimits()

    if (mode === 'read') {
      const writeSame = [...state.writes.values()].find(session => session.noteId === noteId)
      if (writeSame) {
        touch(writeSame)
        return openResult(writeSame, snapshot, { mode: 'write', existing: true, read_included: true })
      }
      const existing = [...state.reads.values()].find(session => session.noteId === noteId)
      if (existing) {
        touch(existing)
        return openResult(existing, snapshot, { mode: 'read', existing: true })
      }
      if (state.reads.size >= limits.maxReads) {
        throw fail(
          429,
          `This MCP token already has ${limits.maxReads} read sessions open`,
          'too_many_reads',
          { max_reads: limits.maxReads, limits: publicLimits() },
          'Close an existing read session with note_session action=close before opening another.'
        )
      }
      const session = newSession({ clientKey, noteId, mode: 'read', actor, snapshot })
      attachSession(state, session)
      return openResult(session, snapshot, { mode: 'read', existing: false })
    }

    const writeSame = [...state.writes.values()].find(session => session.noteId === noteId)
    if (writeSame) {
      touch(writeSame)
      return openResult(writeSame, snapshot, { mode: 'write', existing: true })
    }
    if (state.writes.size >= limits.maxWrites) {
      const writes = [...state.writes.values()]
        .sort((left, right) => left.openedAt - right.openedAt)
        .map(publicSession)
      throw fail(
        429,
        `This MCP token already has ${limits.maxWrites} write sessions open`,
        'too_many_writes',
        { max_write_sessions: limits.maxWrites, writes, limits: publicLimits() },
        `Open write sessions: ${writes.map(session => `${session.session_id} (${session.note_id})`).join(', ')}. Save or close one with note_session action=close before opening another note.`
      )
    }

    let upgraded = false
    const readSame = [...state.reads.values()].find(session => session.noteId === noteId)
    if (readSame) {
      detachSession(readSame, { discard: false, reason: 'upgrade' })
      upgraded = true
    }

    const current = upgraded ? stateFor(clientKey) : state
    const session = newSession({ clientKey, noteId, mode: 'write', actor, snapshot })
    attachSession(current, session)
    return openResult(session, snapshot, { mode: 'write', existing: false, upgraded_from_read: upgraded })
  }

  function requireSession(clientKey, sessionId, mode = null) {
    if (!sessionId) {
      throw fail(
        400,
        'session_id is required for this action',
        'session_id_required',
        null,
        'Call get_note_state to list your open sessions, then pass the matching session_id.'
      )
    }
    const session = sessionsById.get(sessionId)
    if (!session || session.clientKey !== clientKey) {
      throw fail(
        404,
        'No open session with that id belongs to this MCP token',
        'session_not_found',
        null,
        'Call get_note_state to list your current session ids.'
      )
    }
    if (Date.now() > session.expiresAt) {
      closeInternal(session, { discard: false, reason: 'expired' })
      throw fail(
        410,
        'The session expired',
        'ttl_expired',
        null,
        'Call note_session action=open_write or action=open_read to start a new session.'
      )
    }
    if (mode && session.mode !== mode) {
      throw fail(
        409,
        `Session ${session.id} is a ${session.mode} session, not a ${mode} session`,
        'session_mode_mismatch',
        { session: publicSession(session) },
        session.mode === 'read'
          ? `This is a read session. Call note_session action=open_write for note ${session.noteId} to edit it.`
          : 'This is a write session; read and edit actions use it directly.'
      )
    }
    const head = selectHead.get(session.noteId)
    if (!head || head.archived_at) {
      closeInternal(session, { discard: false, reason: 'archived' })
      throw fail(
        410,
        'The open note was archived',
        'note_archived',
        null,
        'Restore the note or open another note.'
      )
    }
    if (!refreshSession(session)) {
      closeInternal(session, { discard: false, reason: 'note-gone' })
      throw fail(404, 'The open note no longer exists', 'note_gone', null, 'Open another note from list_notes/search_notes.')
    }
    touch(session)
    return session
  }

  function read({ clientKey, sessionId }) {
    const session = requireSession(clientKey, sessionId)
    const snapshot = textCollab.snapshot(session.noteId)
    if (!snapshot) throw fail(404, 'The open note no longer exists', 'note_gone')
    return describe(session, snapshot)
  }

  function assertVersion(session, expectedVersion, snapshot) {
    const version = versionOf(snapshot.title, snapshot.text)
    if (expectedVersion && expectedVersion !== version) {
      throw fail(
        409,
        'The shared draft changed since it was read; re-read before editing',
        'stale_version',
        { version, title: snapshot.title, content: snapshot.text, line_count: lineCount(snapshot.text) },
        `Call note_session action=read with session_id ${session.id}, then retry with the returned version.`
      )
    }
    return version
  }

  function applyMutation({ clientKey, sessionId, expectedVersion, mutate }) {
    const session = requireSession(clientKey, sessionId, 'write')
    const snapshot = textCollab.snapshot(session.noteId)
    if (!snapshot) throw fail(404, 'The open note no longer exists', 'note_gone')
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
    if (changed) session.dirty = true
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
        if (newText === undefined) throw fail(400, 'new_text is required', 'new_text_required')
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
        if (insertText === undefined) throw fail(400, 'text is required', 'text_required')
        const lines = lineCount(text)
        const target = Number(line)
        if (!Number.isInteger(target) || target < 1 || target > lines + 1) {
          throw fail(400, `line must be between 1 and ${lines + 1}`, 'invalid_line')
        }
        const offset = target === lines + 1 ? text.length : lineStartOffset(text, target)
        if (offset < 0) throw fail(400, 'line is outside the open note', 'invalid_line')
        let block = String(insertText ?? '')
        if (block && offset === text.length && text && !text.endsWith('\n')) block = `\n${block}`
        if (block && !block.endsWith('\n')) block += '\n'
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
        if (!oldText && startLine === undefined && endLine === undefined) {
          throw fail(400, 'old_text or start_line/end_line is required', 'delete_range_required')
        }
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
      mutate: ({ title, text }) => {
        if (nextTitle === undefined) throw fail(400, 'title is required', 'title_required')
        return { title: String(nextTitle), text }
      }
    })
  }

  function save({ clientKey, sessionId, message = null, commitMode = 'append' }) {
    const session = requireSession(clientKey, sessionId, 'write')
    const snapshot = textCollab.snapshot(session.noteId)
    if (!snapshot) throw fail(404, 'The open note no longer exists', 'note_gone')
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
      session.dirty = false
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

  function close({ clientKey, sessionId, discard = false }) {
    if (!sessionId) {
      throw fail(
        400,
        'session_id is required for close',
        'session_id_required',
        null,
        'Call get_note_state to list your open sessions, then pass the matching session_id.'
      )
    }
    const session = sessionsById.get(sessionId)
    if (!session || session.clientKey !== clientKey) {
      throw fail(
        404,
        'No open session with that id belongs to this MCP token',
        'session_not_found',
        null,
        'Call get_note_state to list your current session ids.'
      )
    }
    return closeInternal(session, { discard: !!discard, reason: 'close' })
  }

  function closeForNote(noteId, { discard = false, reason = 'note-closed' } = {}) {
    let closed = 0
    for (const session of [...sessionsById.values()]) {
      if (session.noteId !== noteId) continue
      closeInternal(session, { discard, reason })
      closed += 1
    }
    return closed
  }

  function closeForToken(clientKey, { discard = false, reason = 'token-revoked' } = {}) {
    let closed = 0
    for (const session of [...sessionsById.values()]) {
      if (session.clientKey !== clientKey) continue
      closeInternal(session, { discard, reason })
      closed += 1
    }
    return closed
  }

  function applySavedHead(noteId, revisionId, revisionNo) {
    if (!revisionId) return
    for (const session of sessionsById.values()) {
      if (session.noteId !== noteId) continue
      session.baseRevisionId = revisionId
      if (revisionNo) session.revisionNo = revisionNo
      if (session.mode === 'write') session.dirty = false
    }
  }

  function closeAll() {
    for (const session of [...sessionsById.values()]) {
      closeInternal(session, { discard: false, reason: 'shutdown' })
    }
  }

  return {
    get,
    getState,
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
    closeForToken,
    applySavedHead,
    closeAll
  }
}
