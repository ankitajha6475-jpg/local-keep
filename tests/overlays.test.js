import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const srcDir = path.join(repoRoot, 'src')

function walk(dir, filter) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, filter))
    else if (filter(full)) out.push(full)
  }
  return out
}
const vueFiles = () => walk(srcDir, f => f.endsWith('.vue'))
const rel = f => path.relative(repoRoot, f)
const read = f => fs.readFileSync(f, 'utf8')

/** The root `<template>` block of a single-file component. */
function templateBlock(source) {
  const open = /<template(?![a-z])/g
  const first = open.exec(source)
  if (!first) return ''
  let depth = 0
  const tag = /<template(?![a-z])|<\/template>/g
  tag.lastIndex = first.index
  let m
  while ((m = tag.exec(source)) !== null) {
    if (m[0] === '</template>') {
      depth--
      if (depth === 0) return source.slice(first.index, m.index + m[0].length)
    } else {
      depth++
    }
  }
  return ''
}

// ── Native dialogs ──────────────────────────────────────────────────────────

test('every blocking overlay is a native dialog', () => {
  const problems = []
  for (const file of vueFiles()) {
    const template = templateBlock(read(file))
    if (!template) continue
    // The overlay classes that used to be hand-rolled fixed divs.
    const re = /<div\b[^>]*class="([^"]*\boverlay\b[^"]*)"[^>]*>/g
    let m
    while ((m = re.exec(template)) !== null) {
      const classes = m[1]
      // The deletion mask is an inline prompt over the whiteboard, not a
      // blocking overlay, so it stays a div.
      if (classes.includes('deleted-mask')) continue
      problems.push(`${rel(file)}: ${m[0].slice(0, 90)}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('no dialog carries role="dialog" or aria-modal', () => {
  const problems = []
  for (const file of vueFiles()) {
    const template = templateBlock(read(file))
    if (!template) continue
    const re = /<dialog\b[^>]*>/g
    let m
    while ((m = re.exec(template)) !== null) {
      if (/role="dialog"/.test(m[0])) problems.push(`${rel(file)}: ${m[0].slice(0, 90)}`)
      if (/aria-modal/.test(m[0])) problems.push(`${rel(file)}: ${m[0].slice(0, 90)}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('no element in the app declares role="dialog" or aria-modal', () => {
  const problems = []
  for (const file of vueFiles()) {
    const source = read(file)
    for (const m of source.matchAll(/role="dialog"|aria-modal="[^"]*"/g)) {
      problems.push(`${rel(file)}: ${m[0]}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('every dialog is named by an element that exists', () => {
  const problems = []
  for (const file of vueFiles()) {
    const source = read(file)
    const template = templateBlock(source)
    if (!template) continue
    const ids = new Set()
    for (const m of source.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1])
    const re = /<dialog\b[^>]*>/g
    let m
    while ((m = re.exec(template)) !== null) {
      const labelledBy = (m[0].match(/aria-labelledby="([^"]+)"/) || [])[1]
      if (!labelledBy) {
        problems.push(`${rel(file)}: <dialog> without aria-labelledby`)
        continue
      }
      if (!ids.has(labelledBy)) {
        problems.push(`${rel(file)}: aria-labelledby="${labelledBy}" has no matching id`)
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('no dialog sets display unconditionally', () => {
  // The guide: `display` on a dialog overrides the closed state. Scope it
  // with `dialog[open]`.
  const problems = []
  for (const file of walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))) {
    const source = read(file)
    const re = /(^|\})\s*([^{}]*?)\{([^{}]*)\}/g
    let m
    while ((m = re.exec(source)) !== null) {
      const selector = m[2].trim()
      const body = m[3]
      if (!/^dialog(\s*[:,]|$)/.test(selector)) continue
      if (!/\bdisplay\s*:/.test(body)) continue
      if (/\[open\]/.test(selector)) continue
      problems.push(`${rel(file)}: ${selector} { ... display ... }`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the overlay styles do not hand-roll a backdrop', () => {
  // The dim layer comes from `::backdrop`, not from a background on the
  // dialog element itself.
  const problems = []
  for (const file of walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))) {
    const source = read(file)
    const re = /(^|\})\s*([^{}]*?)\{([^{}]*)\}/g
    let m
    while ((m = re.exec(source)) !== null) {
      const selector = m[2].trim()
      if (!/overlay/.test(selector)) continue
      if (/::backdrop/.test(selector)) continue
      // The deletion mask is an inline prompt over the whiteboard.
      if (/deleted-mask/.test(selector)) continue
      const body = m[3]
      if (/\bbackground\s*:/.test(body) && !/transparent/.test(body)) {
        problems.push(`${rel(file)}: ${selector} still paints its own backdrop`)
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

// ── ARIA patterns ───────────────────────────────────────────────────────────

test('no menu claims menu semantics without the menu keyboard pattern', () => {
  const problems = []
  for (const file of vueFiles()) {
    const source = read(file)
    for (const m of source.matchAll(/role="(menu|menuitem|menuitemradio)"/g)) {
      problems.push(`${rel(file)}: ${m[0]}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the dashboard tabs implement the ARIA tab pattern', () => {
  const source = read(path.join(srcDir, 'App.vue'))
  // A roving tabindex: the selected tab is reachable, the others are not.
  assert.match(source, /:tabindex="dashboardTab === 'notes' \? 0 : -1"/)
  assert.match(source, /:tabindex="dashboardTab === 'archived' \? 0 : -1"/)
  assert.match(source, /:tabindex="dashboardTab === 'drafts' \? 0 : -1"/)
  // Each tab points at the panel, and the panel points back at its tab.
  assert.match(source, /aria-controls="notes-panel"/)
  assert.match(source, /id="notes-panel"/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /:aria-labelledby="`tab-\$\{dashboardTab\}`"/)
  // Arrow keys and Home/End move between the tabs.
  assert.match(source, /function onTabKeydown/)
  assert.match(source, /event\.key === 'ArrowRight'/)
  assert.match(source, /event\.key === 'ArrowLeft'/)
  assert.match(source, /event\.key === 'Home'/)
  assert.match(source, /event\.key === 'End'/)
})

// ── Shortcut dispatcher ─────────────────────────────────────────────────────

test('the global key handler no longer closes overlays with Escape', () => {
  // Escape is the platform's job for a native dialog. Only the inline
  // search field, which is not an overlay, may still handle it.
  const source = read(path.join(srcDir, 'App.vue'))
  const handler = source.slice(source.indexOf('const handleKeyDown'))
  const escapeBranches = handler.split('\n')
    .filter(line => line.includes("e.key === 'Escape'") && line.trim().startsWith('if ('))
  // The colour palette and the inline search field are not native dialogs,
  // so they still handle Escape themselves. Every overlay that *is* a dialog
  // must not.
  assert.equal(escapeBranches.length, 2,
    `expected only the palette and the search field to handle Escape, found:\n${escapeBranches.join('\n')}`)
  assert.ok(escapeBranches.some(line => line.includes('openColorNoteId')))
  assert.ok(escapeBranches.some(line => line.includes('searchOpen')))
})

test('the topmost overlay is resolved from the overlay stack', () => {
  const source = read(path.join(srcDir, 'App.vue'))
  assert.match(source, /function shortcutRoot\(\)\s*\{[^}]*overlayStack\.top\(\)/)
  // The old DOM-order lookup must be gone.
  assert.doesNotMatch(source, /SHORTCUT_LAYER_SELECTOR/)
})

test('the overlay stack is used and the light dismiss is installed', () => {
  const source = read(path.join(srcDir, 'App.vue'))
  assert.match(source, /createOverlayStack\(\)/)
  assert.match(source, /installLightDismiss\(document\)/)
})
