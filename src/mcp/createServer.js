import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import {
  addTagsToContent,
  removeTagsFromContent,
  isValidTag,
  normalizeTag
} from '../shared/tags.js'

function actorFor(authInfo) {
  if (authInfo?.actor) return authInfo.actor
  const id = authInfo?.clientId || ''
  if (id.startsWith('mcp:') || id.startsWith('user:')) return id
  return id === 'ui' ? 'ui' : 'mcp:anonymous'
}

function requireWrite(authInfo) {
  const scopes = authInfo?.scopes || []
  if (scopes.length > 0 && !scopes.includes('write') && !scopes.includes('admin')) {
    const error = new Error('This MCP token does not have the write scope')
    error.code = 'forbidden'
    error.guide = 'Ask an admin to issue a token with the write scope.'
    throw error
  }
}

function historyText(history) {
  const lines = [`Thread ${history.noteId} (head v${history.headRevisionNo})`]
  const revisions = [...history.revisions].sort((a, b) => a.revisionNo - b.revisionNo)
  for (const rev of revisions) {
    const marker = rev.isHead ? '●' : rev.onHeadChain ? '○' : '└'
    lines.push(
      `${marker} v${rev.revisionNo} ${rev.createdAt} ${rev.actor}/${rev.source}` +
      `${rev.parentId ? ` parent=${rev.parentId}` : ''}` +
      `${rev.isHead ? ' HEAD' : rev.onHeadChain ? '' : ' branch'}`
    )
  }
  return lines.join('\n')
}

export function createMcpServer({ services, authInfo, baseUrl = '', requestRender }) {
  const { notes, revisions, tags, links, renders, search, imageStore, mcpEditing } = services
  const actor = actorFor(authInfo)
  const clientKey = authInfo?.clientId || 'mcp:anonymous'
  const server = new McpServer({ name: 'local-keep', version: '1.0.0' })

  function canWrite() {
    const scopes = authInfo?.scopes || []
    return scopes.length === 0 || scopes.includes('write') || scopes.includes('admin')
  }

  function sessionState() {
    try {
      return mcpEditing?.getState
        ? mcpEditing.getState(clientKey)
        : { write: null, writes: [], reads: [], limits: { max_write_sessions: 5, max_read_sessions: 8 } }
    } catch (_) {
      return { write: null, writes: [], reads: [], limits: { max_write_sessions: 5, max_read_sessions: 8 } }
    }
  }

  function writeSessionsFor(state) {
    if (Array.isArray(state?.writes)) return state.writes
    return state?.write ? [state.write] : []
  }

  function allowedActionsFor(state) {
    const actions = ['open_read']
    const writes = writeSessionsFor(state)
    const maxWrites = state?.limits?.max_write_sessions ?? 5
    if (canWrite() && writes.length < maxWrites) actions.push('open_write')
    if (writes.length) {
      actions.push('read')
      if (canWrite()) actions.push('replace', 'insert', 'delete', 'append', 'set_title', 'save')
      actions.push('close')
    }
    if (state.reads?.length) actions.push('read', 'close')
    return [...new Set(actions)]
  }

  function guideFor(state, error = null) {
    if (error?.guide) return error.guide
    const code = error?.code
    const writes = writeSessionsFor(state)
    if (code === 'too_many_writes' && writes.length) {
      const ids = writes.map(session => `${session.session_id} (${session.note_id})`).join(', ')
      return `Write sessions open: ${ids}. Save or close one with note_session action=close before opening another note.`
    }
    if (code === 'write_session_exists' && writes.length) {
      const ids = writes.map(session => `${session.session_id} (${session.note_id})`).join(', ')
      return `Write sessions are already open: ${ids}. Close one with note_session action=close (or action=save first), then open the other note.`
    }
    if (code === 'session_mode_mismatch') {
      return 'This action requires a write session. Call note_session action=open_write for the note, then retry.'
    }
    if (code === 'stale_version') {
      return 'The shared draft changed. Call note_session action=read with the same session_id, then retry with the returned version.'
    }
    if (code === 'session_not_found' || code === 'session_id_required') {
      return 'Call get_note_state to list the current write/read sessions and their session_id values.'
    }
    if (code === 'forbidden') {
      return 'This token does not have write scope. Ask an admin for a write token, or use a read session.'
    }
    if (code === 'ttl_expired') {
      return 'The session expired. Open a new write/read session with note_session.'
    }
    if (!canWrite()) {
      return state.reads?.length
        ? 'This token is read-only. Use note_session action=read; ask an admin for a write token to edit.'
        : 'This token is read-only. Use note_session action=open_read to read; ask an admin for a write token to edit.'
    }
    if (writes.length === 1) {
      const session = writes[0]
      return `Write session ${session.session_id} is open on note ${session.note_id}. Use note_session action=read/replace/insert/delete/append/set_title, then action=save or action=close.`
    }
    if (writes.length > 1) {
      const ids = writes.map(session => `${session.session_id} (${session.note_id})`).join(', ')
      return `Write sessions open: ${ids}. Pass the matching session_id to read/replace/insert/delete/append/set_title, then action=save or action=close.`
    }
    if (state.reads?.length) {
      const ids = state.reads.map(session => `${session.session_id} (${session.note_id})`).join(', ')
      return `Read session(s) open: ${ids}. Use note_session action=read; use action=open_write to edit.`
    }
    return 'No session is open for this token. Use note_session action=open_write to edit or action=open_read to read.'
  }

  function text(value) {
    if (Array.isArray(value)) {
      return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
    }
    if (typeof value === 'string') {
      return { content: [{ type: 'text', text: value }] }
    }
    const state = sessionState()
    const meta = {
      state,
      allowed_actions: allowedActionsFor(state),
      guide: guideFor(state)
    }
    if (value && typeof value === 'object') {
      return { content: [{ type: 'text', text: JSON.stringify({ ...value, ...meta }, null, 2) }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify({ result: value, ...meta }, null, 2) }] }
  }

  function fail(message) {
    const state = sessionState()
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: { code: 'tool_error', message: String(message) },
          state,
          allowed_actions: allowedActionsFor(state),
          guide: guideFor(state)
        }, null, 2)
      }],
      isError: true
    }
  }

  function failError(error) {
    const state = sessionState()
    const data = error?.data && typeof error.data === 'object' ? error.data : {}
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: {
            code: error?.code || 'tool_error',
            message: error?.message || String(error),
            ...data
          },
          state,
          allowed_actions: allowedActionsFor(state),
          guide: guideFor(state, error)
        }, null, 2)
      }],
      isError: true
    }
  }

  function assertNoWriteSession() {
    const state = sessionState()
    const writes = writeSessionsFor(state)
    if (!writes.length) return
    const ids = writes.map(session => `${session.session_id} (${session.note_id})`).join(', ')
    const error = new Error(`A write session is already open on note ${writes[0].note_id}`)
    error.code = 'active_write_session'
    error.guide = `Open write sessions: ${ids}. Use note_session with the matching session_id for edits, then action=save or action=close. For a one-shot edit, close the session(s) first.`
    throw error
  }

  function noteSummary(note, extra = {}) {
    if (!note) return null
    return {
      id: note.id,
      title: note.title || '',
      displayTitle: note.displayTitle || note.display_title || '',
      type: note.type,
      revisionId: note.revisionId || note.head_revision_id || null,
      revisionNo: note.revisionNo || note.revision_no || 1,
      archivedAt: note.archivedAt || note.archived_at || null,
      color: note.color || null,
      tags: note.tags || [],
      linkCount: note.linkCount || 0,
      backlinkCount: note.backlinkCount || 0,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      contentLength: typeof note.content === 'string' ? note.content.length : 0,
      ...extra
    }
  }

  function revisionSummary(revision) {
    if (!revision) return null
    return {
      id: revision.id,
      noteId: revision.noteId || revision.note_id || null,
      revisionNo: revision.revisionNo || revision.revision_no || 1,
      title: revision.title || '',
      displayTitle: revision.displayTitle || revision.display_title || '',
      type: revision.type,
      actor: revision.actor,
      source: revision.source,
      message: revision.message || null,
      createdAt: revision.createdAt || revision.created_at || null,
      contentLength: typeof revision.content === 'string' ? revision.content.length : 0
    }
  }

  function appendMarkdown(base, addition) {
    const left = String(base ?? '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n+$/, '')
    const right = String(addition ?? '')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
    if (!left) return right
    if (!right) return left
    return `${left}\n\n${right}`
  }

  function normalizeTagInput(input) {
    if (!Array.isArray(input) || input.length === 0) {
      const error = new Error('At least one tag is required')
      error.code = 'tags_required'
      error.guide = 'Pass tags such as ["project", "project/local"] (the leading # is optional).'
      throw error
    }
    const normalized = []
    for (const raw of input) {
      if (!isValidTag(raw)) {
        const error = new Error(`Invalid tag: ${String(raw)}`)
        error.code = 'invalid_tag'
        error.guide = 'Tags must start with a letter and may contain letters, numbers, _, - and /. Hex colours and empty tags are rejected.'
        throw error
      }
      const tag = normalizeTag(raw).replace(/[/-]+$/, '')
      if (!normalized.includes(tag)) normalized.push(tag)
    }
    return normalized
  }

  function assertActiveNote(note) {
    if (!note) {
      const error = new Error('Note not found')
      error.code = 'note_not_found'
      throw error
    }
    if (note.archivedAt) {
      const error = new Error('The note is archived')
      error.code = 'note_archived'
      error.data = { note_id: note.id, archived_at: note.archivedAt }
      error.guide = 'Restore the note with restore_note before adding or removing tags.'
      throw error
    }
  }

  function mutationResponse(result, historyUrl, includeContent = false) {
    return {
      note: includeContent ? result : noteSummary(result),
      revision: includeContent ? result.revision : revisionSummary(result.revision),
      previous_revision: includeContent ? result.previousRevision : revisionSummary(result.previousRevision),
      conflict: !!result.conflict,
      notice: result.notice,
      history_url: historyUrl
    }
  }

  function runTagOperation({ noteIds, tagInput, mode, dryRun = false, commitMode = 'append', message = null }) {
    requireWrite(authInfo)
    assertNoWriteSession()
    const tags = normalizeTagInput(tagInput)
    const uniqueIds = [...new Set(noteIds)]
    const results = []
    let changed = 0
    let skipped = 0
    let failed = 0

    for (const noteId of uniqueIds) {
      try {
        const note = notes.getNote(noteId)
        if (note.archivedAt) {
          skipped += 1
          results.push({
            note_id: noteId,
            title: note.title || '',
            changed: false,
            skipped: 'note_archived',
            archived_at: note.archivedAt,
            guide: 'Restore the note with restore_note before changing its tags.'
          })
          continue
        }

        const change = mode === 'add'
          ? addTagsToContent(note.content, tags)
          : removeTagsFromContent(note.content, tags)
        const affected = mode === 'add' ? change.added : change.removed
        if (affected.length === 0) {
          results.push({
            ...noteSummary(note),
            changed: false,
            [mode === 'add' ? 'added' : 'removed']: [],
            tags: note.tags || []
          })
          continue
        }

        if (dryRun) {
          changed += 1
          results.push({
            ...noteSummary(note),
            changed: true,
            dry_run: true,
            [mode === 'add' ? 'would_add' : 'would_remove']: affected,
            tags: note.tags || []
          })
          continue
        }

        const updated = notes.updateNote({
          id: noteId,
          title: note.title,
          content: change.content,
          baseRevisionId: note.revisionId,
          mode: commitMode,
          actor,
          source: 'mcp',
          message: message || (mode === 'add'
            ? `Add tags: ${affected.map(tag => `#${tag}`).join(' ')}`
            : `Remove tags: ${affected.map(tag => `#${tag}`).join(' ')}`)
        })
        changed += 1
        results.push({
          ...noteSummary(updated),
          changed: true,
          [mode === 'add' ? 'added' : 'removed']: affected,
          tags: updated.tags || [],
          conflict: !!updated.conflict,
          notice: updated.notice
        })
      } catch (error) {
        failed += 1
        results.push({
          note_id: noteId,
          changed: false,
          error: {
            code: error?.code || 'tool_error',
            message: error?.message || String(error)
          }
        })
      }
    }

    return {
      ok: failed === 0,
      partial: failed > 0 && changed > 0,
      mode,
      dry_run: !!dryRun,
      results,
      summary: {
        requested: uniqueIds.length,
        changed,
        skipped,
        failed
      }
    }
  }

  function relatedAppendix(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return ''
    const parts = []
    for (const id of ids) {
      try {
        const note = notes.getNote(id)
        parts.push(`[[note:${id}|${note.displayTitle || note.title || id}]]`)
      } catch (_) { /* ignore missing related note */ }
    }
    return parts.length ? `\n\nRelated: ${parts.join(' ')}` : ''
  }

  server.registerTool('search_notes', {
    description: 'Search notes and whiteboards. Returns timestamps, revision, tags, links, and render info.',
    inputSchema: z.object({
      query: z.string().optional(),
      mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
      tags: z.array(z.string()).optional(),
      tag_mode: z.enum(['any', 'all']).optional(),
      type: z.enum(['text', 'canvas']).optional(),
      created_after: z.string().optional(),
      created_before: z.string().optional(),
      updated_after: z.string().optional(),
      updated_before: z.string().optional(),
      include_archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional()
    })
  }, async (args) => {
    try {
      return text(await search.search({
        query: args.query || '',
        mode: args.mode || 'keyword',
        tags: args.tags || [],
        tagMode: args.tag_mode || 'any',
        type: args.type || null,
        createdAfter: args.created_after || null,
        createdBefore: args.created_before || null,
        updatedAfter: args.updated_after || null,
        updatedBefore: args.updated_before || null,
        includeArchived: !!args.include_archived,
        limit: args.limit || 20,
        offset: args.offset || 0
      }))
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('list_notes', {
    description: 'List notes/whiteboards with the same summary shape as search.',
    inputSchema: z.object({
      tags: z.array(z.string()).optional(),
      tag_mode: z.enum(['any', 'all']).optional(),
      type: z.enum(['text', 'canvas']).optional(),
      include_archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional()
    })
  }, async (args) => {
    try {
      return text(await search.search({
        query: '',
        tags: args.tags || [],
        tagMode: args.tag_mode || 'any',
        type: args.type || null,
        includeArchived: !!args.include_archived,
        limit: args.limit || 20,
        offset: args.offset || 0
      }))
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('semantic_search', {
    description: 'Vector similarity search using the admin-configured embedding model. Returns timestamps/chunks and notes.',
    inputSchema: z.object({
      query: z.string(),
      tags: z.array(z.string()).optional(),
      tag_mode: z.enum(['any', 'all']).optional(),
      type: z.enum(['text', 'canvas']).optional(),
      include_archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional()
    })
  }, async (args) => {
    try {
      return text(await search.search({
        query: args.query,
        mode: 'semantic',
        tags: args.tags || [],
        tagMode: args.tag_mode || 'any',
        type: args.type || null,
        includeArchived: !!args.include_archived,
        limit: args.limit || 20,
        offset: args.offset || 0
      }))
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('get_note', {
    description: 'Read a note by id, or a historical revision. Optionally include history, links, backlinks, and whiteboard summary.',
    inputSchema: z.object({
      note_id: z.string(),
      revision_id: z.string().optional(),
      include_history: z.boolean().optional(),
      include_links: z.boolean().optional(),
      include_backlinks: z.boolean().optional(),
      include_canvas: z.boolean().optional()
    })
  }, async (args) => {
    try {
      let note = notes.getNote(args.note_id)
      const includeCanvas = args.include_canvas === true
      if (note.type === 'canvas' && !includeCanvas) {
        const { canvasData, thumbnail, ...rest } = note
        note = { ...rest, canvas_omitted: true }
      }
      const result = { note }
      if (args.revision_id) {
        const revision = revisions.getRevision(args.revision_id)
        if (!revision || revision.note_id !== args.note_id) throw new Error('Revision not found')
        result.revision = {
          id: revision.id,
          noteId: revision.note_id,
          parentId: revision.parent_revision_id,
          revisionNo: revision.revision_no,
          title: revision.title,
          content: revision.content,
          type: revision.type,
          ...(includeCanvas ? { canvasData: revision.canvas_data } : {}),
          actor: revision.actor,
          source: revision.source,
          createdAt: revision.created_at
        }
      }
      if (args.include_history) result.history = notes.history(args.note_id)
      if (args.include_links) result.links = links.outgoing(args.note_id)
      if (args.include_backlinks) result.backlinks = links.backlinks(args.note_id)
      if (note.type === 'canvas') result.whiteboard = renders.latest(args.note_id)
      return text(result)
    } catch (e) { return failError(e) }
  })

  server.registerTool('create_note', {
    description: 'Create a markdown note. Creates revision 1 and can reference related notes.',
    inputSchema: z.object({
      title: z.string().optional(),
      content: z.string(),
      tags: z.array(z.string()).optional(),
      related_note_ids: z.array(z.string()).optional()
    })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      let content = `${args.content || ''}${relatedAppendix(args.related_note_ids)}`
      if (Array.isArray(args.tags) && args.tags.length) {
        const normalizedTags = normalizeTagInput(args.tags)
        content = addTagsToContent(content, normalizedTags).content
      }
      const note = notes.createNote({
        title: args.title || '',
        content,
        actor,
        source: 'mcp'
      })
      const head = revisions.getHead(note.id)
      return text({
        note,
        revision: head ? revisions.getRevision(head.head_revision_id) : null,
        notice: 'Created revision 1.'
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('edit_note', {
    description: 'Edit a note as a new revision in one shot. Use note_session for persistent read/write sessions. commit_mode controls stale-base handling.',
    inputSchema: z.object({
      note_id: z.string(),
      commit_mode: z.enum(['append', 'branch', 'take_head']).optional(),
      base_revision_id: z.string().optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
      message: z.string().optional(),
      related_note_ids: z.array(z.string()).optional(),
      include_content: z.boolean().optional()
    })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      assertNoWriteSession()
      const note = notes.getNote(args.note_id)
      assertActiveNote(note)
      let content = args.content
      if (args.related_note_ids?.length) {
        content = (content !== undefined ? content : note.content) + relatedAppendix(args.related_note_ids)
      }
      let addedTags = []
      if (Array.isArray(args.tags) && args.tags.length) {
        const normalizedTags = normalizeTagInput(args.tags)
        const change = addTagsToContent(content !== undefined ? content : note.content, normalizedTags)
        content = change.content
        addedTags = change.added
      }
      if (content === undefined && args.title === undefined) {
        throw new Error('edit_note requires title, content, or tags')
      }
      const result = notes.updateNote({
        id: args.note_id,
        title: args.title,
        content,
        baseRevisionId: args.base_revision_id || null,
        mode: args.commit_mode || 'append',
        actor,
        source: 'mcp',
        message: args.message || (addedTags.length ? `Add tags: ${addedTags.map(tag => `#${tag}`).join(' ')}` : null)
      })
      return text({
        ...mutationResponse(result, `${baseUrl}/#/note/${encodeURIComponent(args.note_id)}/history`, args.include_content === true),
        ...(addedTags.length ? { tags_added: addedTags } : {})
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('append_to_note', {
    description: 'Append markdown to a note as a new revision in one shot. Use note_session for persistent sessions.',
    inputSchema: z.object({
      note_id: z.string(),
      content: z.string(),
      commit_mode: z.enum(['append', 'branch', 'take_head']).optional(),
      base_revision_id: z.string().optional(),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
      message: z.string().optional(),
      include_content: z.boolean().optional()
    })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      assertNoWriteSession()
      const note = notes.getNote(args.note_id)
      assertActiveNote(note)
      let content = appendMarkdown(note.content || '', args.content)
      let addedTags = []
      if (Array.isArray(args.tags) && args.tags.length) {
        const normalizedTags = normalizeTagInput(args.tags)
        const change = addTagsToContent(content, normalizedTags)
        content = change.content
        addedTags = change.added
      }
      const result = notes.updateNote({
        id: args.note_id,
        title: args.title !== undefined ? args.title : note.title,
        content,
        baseRevisionId: args.base_revision_id || note.revisionId,
        mode: args.commit_mode || 'append',
        actor,
        source: 'mcp',
        message: args.message || (addedTags.length
          ? `Append and add tags: ${addedTags.map(tag => `#${tag}`).join(' ')}`
          : 'append via MCP')
      })
      return text({
        ...mutationResponse(result, `${baseUrl}/#/note/${encodeURIComponent(args.note_id)}/history`, args.include_content === true),
        ...(addedTags.length ? { tags_added: addedTags } : {})
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('add_tags', {
    description: 'Add inline tags to one or more notes as new revisions. Supports dry_run. Archived notes must be restored first.',
    inputSchema: z.object({
      note_ids: z.array(z.string().min(1)).min(1).max(100),
      tags: z.array(z.string().min(1)).min(1).max(100),
      dry_run: z.boolean().optional(),
      commit_mode: z.enum(['append', 'branch', 'take_head']).optional(),
      message: z.string().optional()
    })
  }, async (args) => {
    try {
      return text(runTagOperation({
        noteIds: args.note_ids,
        tagInput: args.tags,
        mode: 'add',
        dryRun: args.dry_run === true,
        commitMode: args.commit_mode || 'append',
        message: args.message || null
      }))
    } catch (e) { return failError(e) }
  })

  server.registerTool('remove_tags', {
    description: 'Remove exact inline tags from one or more notes as new revisions. Supports dry_run. Archived notes must be restored first.',
    inputSchema: z.object({
      note_ids: z.array(z.string().min(1)).min(1).max(100),
      tags: z.array(z.string().min(1)).min(1).max(100),
      dry_run: z.boolean().optional(),
      commit_mode: z.enum(['append', 'branch', 'take_head']).optional(),
      message: z.string().optional()
    })
  }, async (args) => {
    try {
      return text(runTagOperation({
        noteIds: args.note_ids,
        tagInput: args.tags,
        mode: 'remove',
        dryRun: args.dry_run === true,
        commitMode: args.commit_mode || 'append',
        message: args.message || null
      }))
    } catch (e) { return failError(e) }
  })

  server.registerTool('get_note_state', {
    description: 'Return the current read/write session state for this MCP token, including allowed actions and a next-step guide.',
    inputSchema: z.object({})
  }, async () => {
    try {
      return text({})
    } catch (e) { return failError(e) }
  })

  server.registerTool('note_session', {
    description: 'Manage persistent note sessions. State is explicit: multiple write sessions (default limit 5) and read sessions per token. Every result includes state, allowed_actions, and a guide.',
    inputSchema: z.object({
      action: z.enum([
        'status',
        'open_read',
        'open_write',
        'read',
        'replace',
        'insert',
        'delete',
        'append',
        'set_title',
        'save',
        'close'
      ]),
      note_id: z.string().optional(),
      session_id: z.string().optional(),
      old_text: z.string().optional(),
      new_text: z.string().optional(),
      replace_all: z.boolean().optional(),
      line: z.number().int().min(1).optional(),
      text: z.string().optional(),
      start_line: z.number().int().min(1).optional(),
      end_line: z.number().int().min(1).optional(),
      title: z.string().optional(),
      expected_version: z.string().optional(),
      message: z.string().optional(),
      commit_mode: z.enum(['append', 'branch', 'take_head']).optional(),
      discard: z.boolean().optional()
    })
  }, async (args) => {
    try {
      if (!mcpEditing) throw new Error('Persistent MCP sessions are unavailable')

      if (args.action === 'status') return text({})

      if (args.action === 'open_read' || args.action === 'open_write') {
        if (!args.note_id) {
          const error = new Error('note_id is required for open_read/open_write')
          error.code = 'note_id_required'
          error.guide = 'Pass note_id from list_notes or search_notes.'
          throw error
        }
        if (args.action === 'open_write') requireWrite(authInfo)
        return text(mcpEditing.open({
          clientKey,
          noteId: args.note_id,
          mode: args.action === 'open_write' ? 'write' : 'read',
          actor
        }))
      }

      if (args.action === 'save' || args.action === 'replace' || args.action === 'insert' ||
          args.action === 'delete' || args.action === 'append' || args.action === 'set_title') {
        requireWrite(authInfo)
      }

      switch (args.action) {
        case 'read':
          return text(mcpEditing.read({ clientKey, sessionId: args.session_id }))
        case 'replace':
          return text(mcpEditing.replace({
            clientKey,
            sessionId: args.session_id,
            oldText: args.old_text,
            newText: args.new_text,
            replaceAll: !!args.replace_all,
            expectedVersion: args.expected_version
          }))
        case 'insert':
          return text(mcpEditing.insert({
            clientKey,
            sessionId: args.session_id,
            line: args.line,
            text: args.text,
            expectedVersion: args.expected_version
          }))
        case 'delete':
          return text(mcpEditing.remove({
            clientKey,
            sessionId: args.session_id,
            oldText: args.old_text,
            startLine: args.start_line,
            endLine: args.end_line,
            replaceAll: !!args.replace_all,
            expectedVersion: args.expected_version
          }))
        case 'append':
          return text(mcpEditing.append({
            clientKey,
            sessionId: args.session_id,
            text: args.text,
            expectedVersion: args.expected_version
          }))
        case 'set_title':
          return text(mcpEditing.setTitle({
            clientKey,
            sessionId: args.session_id,
            title: args.title,
            expectedVersion: args.expected_version
          }))
        case 'save':
          return text(mcpEditing.save({
            clientKey,
            sessionId: args.session_id,
            message: args.message || null,
            commitMode: args.commit_mode || 'append'
          }))
        case 'close':
          return text(mcpEditing.close({
            clientKey,
            sessionId: args.session_id,
            discard: !!args.discard
          }))
        default: {
          const error = new Error(`Unknown note_session action: ${args.action}`)
          error.code = 'unknown_action'
          throw error
        }
      }
    } catch (e) { return failError(e) }
  })

  server.registerTool('get_thread', {
    description: 'Read the revision tree of a note, including branches and head-chain markers.',
    inputSchema: z.object({
      note_id: z.string(),
      format: z.enum(['json', 'text']).optional()
    })
  }, async (args) => {
    try {
      const history = notes.history(args.note_id)
      if ((args.format || 'json') === 'text') return text(historyText(history))
      return text(history)
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('get_links', {
    description: 'List outgoing wiki links for a note.',
    inputSchema: z.object({ note_id: z.string(), include_archived: z.boolean().optional() })
  }, async (args) => {
    try { return text(links.outgoing(args.note_id, { includeArchived: !!args.include_archived })) }
    catch (e) { return fail(e.message) }
  })

  server.registerTool('get_backlinks', {
    description: 'List notes linking to a note, with context snippets.',
    inputSchema: z.object({ note_id: z.string(), include_archived: z.boolean().optional() })
  }, async (args) => {
    try { return text(links.backlinks(args.note_id, { includeArchived: !!args.include_archived })) }
    catch (e) { return fail(e.message) }
  })

  server.registerTool('get_graph', {
    description: 'Get a relationship graph, optionally a neighbourhood around one note.',
    inputSchema: z.object({
      note_id: z.string().optional(),
      depth: z.number().int().min(1).max(3).optional(),
      tag: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      include_unresolved: z.boolean().optional()
    })
  }, async (args) => {
    try {
      return text(links.graph({
        noteId: args.note_id || null,
        depth: args.depth || 1,
        tag: args.tag || null,
        limit: args.limit || 300,
        includeUnresolved: !!args.include_unresolved
      }))
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('list_tags', {
    description: 'Get the hierarchical tag tree with direct/subtree counts and an untagged count.',
    inputSchema: z.object({ prefix: z.string().optional() })
  }, async (args) => {
    try { return text(tags.tree({ prefix: args.prefix || '' })) }
    catch (e) { return fail(e.message) }
  })

  server.registerTool('get_whiteboard', {
    description: 'Recall a whiteboard as ordered page images, markdown image refs, URLs, or a manifest.',
    inputSchema: z.object({
      note_id: z.string(),
      format: z.enum(['images', 'markdown', 'urls', 'manifest']).optional(),
      max_tiles: z.number().int().min(1).max(20).optional(),
      render_if_stale: z.boolean().optional()
    })
  }, async (args) => {
    try {
      let manifest = renders.latest(args.note_id)
      let requested = false
      if (manifest.stale && args.render_if_stale && typeof requestRender === 'function') {
        const result = await requestRender(args.note_id, 20000)
        requested = !!result?.requested
        if (result?.manifest) manifest = result.manifest
      }
      const format = args.format || 'images'
      const maxTiles = args.max_tiles || 4
      const absolute = tile => `${baseUrl}${tile.url}`
      const meta = {
        note_id: args.note_id,
        render_id: manifest.renderId,
        status: manifest.status,
        stale: manifest.stale,
        rendered_at: manifest.renderedAt,
        tile_count: manifest.tileCount,
        requested,
        tiles: manifest.tiles.map(tile => ({
          page: tile.pageIndex + 1,
          url: absolute(tile),
          width: tile.width,
          height: tile.height,
          clipped: tile.clipped
        }))
      }

      if (format === 'manifest') return text(manifest)
      if (format === 'urls') return text(meta)
      if (format === 'markdown') {
        const lines = [
          `# Whiteboard (${manifest.tileCount} page${manifest.tileCount === 1 ? '' : 's'})`,
          ''
        ]
        for (const tile of manifest.tiles) {
          lines.push(`![Whiteboard page ${tile.pageIndex + 1}](${absolute(tile)})`)
        }
        lines.push('', `Rendered: ${manifest.renderedAt || 'never'}`, `Stale: ${manifest.stale}`)
        return text(lines.join('\n'))
      }

      const state = sessionState()
      const content = [{
        type: 'text',
        text: JSON.stringify({
          ...meta,
          state,
          allowed_actions: allowedActionsFor(state),
          guide: guideFor(state),
          notice: manifest.stale
            ? 'The render is stale; call request_whiteboard_render or pass render_if_stale with a connected browser.'
            : undefined
        }, null, 2)
      }]
      for (const tile of manifest.tiles.slice(0, maxTiles)) {
        const buffer = imageStore.readImageBuffer(tile.hash, tile.ext)
        if (buffer) {
          content.push({
            type: 'image',
            data: buffer.toString('base64'),
            mimeType: tile.ext === 'jpg' ? 'image/jpeg' : `image/${tile.ext}`
          })
        }
      }
      return { content }
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('request_whiteboard_render', {
    description: 'Ask a connected browser to render whiteboard pages and wait for the manifest.',
    inputSchema: z.object({
      note_id: z.string(),
      timeout_ms: z.number().int().min(1000).max(60000).optional()
    })
  }, async (args) => {
    try {
      if (typeof requestRender !== 'function') return text({ requested: false, reason: 'no-client' })
      const result = await requestRender(args.note_id, args.timeout_ms || 20000)
      return text(result)
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('list_changes', {
    description: 'List note/revision lifecycle events since an ISO timestamp.',
    inputSchema: z.object({
      since: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional()
    })
  }, async (args) => {
    try {
      const since = args.since || '1970-01-01T00:00:00.000Z'
      const rows = services.db.prepare(`
        SELECT id, note_id, revision_id, type, actor, payload, created_at
        FROM note_events
        WHERE created_at > ?
        ORDER BY created_at ASC
        LIMIT ?
      `).all(since, args.limit || 100)
      return text({
        since,
        events: rows.map(row => ({
          id: row.id,
          note_id: row.note_id,
          revision_id: row.revision_id,
          type: row.type,
          actor: row.actor,
          payload: row.payload ? JSON.parse(row.payload) : null,
          created_at: row.created_at
        }))
      })
    } catch (e) { return fail(e.message) }
  })

  server.registerTool('archive_note', {
    description: 'Archive a note (history retained). Use purge_note for permanent deletion.',
    inputSchema: z.object({ note_id: z.string() })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      const before = notes.getNote(args.note_id)
      const note = notes.archiveNote(args.note_id, actor, 'mcp')
      return text({
        note: noteSummary(note),
        notice: before.archivedAt ? 'Note was already archived.' : 'Note archived.'
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('restore_note', {
    description: 'Restore an archived note.',
    inputSchema: z.object({ note_id: z.string() })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      const before = notes.getNote(args.note_id)
      const note = notes.restoreNote(args.note_id, actor, 'mcp')
      return text({
        note: noteSummary(note),
        notice: before.archivedAt ? 'Note restored.' : 'Note was not archived.'
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('purge_note', {
    description: 'Permanently delete an archived note, its revisions, and its image references. Requires confirm=true; omit confirm for a preview.',
    inputSchema: z.object({
      note_id: z.string(),
      confirm: z.boolean().optional(),
      dry_run: z.boolean().optional(),
      expected_title: z.string().optional()
    })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      assertNoWriteSession()
      const note = notes.getNote(args.note_id)
      if (!note.archivedAt) {
        const error = new Error('Only archived notes can be purged')
        error.code = 'note_not_archived'
        error.data = { note_id: note.id, archived_at: null }
        error.guide = 'Archive the note first with archive_note. Active notes are never purged by purge_note.'
        throw error
      }
      if (args.expected_title !== undefined &&
          String(note.title || '').trim() !== String(args.expected_title).trim()) {
        const error = new Error('The note title does not match expected_title')
        error.code = 'title_mismatch'
        error.data = { note_id: note.id, title: note.title || '', expected_title: args.expected_title }
        throw error
      }
      const summary = noteSummary(note)
      if (args.confirm !== true || args.dry_run === true) {
        return text({
          mode: 'preview',
          note: summary,
          next_step: 'Call purge_note again with confirm: true to permanently delete this note.'
        })
      }
      notes.purgeNote(args.note_id, actor, 'mcp')
      return text({
        mode: 'purged',
        note: summary,
        notice: 'Note and all revisions were permanently deleted.'
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('purge_archived', {
    description: 'Permanently delete archived notes. Without confirm it returns a preview. Purging all archived notes requires expected_count.',
    inputSchema: z.object({
      note_ids: z.array(z.string().min(1)).min(1).max(500).optional(),
      expected_count: z.number().int().min(0).optional(),
      confirm: z.boolean().optional(),
      dry_run: z.boolean().optional()
    })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      assertNoWriteSession()
      const archived = notes.listArchivedNotes()
      const archivedById = new Map(archived.map(note => [note.id, note]))
      let candidates = archived

      if (Array.isArray(args.note_ids) && args.note_ids.length) {
        const wanted = [...new Set(args.note_ids)]
        const active = []
        const missing = []
        for (const id of wanted) {
          if (archivedById.has(id)) continue
          try {
            const note = notes.getNote(id)
            if (!note.archivedAt) active.push(id)
          } catch (_) {
            missing.push(id)
          }
        }
        if (active.length) {
          const error = new Error('Some requested notes are not archived')
          error.code = 'note_not_archived'
          error.data = { active_note_ids: active }
          error.guide = 'Archive active notes first, then call purge_archived again.'
          throw error
        }
        if (missing.length) {
          const error = new Error('Some requested notes were not found')
          error.code = 'note_not_found'
          error.data = { missing_note_ids: missing }
          throw error
        }
        const wantedSet = new Set(wanted)
        candidates = archived.filter(note => wantedSet.has(note.id))
      }

      if (args.expected_count !== undefined && args.expected_count !== candidates.length) {
        const error = new Error('The archived-note count does not match expected_count')
        error.code = 'count_mismatch'
        error.data = {
          expected_count: args.expected_count,
          actual_count: candidates.length,
          notes: candidates.map(note => ({
            id: note.id,
            title: note.title,
            archived_at: note.archivedAt,
            revision_no: note.revisionNo
          }))
        }
        error.guide = 'Review the list, then retry with the current count. Nothing was deleted.'
        throw error
      }

      const preview = args.confirm !== true || args.dry_run === true
      if (preview) {
        return text({
          mode: 'preview',
          count: candidates.length,
          notes: candidates.map(note => ({
            id: note.id,
            title: note.title,
            archived_at: note.archivedAt,
            revision_no: note.revisionNo
          })),
          next_step: Array.isArray(args.note_ids) && args.note_ids.length
            ? 'Call purge_archived again with confirm: true to permanently delete these notes.'
            : 'Call purge_archived again with confirm: true and expected_count matching count to permanently delete all archived notes.'
        })
      }

      if ((!Array.isArray(args.note_ids) || args.note_ids.length === 0) &&
          args.expected_count === undefined) {
        const error = new Error('expected_count is required when purging all archived notes')
        error.code = 'expected_count_required'
        error.data = { count: candidates.length }
        error.guide = 'Pass expected_count from the preview to guard against deleting an unexpected set. Nothing was deleted.'
        throw error
      }

      const purged = []
      const failed = []
      for (const note of candidates) {
        try {
          notes.purgeNote(note.id, actor, 'mcp')
          purged.push(note)
        } catch (error) {
          failed.push({
            id: note.id,
            title: note.title,
            error: { code: error?.code || 'tool_error', message: error?.message || String(error) }
          })
        }
      }
      return text({
        mode: 'purged',
        count: purged.length,
        notes: purged.map(note => ({
          id: note.id,
          title: note.title,
          archived_at: note.archivedAt,
          revision_no: note.revisionNo
        })),
        failed_count: failed.length,
        failed
      })
    } catch (e) { return failError(e) }
  })

  server.registerTool('promote_revision', {
    description: 'Promote a branch revision into a new head revision.',
    inputSchema: z.object({ note_id: z.string(), revision_id: z.string() })
  }, async (args) => {
    try {
      requireWrite(authInfo)
      return text(notes.promoteRevision(args.note_id, args.revision_id, actor))
    } catch (e) { return fail(e.message) }
  })

  // Resources
  server.registerResource(
    'note',
    new ResourceTemplate('local-keep://notes/{noteId}', { list: undefined }),
    { description: 'Current note markdown', mimeType: 'text/markdown' },
    async (uri, { noteId }) => {
      const note = notes.getNote(decodeURIComponent(String(noteId)))
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: note.content || '' }] }
    }
  )

  server.registerResource(
    'revision',
    new ResourceTemplate('local-keep://notes/{noteId}/revisions/{revisionId}', { list: undefined }),
    { description: 'Historical revision markdown', mimeType: 'text/markdown' },
    async (uri, { noteId, revisionId }) => {
      const revision = revisions.getRevision(decodeURIComponent(String(revisionId)))
      if (!revision || revision.note_id !== decodeURIComponent(String(noteId))) {
        throw new Error('Revision not found')
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: revision.content || '' }] }
    }
  )

  server.registerResource(
    'thread',
    new ResourceTemplate('local-keep://notes/{noteId}/thread', { list: undefined }),
    { description: 'Revision tree JSON', mimeType: 'application/json' },
    async (uri, { noteId }) => {
      const history = notes.history(decodeURIComponent(String(noteId)))
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(history) }] }
    }
  )

  server.registerResource(
    'backlinks',
    new ResourceTemplate('local-keep://notes/{noteId}/backlinks', { list: undefined }),
    { description: 'Backlinks JSON', mimeType: 'application/json' },
    async (uri, { noteId }) => {
      const data = links.backlinks(decodeURIComponent(String(noteId)))
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }] }
    }
  )

  server.registerResource(
    'tags',
    'local-keep://tags',
    { description: 'Tag tree JSON', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(tags.tree()) }]
    })
  )

  server.registerResource(
    'whiteboard-page',
    new ResourceTemplate('local-keep://whiteboards/{noteId}/pages/{page}', { list: undefined }),
    { description: 'Whiteboard page image', mimeType: 'image/png' },
    async (uri, { noteId, page }) => {
      const manifest = renders.latest(decodeURIComponent(String(noteId)))
      const tile = manifest.tiles[Math.max(0, Number(page) - 1)]
      if (!tile) throw new Error('Page not found')
      const buffer = imageStore.readImageBuffer(tile.hash, tile.ext)
      if (!buffer) throw new Error('Page image not found')
      return {
        contents: [{
          uri: uri.href,
          mimeType: tile.ext === 'jpg' ? 'image/jpeg' : `image/${tile.ext}`,
          blob: buffer.toString('base64')
        }]
      }
    }
  )

  return server
}
