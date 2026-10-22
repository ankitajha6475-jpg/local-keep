// Shared markdown toolbar definitions and keyboard matching.
// The editor renders these tools in both Visual and Source modes.

export const EDITOR_TOOL_GROUPS = [
  { id: 'inline', label: 'Text' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'insert', label: 'Insert' }
]

export const EDITOR_TOOLS = [
  {
    id: 'bold',
    group: 'inline',
    label: 'Bold',
    icon: 'B',
    iconStyle: 'bold',
    code: 'KeyB',
    shortcut: 'Mod+B'
  },
  {
    id: 'italic',
    group: 'inline',
    label: 'Italic',
    icon: 'I',
    iconStyle: 'italic',
    code: 'KeyI',
    shortcut: 'Mod+I'
  },
  {
    id: 'strike',
    group: 'inline',
    label: 'Strikethrough',
    icon: 'S',
    iconStyle: 'strike',
    code: 'KeyX',
    shift: true,
    shortcut: 'Mod+Shift+X'
  },
  {
    id: 'inline-code',
    group: 'inline',
    label: 'Inline code',
    icon: '</>',
    iconStyle: 'code',
    code: 'KeyE',
    shift: true,
    shortcut: 'Mod+Shift+E'
  },
  {
    id: 'heading-1',
    group: 'blocks',
    label: 'Heading 1',
    icon: 'H1',
    code: 'Digit1',
    shift: true,
    shortcut: 'Mod+Shift+1'
  },
  {
    id: 'heading-2',
    group: 'blocks',
    label: 'Heading 2',
    icon: 'H2',
    code: 'Digit2',
    shift: true,
    shortcut: 'Mod+Shift+2'
  },
  {
    id: 'heading-3',
    group: 'blocks',
    label: 'Heading 3',
    icon: 'H3',
    code: 'Digit3',
    shift: true,
    shortcut: 'Mod+Shift+3'
  },
  {
    id: 'quote',
    group: 'blocks',
    label: 'Blockquote',
    icon: '❝',
    code: 'Period',
    shift: true,
    shortcut: 'Mod+Shift+.'
  },
  {
    id: 'bullet-list',
    group: 'blocks',
    label: 'Bulleted list',
    icon: '•',
    code: 'Digit8',
    shift: true,
    shortcut: 'Mod+Shift+8'
  },
  {
    id: 'ordered-list',
    group: 'blocks',
    label: 'Numbered list',
    icon: '1.',
    code: 'Digit7',
    shift: true,
    shortcut: 'Mod+Shift+7'
  },
  {
    id: 'task-list',
    group: 'blocks',
    label: 'Task list',
    icon: '☑',
    code: 'Digit9',
    shift: true,
    shortcut: 'Mod+Shift+9'
  },
  {
    id: 'link',
    group: 'insert',
    label: 'Link',
    icon: '🔗',
    code: 'KeyK',
    shortcut: 'Mod+K'
  },
  {
    id: 'wiki-link',
    group: 'insert',
    label: 'Wiki link',
    icon: '[[ ]]',
    iconStyle: 'small',
    code: 'KeyK',
    shift: true,
    shortcut: 'Mod+Shift+K'
  },
  {
    id: 'code-block',
    group: 'insert',
    label: 'Code block',
    icon: '{ }',
    code: 'KeyF',
    shift: true,
    shortcut: 'Mod+Shift+F'
  },
  {
    id: 'table',
    group: 'insert',
    label: 'Table',
    icon: '▦',
    code: 'Digit5',
    shift: true,
    shortcut: 'Mod+Shift+5'
  },
  {
    id: 'horizontal-rule',
    group: 'insert',
    label: 'Horizontal rule',
    icon: '—',
    code: 'Digit0',
    shift: true,
    shortcut: 'Mod+Shift+0'
  }
]

export function matchEditorShortcut(event) {
  if (!event || !(event.ctrlKey || event.metaKey)) return null
  for (const tool of EDITOR_TOOLS) {
    if (event.code !== tool.code) continue
    if (!!event.shiftKey !== !!tool.shift) continue
    if (!!event.altKey !== !!tool.alt) continue
    return tool.id
  }
  return null
}
