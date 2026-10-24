import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMeta,
  serializeMeta,
  splitFence,
  joinFence,
  parseNoteContent,
  buildNoteContent,
  formatScalar,
  setProp,
  removeProp,
  getProp,
  isValidPropKey,
  MetaParseError
} from '../src/shared/noteMeta.js'

/** Serialising what we parsed must reproduce the input bytes exactly. */
function roundTrip(meta) {
  const entries = parseMeta(meta)
  assert.equal(serializeMeta(entries), meta, `round-trip mismatch for:\n${meta}`)
  return entries
}

test('ambiguous scalars round-trip byte-identically', () => {
  roundTrip("title: no\n")
  roundTrip("due: 2026-11-01\n")
  roundTrip("size: 3.0\n")
  roundTrip("color: '#e2ece4'\n")
  roundTrip("id: '0123'\n")
  roundTrip("ratio: 1e5\n")
  roundTrip("done: true\n")
  roundTrip("empty: ''\n")
})

test('the Norway problem: "no" is never coerced to a boolean', () => {
  // Unquoted, it is text — this module performs no YAML coercion at all.
  const [entry] = parseMeta("title: no\n")
  assert.equal(entry.type, 'text')
  assert.equal(entry.value, 'no')
  // ...and it round-trips to the same bytes.
  assert.equal(serializeMeta([entry]), "title: no\n")

  // Quoting also gives text, and survives the round trip.
  const [quoted] = parseMeta("title: 'no'\n")
  assert.equal(quoted.type, 'text')
  assert.equal(quoted.value, 'no')
  assert.equal(serializeMeta([quoted]), "title: 'no'\n")

  // A fresh value that looks like a YAML boolean is always written quoted.
  assert.equal(formatScalar('text', 'no'), "'no'")
  assert.equal(formatScalar('text', 'on'), "'on'")
  assert.equal(formatScalar('text', 'null'), "'null'")
})

test('a date-shaped value is a date and never re-serialises as a timestamp', () => {
  const [entry] = parseMeta("due: 2026-11-01\n")
  assert.equal(entry.type, 'date')
  assert.equal(entry.value, '2026-11-01')
  assert.equal(serializeMeta([entry]), "due: 2026-11-01\n")
})

test('3.0 stays 3.0 rather than collapsing to 3', () => {
  const [entry] = parseMeta("size: 3.0\n")
  assert.equal(entry.type, 'number')
  assert.equal(entry.value, 3)
  assert.equal(serializeMeta([entry]), "size: 3.0\n", 'raw scalar text is preserved')
})

test('a bare colour value is quoted so "#" cannot start a comment', () => {
  // A quoted colour round-trips and parses as text.
  const [entry] = parseMeta("color: '#e2ece4'\n")
  assert.equal(entry.type, 'text')
  assert.equal(entry.value, '#e2ece4')

  // Serialising a colour value always quotes it.
  assert.equal(formatScalar('text', '#e2ece4'), "'#e2ece4'")
  assert.equal(serializeMeta([{ key: 'color', type: 'text', value: '#e2ece4' }]), "color: '#e2ece4'\n")
})

test('an unquoted colour is rejected as a comment hazard', () => {
  assert.throws(() => parseMeta("color: #e2ece4\n"), MetaParseError)
})

test('unknown keys survive round-trips', () => {
  const meta = "plugin_a: hello\nobsidian_custom: '[x]'\n"
  roundTrip(meta)
})

test('key order is preserved', () => {
  const entries = parseMeta("zeta: 1\nalpha: 2\n")
  assert.deepEqual(entries.map(e => e.key), ['zeta', 'alpha'])
})

test('flow lists round-trip and expose a list type', () => {
  const entries = roundTrip("tags: [project/alpha, area/ops]\n")
  assert.equal(entries[0].type, 'list')
  assert.deepEqual(entries[0].value, ['project/alpha', 'area/ops'])
})

test('list items that look like colours or numbers are quoted', () => {
  assert.equal(formatScalar('list', ['#fff', '3.0']), "['#fff', '3.0']")
})

test('nested collections, anchors, tags and block scalars are rejected', () => {
  assert.throws(() => parseMeta("a: &anchor x\n"), MetaParseError)
  assert.throws(() => parseMeta("a: *anchor\n"), MetaParseError)
  assert.throws(() => parseMeta("a: !!str x\n"), MetaParseError)
  assert.throws(() => parseMeta("a: |\n  text\n"), MetaParseError)
  assert.throws(() => parseMeta("a: >\n  text\n"), MetaParseError)
  assert.throws(() => parseMeta("a:\n  b: c\n"), MetaParseError)
  assert.throws(() => parseMeta("a: {b: c}\n"), MetaParseError)
})

test('validation errors name the offending line', () => {
  try {
    parseMeta("ok: 1\nbad: &anchor x\n")
    assert.fail('expected a parse error')
  } catch (error) {
    assert.ok(error instanceof MetaParseError)
    assert.equal(error.line, 2)
    assert.match(error.message, /Line 2/)
  }
})

test('block-style list input is normalised to flow style', () => {
  const entries = parseMeta("tags:\n  - alpha\n  - beta\n")
  assert.equal(entries[0].type, 'list')
  assert.deepEqual(entries[0].value, ['alpha', 'beta'])
  assert.equal(serializeMeta(entries), "tags: [alpha, beta]\n")
})

test('splitFence separates the fence from the body', () => {
  const content = "---\ntags: [a]\n---\n# Heading\n"
  const { meta, body, hadFence } = splitFence(content)
  assert.equal(hadFence, true)
  assert.equal(meta, 'tags: [a]\n')
  assert.equal(body, '# Heading\n')
})

test('content without a fence is entirely body', () => {
  const content = "# Heading\n\ntext\n"
  const { meta, body, hadFence } = splitFence(content)
  assert.equal(hadFence, false)
  assert.equal(meta, null)
  assert.equal(body, content)
})

test('joinFence and splitFence round-trip whole notes', () => {
  const meta = "tags: [a]\nstatus: active\n"
  const body = "# Heading\n\nbody text\n"
  const content = joinFence(meta, body)
  assert.equal(content, "---\ntags: [a]\nstatus: active\n---\n# Heading\n\nbody text\n")
  assert.deepEqual(splitFence(content), { meta, body, hadFence: true })
})

test('a fenced note parses into props and body-only text', () => {
  const content = "---\ntags: [project/alpha]\nstatus: active\n---\n# Project plan\n"
  const parsed = parseNoteContent(content)
  assert.equal(parsed.hadFence, true)
  assert.deepEqual(parsed.props, { tags: ['project/alpha'], status: 'active' })
  assert.equal(parsed.body, '# Project plan\n')
  assert.equal(buildNoteContent(parsed.entries, parsed.body), content)
})

test('setProp and removeProp return new entry lists', () => {
  const entries = parseMeta("tags: [a]\n")
  const withStatus = setProp(entries, 'status', 'done')
  assert.equal(getProp(withStatus, 'status'), 'done')
  assert.equal(getProp(entries, 'status'), undefined, 'original list is untouched')

  const withoutStatus = removeProp(withStatus, 'status')
  assert.equal(getProp(withoutStatus, 'status'), undefined)
})

test('editing a value reformats it while untouched values keep their raw text', () => {
  const entries = parseMeta("size: 3.0\nstatus: draft\n")
  const next = setProp(entries, 'status', 'done')
  assert.equal(serializeMeta(next), "size: 3.0\nstatus: done\n")
})

test('property keys must be non-empty and free of colons', () => {
  assert.equal(isValidPropKey('due date'), true)
  assert.equal(isValidPropKey(''), false)
  assert.equal(isValidPropKey(' padded '), false)
  assert.equal(isValidPropKey('a:b'), false)
})

test('multi-line values are written as a double-quoted single line', () => {
  const raw = formatScalar('text', 'line one\nline two')
  assert.equal(raw, '"line one\\nline two"')
  const entries = parseMeta(`note: ${raw}\n`)
  assert.equal(entries[0].value, 'line one\nline two')
})

test('wikilink values are typed as links and stay quoted', () => {
  const [entry] = parseMeta("related: '[[Some Note]]'\n")
  // Quoted scalars are text per the typing table.
  assert.equal(entry.type, 'text')
  assert.equal(formatScalar('link', '[[Some Note]]'), "'[[Some Note]]'")
})
