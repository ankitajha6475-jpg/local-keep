import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8')

const appSource = read('src/App.vue')
const sidebarSource = read('src/components/TagSidebar.vue')
const cardSource = read('src/components/DashboardNoteCard.vue')

/** Every `@container <name> (<condition>)` condition used in a file. */
function containerConditions(source, name) {
  const re = new RegExp(`@container\\s+${name}\\s*\\(([^)]*)\\)`, 'g')
  const out = []
  let m
  while ((m = re.exec(source)) !== null) out.push(m[1].trim())
  return out
}

/** The body of the first CSS rule whose selector matches. */
function ruleBody(source, selector) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`, 'm')
  const m = re.exec(source)
  return m ? m[2] : null
}

/**
 * Find the index just past the tag that closes the element whose opening tag
 * starts at `openIndex`.
 */
function matchingClose(source, openIndex) {
  const tagEnd = source.indexOf('>', openIndex)
  if (tagEnd === -1) return -1
  if (source[tagEnd - 1] === '/') return tagEnd + 1
  const tagName = /^<([a-zA-Z-]+)/.exec(source.slice(openIndex))?.[1]
  if (!tagName) return -1
  let depth = 1
  let i = tagEnd + 1
  const open = new RegExp(`<${tagName}\\b`, 'g')
  const close = new RegExp(`</${tagName}>`, 'g')
  while (i < source.length) {
    open.lastIndex = i
    close.lastIndex = i
    const o = open.exec(source)
    const c = close.exec(source)
    if (!c) return -1
    if (o && o.index < c.index) {
      // Ignore self-closing tags.
      const end = source.indexOf('>', o.index)
      if (source[end - 1] !== '/') depth += 1
      i = end + 1
      continue
    }
    depth -= 1
    if (depth === 0) return c.index + c[0].length
    i = c.index + c[0].length
  }
  return -1
}

// ── The workspace container ─────────────────────────────────────────────────

test('the workspace is a size query container', () => {
  const body = ruleBody(appSource, 'main')
  assert.ok(body, 'main must have a rule')
  assert.match(body, /container-type:\s*inline-size/)
  assert.match(body, /container-name:\s*workspace/)
})

test('the workspace stacking is a container query, not a media query', () => {
  const conditions = containerConditions(appSource, 'workspace')
  assert.ok(conditions.length > 0, 'App.vue must use a named container query')
  const workspaceRule = ruleBody(appSource, '\\.workspace')
  assert.ok(workspaceRule, '.workspace must have a rule')

  // The stacking rule lives inside the container query, not in a media query.
  const containerIndex = appSource.indexOf('@container workspace')
  const mediaIndex = appSource.indexOf('.workspace {\n    flex-direction: column')
  assert.ok(containerIndex !== -1)
  assert.ok(mediaIndex > containerIndex,
    'the column-stacking rule must come after the container query opens it')
  assert.doesNotMatch(appSource.slice(containerIndex, containerIndex + 400),
    /@media \(max-width: 600px\)/)
})

test('the tag sidebar and the workspace share one container and one threshold', () => {
  const appConditions = containerConditions(appSource, 'workspace')
  const sidebarConditions = containerConditions(sidebarSource, 'workspace')

  assert.ok(appConditions.length > 0, 'App.vue must use the workspace container')
  assert.ok(sidebarConditions.length > 0, 'TagSidebar.vue must use the workspace container')

  const thresholds = new Set([...appConditions, ...sidebarConditions])
  assert.equal(thresholds.size, 1,
    `the stacking breakpoint must be identical in both files, found: ${[...thresholds].join(', ')}`)

  // And the sidebar rule that the container query gates is the stacked one.
  assert.match(sidebarSource, /@container workspace \(max-width: \d+px\)[\s\S]*?\.tag-sidebar\s*\{[^}]*width:\s*100%/)
})

test('no viewport media query still drives the sidebar stacking', () => {
  assert.doesNotMatch(sidebarSource, /@media \(max-width: 600px\)/,
    'TagSidebar.vue must not use the old viewport breakpoint')
  assert.doesNotMatch(appSource, /@media \(max-width: 600px\)\s*\{[^}]*\.workspace\s*\{/,
    'App.vue must not stack the workspace from a media query')
})

test('the notes grid has no column-count media query', () => {
  // The column count is derived from the measured grid width in JavaScript
  // and applied as an inline style, so it already follows the container.
  assert.doesNotMatch(appSource, /\.notes-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
})

// ── Card rendering ─────────────────────────────────────────────────────────

test('the card body skips rendering while off-screen', () => {
  const body = ruleBody(appSource, '\\.note-content')
  assert.ok(body, '.note-content must have a rule')
  assert.match(body, /content-visibility:\s*auto/)
  assert.match(body, /contain-intrinsic-size:/)
})

test('the card height does not depend on the card body', () => {
  const card = ruleBody(appSource, ':where\\(\\.note-card\\)')
  assert.ok(card, '.note-card must have a rule')
  assert.match(card, /height:\s*380px/, 'the card keeps its fixed height')

  const content = ruleBody(appSource, '\\.note-content')
  assert.match(content, /flex:\s*1/, 'the body is sized by the flex algorithm, not by its content')
})

test('the presence dot is anchored to the card, not to the card body', () => {
  const cardOpen = cardSource.indexOf('<div\n    class="note-card"')
  assert.ok(cardOpen !== -1, 'the card element must exist')
  const cardEnd = matchingClose(cardSource, cardOpen)
  assert.ok(cardEnd !== -1)

  const dotIndex = cardSource.indexOf('class="presence-dot"')
  assert.ok(dotIndex !== -1, 'the presence dot must exist')
  assert.ok(dotIndex > cardOpen && dotIndex < cardEnd,
    'the presence dot must be inside the card')

  const contentOpen = cardSource.indexOf('<div class="note-content">')
  assert.ok(contentOpen !== -1)
  const contentEnd = matchingClose(cardSource, contentOpen)
  assert.ok(contentEnd !== -1)
  assert.ok(dotIndex < contentOpen || dotIndex > contentEnd,
    'the presence dot must not be inside the card body: containment would move it')
})
