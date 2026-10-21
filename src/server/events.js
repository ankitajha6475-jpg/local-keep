import { EventEmitter } from 'node:events'

/**
 * Shared event bus. Services emit domain events; the WebSocket broadcaster,
 * MCP notifier, and tests subscribe. Keeping this separate prevents services
 * from importing Express/WS.
 */
export function createEventBus() {
  const bus = new EventEmitter()
  bus.setMaxListeners(100)
  return bus
}

export const EVENTS = {
  NOTE_CREATED: 'note.created',
  NOTE_REVISED: 'note.revised',
  NOTE_ARCHIVED: 'note.archived',
  NOTE_RESTORED: 'note.restored',
  NOTE_PURGED: 'note.purged',
  RENDER_UPDATED: 'render.updated'
}
