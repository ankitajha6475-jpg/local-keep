// Client-side Yjs binding for live text notes.
//
// The server owns one Y.Doc per note. This manager keeps the local Y.Doc in
// sync, applies local markdown snapshots as minimal text changes, and reports
// remote snapshots so the Vue editor can re-render and restore the caret.

import * as Y from 'yjs'
import { bytesToBase64, base64ToBytes } from '../shared/base64.js'

function computeTextChange(oldText, newText) {
  let start = 0
  const maxStart = Math.min(oldText.length, newText.length)
  while (start < maxStart && oldText[start] === newText[start]) start += 1

  let oldEnd = oldText.length
  let newEnd = newText.length
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }

  return {
    index: start,
    deleteCount: oldEnd - start,
    insertText: newText.slice(start, newEnd)
  }
}

export function createTextCollabManager({
  noteId,
  onSnapshot,
  onRemoteChange,
  onSaved,
  onStatus
}) {
  let doc = null
  let text = null
  let meta = null

  let ws = null
  let joined = false
  let ready = false
  let destroyed = false
  let hasSnapshot = false
  let applyingRemote = false
  let baseRevisionId = null
  let revisionNo = null

  function send(message) {
    if (!ws || ws.readyState !== 1 || destroyed) return false
    try {
      ws.send(JSON.stringify(message))
      return true
    } catch (_) {
      return false
    }
  }

  function wireDoc() {
    doc.on('update', (update, origin) => {
      if (destroyed || applyingRemote) return
      if (origin === 'local' && joined) {
        send({
          type: 'text-update',
          noteId,
          update: bytesToBase64(update)
        })
      }
    })
  }

  function createDoc() {
    doc = new Y.Doc()
    text = doc.getText('content')
    meta = doc.getMap('meta')
    wireDoc()
  }

  function replaceDoc(update) {
    const old = doc
    createDoc()
    applyingRemote = true
    try {
      if (update?.length) Y.applyUpdate(doc, update, 'remote')
    } finally {
      applyingRemote = false
    }
    try { old?.destroy() } catch (_) { /* noop */ }
  }

  function payload() {
    return {
      text: text.toString(),
      title: meta.get('title') || '',
      baseRevisionId,
      revisionNo
    }
  }

  createDoc()

  function attach(socket) {
    if (destroyed) return
    if (ws === socket && joined) return
    if (ws && ws !== socket && joined) {
      send({ type: 'text-leave', noteId })
    }
    ws = socket || null
    if (!ws || ws.readyState !== 1) {
      joined = false
      return
    }
    joined = true
    onStatus?.('connecting')
    send({ type: 'text-join', noteId })
  }

  function detach() {
    if (joined) send({ type: 'text-leave', noteId })
    joined = false
    ws = null
  }

  function handleMessage(message) {
    if (!message || message.noteId !== noteId) return false

    if (message.type === 'text-snapshot' || message.type === 'text-reset') {
      const isReset = message.type === 'text-reset'
      const update = base64ToBytes(message.update)
      if (isReset) {
        // Yjs updates are additive. A reset must start from a fresh document,
        // otherwise the old draft would remain merged into the new head.
        replaceDoc(update)
      } else {
        applyingRemote = true
        try {
          Y.applyUpdate(doc, update, 'remote')
        } finally {
          applyingRemote = false
        }
      }
      if (message.baseRevisionId) baseRevisionId = message.baseRevisionId
      if (message.revisionNo) revisionNo = message.revisionNo
      ready = true
      const next = payload()
      if (!hasSnapshot || isReset) {
        hasSnapshot = true
        onSnapshot?.(next, { reset: isReset })
      } else {
        onRemoteChange?.(next)
      }
      if (!isReset && message.stateVector && joined) {
        const missing = Y.encodeStateAsUpdate(doc, base64ToBytes(message.stateVector))
        if (missing.length > 0) {
          send({
            type: 'text-update',
            noteId,
            update: bytesToBase64(missing)
          })
        }
      }
      onStatus?.('connected')
      return true
    }

    if (message.type === 'text-update') {
      applyingRemote = true
      try {
        Y.applyUpdate(doc, base64ToBytes(message.update), 'remote')
      } finally {
        applyingRemote = false
      }
      if (ready) onRemoteChange?.(payload())
      return true
    }

    if (message.type === 'text-saved') {
      if (message.baseRevisionId) baseRevisionId = message.baseRevisionId
      if (message.revisionNo) revisionNo = message.revisionNo
      onSaved?.(message)
      return true
    }

    return false
  }

  function applyMarkdown(markdown) {
    if (!ready || destroyed) return false
    const next = String(markdown ?? '')
    const current = text.toString()
    if (next === current) return false
    const change = computeTextChange(current, next)
    doc.transact(() => {
      if (change.deleteCount > 0) text.delete(change.index, change.deleteCount)
      if (change.insertText) text.insert(change.index, change.insertText)
    }, 'local')
    return true
  }

  function applyTitle(title) {
    if (!ready || destroyed) return false
    const next = String(title ?? '')
    if (meta.get('title') === next) return false
    doc.transact(() => meta.set('title', next), 'local')
    return true
  }

  function setBaseRevision(nextRevisionId) {
    if (nextRevisionId) baseRevisionId = nextRevisionId
  }

  function discardDraft() {
    if (destroyed) return
    send({ type: 'text-discard', noteId })
    ready = false
  }

  function destroy() {
    if (destroyed) return
    detach()
    destroyed = true
    try { doc?.destroy() } catch (_) { /* noop */ }
    doc = null
    text = null
    meta = null
  }

  return {
    attach,
    detach,
    destroy,
    handleMessage,
    applyMarkdown,
    applyTitle,
    setBaseRevision,
    discardDraft,
    get isReady() { return ready },
    get baseRevisionId() { return baseRevisionId }
  }
}
