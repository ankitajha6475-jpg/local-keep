/**
 * Properties section (frontmatter) for note files.
 *
 * A note's canonical content is: `---` fence, property lines, `---` fence, body.
 * The fence is a deliberately strict, one-scalar-per-line YAML subset:
 *
 *   - one `key: value` per line
 *   - flow-style lists of scalars on one line (`tags: [a, b]`)
 *   - key order preserved, unknown keys preserved
 *   - no comments, anchors/aliases, type tags, block scalars, nested mappings
 *
 * Values that YAML would otherwise coerce (bools, numbers, dates) or truncate
 * (colours, where `#` starts a comment) are written quoted. Values are kept as
 * their original scalar text so a parse/serialise round trip of a section this
 * module wrote is byte-identical; the typed `value` is a projection for the UI.
 *
 * No dependencies: this module is shared by client and server.
 */

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/
// Loose numeric shape: used only to decide quoting, so `0123` stays text.
const NUMBER_LIKE_RE = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LINK_RE = /^\[\[[^\]]+\]\]$/
const COLOUR_RE = /^#[0-9a-f]{3,8}$/i
const YAML_COERCE_WORDS = new Set([
  'true', 'false', 'yes', 'no', 'on', 'off', 'y', 'n', 'null', '~'
])

export const META_TYPES = ['text', 'number', 'date', 'checkbox', 'list', 'link']

export class MetaParseError extends Error {
  constructor(message, line) {
    super(line ? `Line ${line}: ${message}` : message)
    this.name = 'MetaParseError'
    this.line = line ?? null
  }
}

/* ------------------------------------------------------------------ scalars */

function isPlainSafe(text) {
  if (text === '') return false
  if (/^\s|\s$/.test(text)) return false
  if (/[\n\r\t]/.test(text)) return false
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return false
  if (/:\s/.test(text) || / #/.test(text)) return false
  if (/:$/.test(text)) return false
  if (YAML_COERCE_WORDS.has(text.toLowerCase())) return false
  if (NUMBER_LIKE_RE.test(text)) return false
  if (DATE_RE.test(text)) return false
  if (COLOUR_RE.test(text)) return false
  return true
}

function escapeDouble(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function unescapeDouble(text) {
  return text.replace(/\\([\\nrt"'])/g, (_, ch) => {
    if (ch === 'n') return '\n'
    if (ch === 'r') return '\r'
    if (ch === 't') return '\t'
    return ch
  })
}

/** Render a value as a single-line scalar. Never emits a bare `key:` value. */
export function formatScalar(type, value) {
  switch (type) {
    case 'checkbox':
      return value ? 'true' : 'false'
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? String(n) : quoteText(String(value ?? ''))
    }
    case 'date': {
      const text = String(value ?? '')
      return DATE_RE.test(text) ? text : quoteText(text)
    }
    case 'link':
      // `[[Note]]` starts with `[`, which would open a flow sequence.
      return quoteText(String(value ?? ''))
    case 'list': {
      const items = Array.isArray(value) ? value : []
      return `[${items.map(item => quoteText(String(item ?? ''))).join(', ')}]`
    }
    case 'text':
    default:
      return quoteText(String(value ?? ''))
  }
}

function quoteText(text) {
  if (/[\n\r\t]/.test(text)) return `"${escapeDouble(text)}"`
  if (isPlainSafe(text)) return text
  return `'${text.replace(/'/g, "''")}'`
}

function unquote(text, line) {
  const first = text[0]
  if (first === "'") {
    if (text.length < 2 || !text.endsWith("'")) {
      throw new MetaParseError('Unterminated single-quoted scalar', line)
    }
    return text.slice(1, -1).replace(/''/g, "'")
  }
  if (first === '"') {
    if (text.length < 2 || !text.endsWith('"')) {
      throw new MetaParseError('Unterminated double-quoted scalar', line)
    }
    return unescapeDouble(text.slice(1, -1))
  }
  return text
}

function inferType(unquoted) {
  if (unquoted === 'true' || unquoted === 'false') return 'checkbox'
  if (DATE_RE.test(unquoted)) return 'date'
  if (NUMBER_RE.test(unquoted)) return 'number'
  if (LINK_RE.test(unquoted)) return 'link'
  return 'text'
}

/* -------------------------------------------------------------------- lists */

function parseFlowList(text, line) {
  const inner = text.slice(1, -1)
  if (inner.trim() === '') return []
  const items = []
  let current = ''
  let quote = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote) {
      current += ch
      if (ch === quote) {
        if (quote === "'" && inner[i + 1] === "'") {
          current += "'"
          i++
        } else {
          quote = null
        }
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
    } else if (ch === ',') {
      items.push(current.trim())
      current = ''
    } else if (ch === '[' || ch === '{') {
      throw new MetaParseError('Nested collections are not allowed in a list', line)
    } else {
      current += ch
    }
  }
  if (quote) throw new MetaParseError('Unterminated quote in list', line)
  if (current.trim() !== '') items.push(current.trim())
  return items.map(item => {
    const t = item.trim()
    if (t === '') return ''
    if (t[0] === "'" || t[0] === '"') return unquote(t, line)
    if (/^#/.test(t) || / #/.test(t)) {
      throw new MetaParseError('Quotes are required around values containing "#"', line)
    }
    return t
  })
}

/* --------------------------------------------------------------------- parse */

/**
 * Parse a properties section into ordered entries.
 * Each entry is `{ key, type, value, raw }` or `{ blank: true }`.
 * `raw` is the exact scalar text as written; it is used verbatim on
 * serialisation so untouched sections round-trip byte-identically.
 */
export function parseMeta(metaText) {
  const entries = []
  if (metaText === null || metaText === undefined) return entries
  const lines = String(metaText).split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1

    if (/^[ \t]*$/.test(line)) {
      entries.push({ blank: true })
      continue
    }
    if (/^[ \t]/.test(line)) {
      throw new MetaParseError(
        'Indented lines are only allowed as "- item" list entries',
        lineNo
      )
    }

    const match = line.match(/^([^:]+):(?:[ \t]+(.*))?$/)
    if (!match) {
      throw new MetaParseError('Expected "key: value"', lineNo)
    }
    const key = match[1]
    if (key.trim() !== key || key === '') {
      throw new MetaParseError('Property keys must not be empty or padded', lineNo)
    }
    const rawValue = match[2] ?? ''

    // `key:` with no value: either an empty scalar or a block list opener.
    if (rawValue === '') {
      const next = lines[i + 1]
      if (next !== undefined && /^[ \t]+-\s/.test(next)) {
        const items = []
        while (i + 1 < lines.length && /^[ \t]+-\s/.test(lines[i + 1])) {
          const itemLine = lines[++i]
          const item = itemLine.replace(/^[ \t]+-\s+/, '').trim()
          if (item === '') items.push('')
          else if (item[0] === "'" || item[0] === '"') items.push(unquote(item, i + 1))
          else if (/^#/.test(item) || / #/.test(item)) {
            throw new MetaParseError('Quotes are required around values containing "#"', i + 1)
          } else items.push(item)
        }
        entries.push({ key, type: 'list', value: items, raw: null })
        continue
      }
      entries.push({ key, type: 'text', value: '', raw: "''" })
      continue
    }

    const first = rawValue[0]
    if (first === '|' || first === '>') {
      throw new MetaParseError('Block scalars are not allowed', lineNo)
    }
    if (first === '&' || first === '*') {
      throw new MetaParseError('Anchors and aliases are not allowed', lineNo)
    }
    if (first === '!') {
      throw new MetaParseError('Type tags are not allowed', lineNo)
    }
    if (first === '{') {
      throw new MetaParseError('Nested mappings are not allowed', lineNo)
    }

    if (first === '[') {
      if (!rawValue.endsWith(']')) {
        throw new MetaParseError('Unterminated flow list', lineNo)
      }
      entries.push({ key, type: 'list', value: parseFlowList(rawValue, lineNo), raw: rawValue })
      continue
    }

    const trimmed = rawValue.trim()
    if (trimmed[0] === "'" || trimmed[0] === '"') {
      const value = unquote(trimmed, lineNo)
      entries.push({ key, type: 'text', value, raw: rawValue })
      continue
    }
    if (/^#/.test(trimmed) || / #/.test(trimmed)) {
      throw new MetaParseError('Quotes are required around values containing "#"', lineNo)
    }
    const type = inferType(trimmed)
    const value = type === 'checkbox'
      ? trimmed === 'true'
      : type === 'number'
        ? Number(trimmed)
        : trimmed
    entries.push({ key, type, value, raw: rawValue })
  }

  return entries
}

/** Serialise entries back to a properties section body (no fences). */
export function serializeMeta(entries) {
  let out = ''
  for (const entry of entries || []) {
    if (!entry || entry.blank) {
      out += '\n'
      continue
    }
    const raw = entry.raw ?? formatScalar(entry.type, entry.value)
    out += `${entry.key}: ${raw}\n`
  }
  return out
}

/* --------------------------------------------------------------------- fence */

/**
 * Split canonical content into its properties section and body.
 * Returns `{ meta, body, hadFence }`; `meta` is null when there is no fence,
 * in which case the whole content is the body.
 */
export function splitFence(content) {
  const source = String(content ?? '')
  const open = source.match(/^---[ \t]*(\r?\n)/)
  if (!open) return { meta: null, body: source, hadFence: false }
  const afterOpen = source.slice(open[0].length)
  const close = /^---[ \t]*(\r?\n|$)/m.exec(afterOpen)
  if (!close) return { meta: null, body: source, hadFence: false }
  return {
    meta: afterOpen.slice(0, close.index),
    body: afterOpen.slice(close.index + close[0].length),
    hadFence: true
  }
}

/** Assemble canonical content from a properties section and a body. */
export function joinFence(meta, body) {
  const metaText = meta ? String(meta) : ''
  const withNewline = metaText && !metaText.endsWith('\n') ? `${metaText}\n` : metaText
  return `---\n${withNewline}---\n${body ?? ''}`
}

/**
 * Reassemble a file from a stored fence section and a body. A note with no
 * properties has no fence at all — this MUST NOT invent an empty `---\n---`.
 */
export function composeFile(fence, body) {
  if (fence === null || fence === undefined) return String(body ?? '')
  return joinFence(fence, body)
}

/* --------------------------------------------------------------- note-level */

/** Parse a note's canonical content into `{ entries, props, body, hadFence }`. */
export function parseNoteContent(content) {
  const { meta, body, hadFence } = splitFence(content)
  const entries = hadFence ? parseMeta(meta) : []
  return { entries, props: entriesToProps(entries), body, hadFence }
}

/** Assemble canonical content from entries and a body. */
export function buildNoteContent(entries, body) {
  const real = (entries || []).filter(entry => entry && !entry.blank)
  // No properties means no fence: never write an empty `---\n---` block.
  if (real.length === 0) return String(body ?? '')
  return joinFence(serializeMeta(entries), body)
}

export function entriesToProps(entries) {
  const props = {}
  for (const entry of entries || []) {
    if (!entry || entry.blank) continue
    props[entry.key] = entry.value
  }
  return props
}

export function getProp(entries, key) {
  const entry = (entries || []).find(e => e && !e.blank && e.key === key)
  return entry ? entry.value : undefined
}

/** Immutably set a property. Clears `raw` so the new value is re-formatted. */
export function setProp(entries, key, value) {
  const next = (entries || []).filter(e => e && !e.blank)
  const type = inferValueShape(value)
  const index = next.findIndex(e => e.key === key)
  const entry = { key, type, value, raw: null }
  if (index === -1) next.push(entry)
  else next[index] = entry
  return next
}

/** Immutably remove a property. */
export function removeProp(entries, key) {
  return (entries || []).filter(e => e && !e.blank && e.key !== key)
}

function inferValueShape(value) {
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  const text = String(value ?? '')
  if (LINK_RE.test(text)) return 'link'
  return 'text'
}

export function isValidPropKey(key) {
  return typeof key === 'string' && key !== '' && key === key.trim() && !/[\n\r:]/.test(key)
}
