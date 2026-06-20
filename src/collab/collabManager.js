// Collaboration manager for Excalidraw whiteboard real-time sync.
// Handles: delta generation, remote apply, undo/redo via registerAction, auto-save.

const DEBOUNCE_MS = 500

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const CTRL_OR_CMD = isMac ? 'metaKey' : 'ctrlKey'

export function createCollabManager({ noteId, generateThumbnail, onStatus }) {
  // ── State ──
  let ws = null
  let api = null
  let currentElements = []
  let currentAppState = {}
  let currentFiles = {}
  let lastCommitted = new Map()         // elementId -> element (our view of server state)
  let changeTimer = null
  let needsFlush = false
  let applyingRemote = false
  const undoStack = []
  const redoStack = []
  let actionsRegistered = false
  let joined = false

  // ── Internal helpers ──

  function stripTs(el) {
    if (!el) return el
    const { _collab_ts, ...rest } = el
    return rest
  }

  function computeDiff(lastMap, elements) {
    const newMap = new Map(elements.map(el => [el.id, stripTs(el)]))
    const changes = []

    for (const [id, el] of newMap) {
      if (el.isDeleted) continue
      const old = lastMap.get(id)
      if (!old) {
        changes.push({ id, before: null, after: el })
      } else if (JSON.stringify(old) !== JSON.stringify(el)) {
        changes.push({ id, before: old, after: el })
      }
    }

    for (const [id, old] of lastMap) {
      if (!newMap.has(id) || newMap.get(id).isDeleted) {
        changes.push({ id, before: old, after: null })
      }
    }

    return changes
  }

  function updateLastCommitted(elements) {
    lastCommitted.clear()
    for (const el of elements) {
      if (!el.isDeleted) lastCommitted.set(el.id, stripTs(el))
    }
  }

  function sendMessage(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(msg))
  }

  function leaveNote() {
    if (!joined) return
    sendMessage({ type: 'leave', noteId })
    joined = false
  }

  // ── Public: handleChange (call from Excalidraw onChange) ──

  function handleChange(elements, appState, files) {
    currentElements = [...elements]
    currentAppState = appState || {}
    currentFiles = files || {}

    if (applyingRemote) return

    clearTimeout(changeTimer)
    changeTimer = setTimeout(() => flushChanges(), DEBOUNCE_MS)
  }

  // ── Flush local changes as delta ──

  async function flushChanges() {
    if (!joined) {
      needsFlush = true
      return
    }

    const elements = currentElements.filter(el => !el.isDeleted)
    const diff = computeDiff(lastCommitted, elements)
    if (diff.length === 0) return
    console.log('[collab] flushing', diff.length, 'change(s)')

    const operation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      elements: diff,
      timestamp: Date.now()
    }
    undoStack.push(operation)
    redoStack.length = 0

    // Optimistically update lastCommitted
    for (const d of diff) {
      if (d.after) lastCommitted.set(d.id, { ...d.after })
      else lastCommitted.delete(d.id)
    }

    // Build delta payload
    const deltaElements = diff
      .filter(d => d.after)
      .map(d => ({ ...d.after, id: d.id }))
    const deletedIds = diff
      .filter(d => !d.after)
      .map(d => d.id)

    if (deltaElements.length === 0 && deletedIds.length === 0) return

    // For deletions: send elements with isDeleted flag
    for (const id of deletedIds) {
      const old = diff.find(d => d.id === id)?.before
      deltaElements.push({ id, isDeleted: true, type: old?.type || 'rectangle' })
    }

    const msg = { type: 'delta', noteId, elements: deltaElements }

    try {
      const thumbnail = await generateThumbnail(currentElements, currentAppState, currentFiles)
      if (thumbnail) msg.thumbnail = thumbnail
    } catch (e) { /* thumbnail generation is best-effort */ }

    sendMessage(msg)
    onStatus?.('saved')
  }

  // ── Public: handle remote delta from server ──

  function handleRemoteDelta(msg) {
    if (!api) return
    if (!Array.isArray(msg.elements)) return
    applyingRemote = true

    const currentMap = new Map(currentElements.map(el => [el.id, el]))
    let changed = false

    for (const el of msg.elements) {
      if (!el || !el.id) continue
      const serverTs = el._collab_ts || msg.serverTs || 0
      const local = currentMap.get(el.id)
      const localTs = local?._collab_ts || 0

      if (!local || localTs <= serverTs) {
        if (el.isDeleted) {
          currentMap.delete(el.id)
        } else {
          currentMap.set(el.id, stripTs(el))
        }
        changed = true
      }
    }

    if (changed) {
      const mergedElements = [...currentMap.values()]
      currentElements = mergedElements
      updateLastCommitted(mergedElements)
      api.updateScene({ elements: mergedElements })
    }

    applyingRemote = false
  }

  // ── Public: handle snapshot from server (on join) ──

  function handleSnapshot(msg) {
    if (!api) return
    if (!Array.isArray(msg.elements)) return
    applyingRemote = true

    const cleanElements = msg.elements.map(stripTs)
    currentElements = cleanElements
    updateLastCommitted(cleanElements)
    api.updateScene({ elements: cleanElements })
    onStatus?.('loaded')

    applyingRemote = false
  }

  // ── Undo / Redo ──

  function performUndo() {
    if (undoStack.length === 0) return false
    const op = undoStack.pop()

    const currentMap = new Map(currentElements.map(el => [el.id, el]))
    let changed = false

    for (const item of op.elements) {
      const curr = currentMap.get(item.id)

      if (!item.before && item.after) {
        // Original was "create" → undo = delete
        if (curr) {
          currentMap.set(item.id, { ...curr, isDeleted: true })
          changed = true
        }
      } else if (item.before && !item.after) {
        // Original was "delete" → undo = resurrect
        if (!curr || curr.isDeleted) {
          currentMap.set(item.id, { ...item.before, isDeleted: false })
          changed = true
        }
      } else if (item.before && item.after) {
        // Original was "update" → undo = revert to before
        if (curr && !curr.isDeleted) {
          currentMap.set(item.id, { ...item.before, isDeleted: false })
          changed = true
        }
      }
    }

    if (changed) {
      const mergedElements = [...currentMap.values()]
      currentElements = mergedElements
      redoStack.push(op)

      // Apply locally and let flushChanges send the delta
      if (api) {
        applyingRemote = true
        updateLastCommitted(mergedElements)
        api.updateScene({ elements: mergedElements })
        applyingRemote = false
      }

      // Force immediate flush (no debounce) for undo
      clearTimeout(changeTimer)
      flushChanges()
      return true
    }

    // No elements were compatible — push back (no effective undo)
    undoStack.push(op)
    return false
  }

  function performRedo() {
    if (redoStack.length === 0) return false
    const op = redoStack.pop()

    const currentMap = new Map(currentElements.map(el => [el.id, el]))
    let changed = false

    for (const item of op.elements) {
      const curr = currentMap.get(item.id)

      if (!item.before && item.after) {
        // Original was "create" → redo = recreate
        if (!curr || curr.isDeleted) {
          currentMap.set(item.id, { ...item.after, isDeleted: false })
          changed = true
        }
      } else if (item.before && !item.after) {
        // Original was "delete" → redo = delete again
        if (curr && !curr.isDeleted) {
          currentMap.set(item.id, { ...curr, isDeleted: true })
          changed = true
        }
      } else if (item.before && item.after) {
        // Original was "update" → redo = re-apply after
        if (curr && !curr.isDeleted) {
          currentMap.set(item.id, { ...item.after, isDeleted: false })
          changed = true
        }
      }
    }

    if (changed) {
      const mergedElements = [...currentMap.values()]
      currentElements = mergedElements
      undoStack.push(op)

      if (api) {
        applyingRemote = true
        updateLastCommitted(mergedElements)
        api.updateScene({ elements: mergedElements })
        applyingRemote = false
      }

      clearTimeout(changeTimer)
      flushChanges()
      return true
    }

    redoStack.push(op)
    return false
  }

  // ── Register undo/redo actions via Excalidraw's registerAction ──

  function registerUndoRedo() {
    if (!api || actionsRegistered) return
    actionsRegistered = true

    api.registerAction({
      name: 'undo',
      label: 'Undo',
      perform: () => { performUndo(); return false },
      keyTest: (e) => e[CTRL_OR_CMD] && e.key === 'z' && !e.shiftKey,
      trackEvent: { category: 'history' }
    })

    api.registerAction({
      name: 'redo',
      label: 'Redo',
      perform: () => { performRedo(); return false },
      keyTest: (e) =>
        (e[CTRL_OR_CMD] && e.shiftKey && e.key === 'z') ||
        (!isMac && e.ctrlKey && !e.shiftKey && e.key === 'y'),
      trackEvent: { category: 'history' }
    })
  }

  // ── WS message routing ──

  function handleWsMessage(event) {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'delta') {
        handleRemoteDelta(data)
      } else if (data.type === 'snapshot') {
        handleSnapshot(data)
      }
    } catch (e) { /* ignore non-collab messages */ }
  }

  // ── Lifecycle ──

  function tryJoin() {
    if (joined) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!api) return
    sendMessage({ type: 'join', noteId })
    joined = true
    if (needsFlush || changeTimer) {
      clearTimeout(changeTimer)
      changeTimer = null
      needsFlush = false
      flushChanges()
    }
  }

  function attach(_ws) {
    ws = _ws
    ws.addEventListener('message', handleWsMessage)
    tryJoin()
  }

  function detach() {
    leaveNote()
    clearTimeout(changeTimer)
    changeTimer = null
    needsFlush = false
    if (ws) {
      ws.removeEventListener('message', handleWsMessage)
    }
    ws = null
    undoStack.length = 0
    redoStack.length = 0
    lastCommitted.clear()
    actionsRegistered = false
  }

  return {
    attach,
    detach,
    setAPI(_api) {
      api = _api
      try { registerUndoRedo() } catch (e) { console.error('[collab] registerUndoRedo failed:', e) }
      tryJoin()
    },
    handleChange,
    handleRemoteDelta,
    handleSnapshot,
    get undoStack() { return undoStack },
    get redoStack() { return redoStack }
  }
}
