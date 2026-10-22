// Central keyboard-shortcut map for the workspace UI.
// `Mod` is replaced with Cmd on macOS and Ctrl elsewhere at display/handling time.
export const SHORTCUTS = {
  // Dashboard chrome
  reconnect: 'Mod+Alt+E',
  refresh: 'R',
  toggleTags: 'T',
  graph: 'G',
  search: 'Mod+I',
  cleanImages: 'Shift+C',
  accountMenu: 'Mod+Alt+A',
  accountSettings: 'Mod+Alt+S',
  manageUsers: 'Mod+Alt+U',
  interfaceSettings: 'Mod+Alt+F',
  mcpSettings: 'Mod+Alt+M',
  hybridSettings: 'Mod+Alt+H',
  logout: 'Mod+Alt+L',

  // Search
  hybridToggle: 'Mod+Alt+Y',
  clearSearch: 'Mod+Shift+X',
  closeSearch: 'Esc',

  // Notice and bulk selection
  dismissNotice: 'Mod+Alt+J',
  selectAll: 'A',
  deselectAll: 'Shift+A',
  selectionLinks: 'L',
  deleteSelected: 'Delete',

  // Dashboard tabs, filters, sorting
  tabNotes: '1',
  tabArchived: '2',
  tabDrafts: '3',
  clearTagFilter: 'Shift+X',
  refreshDrafts: 'Shift+R',
  sortDirection: 'O',
  retryNotes: 'Shift+E',

  // Tag sidebar
  tagClose: 'Mod+Alt+T',
  tagAll: 'Mod+Alt+0',
  tagUntagged: 'Mod+Alt+Shift+U',

  // Generic dialog actions
  closeDialog: 'Esc',
  submitDialog: 'Mod+Enter',
  cancelDialog: 'Mod+Alt+X',

  // MCP access
  mcpSaveLimits: 'Mod+Enter',
  mcpCreateToken: 'Mod+Enter',
  mcpCopyToken: 'Mod+Alt+C',

  // Account settings
  accountSavePassword: 'Mod+Enter',
  accountCancel: 'Mod+Alt+X',
  logoutAll: 'Mod+Alt+L',

  // Interface settings
  uiSave: 'Mod+Enter',
  uiReset: 'Mod+Alt+R',
  uiClose: 'Mod+Alt+X',

  // Users
  usersAdd: 'Mod+Enter',
  usersCopyTempPassword: 'Mod+Alt+C',

  // Hybrid search settings
  embeddingTestRerank: 'Mod+Alt+T',
  embeddingSave: 'Mod+Enter',
  embeddingTest: 'Mod+Shift+T',
  embeddingRebuild: 'Mod+Alt+R',
  embeddingReset: 'Mod+Shift+R',
  embeddingRefresh: 'Mod+Alt+F',

  // Note editor
  noteGraph: 'Mod+Alt+G',
  noteBacklinks: 'Mod+Alt+B',
  noteHistory: 'Mod+Alt+H',
  noteVisual: 'Mod+Alt+V',
  noteSource: 'Mod+Alt+S',
  noteInsertImage: 'Mod+Alt+I',
  noteSave: 'Mod+Enter',
  noteDraft: 'Mod+Alt+D',
  noteDiscard: 'Mod+Alt+X',

  // Confirmations and delete mask
  confirmArchive: 'Enter',
  confirmCancel: 'Esc',
  deletedSave: 'Mod+Enter',
  deletedDiscard: 'Mod+Alt+X',
  unsavedSave: 'Mod+Enter',
  unsavedDraft: 'Mod+Alt+D',
  unsavedDiscard: 'Mod+Alt+X',
  unsavedContinue: 'Esc',

  // Create menu
  fabMenu: 'N',
  fabTextNote: 'Mod+Alt+N',
  fabWhiteboard: 'Mod+Alt+W',

  // Relationship graph
  graphRefresh: 'Mod+Alt+R',
  graphClose: 'Esc',

  // Selection links
  linksBoth: 'Mod+Alt+1',
  linksOutgoing: 'Mod+Alt+2',
  linksIncoming: 'Mod+Alt+3',
  linksClose: 'Esc'
}

export function shortcutLabel(combo, modKey = 'Ctrl') {
  return String(combo || '').replace(/\bMod\b/g, modKey)
}

export function eventShortcut(event, modKey = 'Ctrl') {
  if (!event || !event.key) return ''
  const parts = []
  if (event.ctrlKey || event.metaKey) parts.push(modKey)
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  let key = event.key
  if (key === 'Escape') key = 'Esc'
  else if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  return [...parts, key].join('+')
}
