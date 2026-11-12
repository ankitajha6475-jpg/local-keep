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

// ── Centring ────────────────────────────────────────────────────────────────

/**
 * The CSS rules of a single-file component's `<style>` block, or of a plain
 * CSS file.
 *
 * A naive `/{([^{}]*)}/` scan is not enough: a rule body may contain nested
 * braces (media queries, keyframes), so the scan can pair the wrong closing
 * brace with the wrong selector. This walks the block and tracks brace depth
 * so each rule keeps its own body.
 */
function styleRules(source) {
  const styleStart = source.indexOf('<style')
  let block = source
  if (styleStart !== -1) {
    const open = source.indexOf('>', styleStart)
    const close = source.indexOf('</style>', open)
    block = source.slice(open + 1, close === -1 ? source.length : close)
  }
  const rules = []
  let i = 0
  while (i < block.length) {
    const brace = block.indexOf('{', i)
    if (brace === -1) break
    // The selector text may carry the comment that precedes it, so strip
    // comments before comparing it.
    const selector = block
      .slice(i, brace)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    // Walk to the matching close brace, tracking nesting.
    let depth = 1
    let j = brace + 1
    while (j < block.length && depth > 0) {
      if (block[j] === '{') depth++
      else if (block[j] === '}') depth--
      j++
    }
    const body = block.slice(brace + 1, j - 1)
    if (selector && !selector.startsWith('@')) rules.push({ selector, body })
    i = j
  }
  return rules
}

/** The declarations of a rule body, with comments removed. */
function declarations(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, '')
}

test('the platform centring margin for dialogs survives the global reset', () => {
  // The UA centres a modal <dialog> with `margin: auto` on the dialog box
  // itself. The global reset in index.html zeroes `margin` on every element,
  // which removes that, so it has to be put back for dialogs.
  //
  // The reset must keep the selector `*`: that is specificity 0,0,0, so a
  // plain `dialog { margin: auto }` (0,0,1) always wins over it. If the
  // reset were given a more specific selector it would beat the restore
  // and every modal would land in the top-left corner again.
  const index = read(path.join(repoRoot, 'index.html'))
  const styleBlock = /<style>([\s\S]*?)<\/style>/.exec(index)
  assert.ok(styleBlock, 'expected a <style> block in index.html')
  const reset = /([^{}]*)\{([^}]*)\}/.exec(styleBlock[1])
  assert.ok(reset, 'expected a global reset in index.html')
  const selector = reset[1].trim()
  assert.equal(
    selector,
    '*',
    `the global reset selector is "${selector}"; it must stay "*" (specificity ` +
    '0,0,0) so that a `dialog { margin: auto }` rule can restore the platform ' +
    'centring margin'
  )
  assert.match(reset[2], /margin\s*:\s*0/, 'expected the reset to zero margin')
})

test('the base stylesheet restores the platform centring margin for dialogs', () => {
  // The counterpart to the reset: base.css is unscoped and global, so it is
  // where the platform default has to be put back.
  const base = read(path.join(srcDir, 'styles', 'base.css'))
  const rule = styleRules(base).find(r => r.selector === 'dialog')
  assert.ok(rule, 'expected a `dialog { ... }` rule in base.css')
  assert.match(
    declarations(rule.body),
    /(^|;)\s*margin\s*:\s*auto/,
    'base.css must set `margin: auto` on dialog so the platform can centre them'
  )
})

test('every overlay dialog shrink-wraps its panel instead of stretching', () => {
  // `width: auto` on a modal dialog stretches the dialog box across the
  // viewport, so the panel inside it sits at the top-left. The box must
  // shrink-wrap its content for the centring margin to place it correctly.
  const overlays = [
    'modal-overlay',
    'history-overlay',
    'graph-overlay',
    'backlinks-overlay',
    'links-overlay',
    'link-dialog-overlay'
  ]
  const problems = []
  for (const file of walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))) {
    for (const rule of styleRules(read(file))) {
      const name = overlays.find(o => rule.selector === '.' + o)
      if (!name) continue
      const decls = declarations(rule.body)
      if (!/(^|;)\s*width\s*:/.test(decls)) continue
      assert.match(
        decls,
        /(^|;)\s*width\s*:\s*fit-content/,
        `${rel(file)}: .${name} must use ` +
        '`width: fit-content` so the dialog box shrink-wraps its panel; ' +
        '`width: auto` stretches the box across the viewport and leaves the ' +
        'panel in the top-left corner'
      )
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('no overlay panel relies on a percentage width inside a fit-content dialog', () => {
  // A `width: 100%` child of a `fit-content` parent has no width to resolve
  // against and collapses to zero, so the panel needs a definite width.
  const panels = [
    'backlinks-panel',
    'history-panel',
    'graph-panel',
    'links-panel',
    'link-dialog'
  ]
  const problems = []
  for (const file of walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))) {
    for (const rule of styleRules(read(file))) {
      const name = panels.find(p => rule.selector === '.' + p)
      if (!name) continue
      const decls = declarations(rule.body)
      if (!/(^|;)\s*width\s*:\s*100%/.test(decls)) continue
      problems.push(`${rel(file)}: .${name} uses width: 100% inside a fit-content dialog`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the note editor resize clamps to the viewport', () => {
  // The resize writes an inline width/height that also overrides
  // `max-width`/`max-height`, so the clamp has to be applied in the handler
  // or a dragged modal grows past the edge of the screen.
  const source = read(path.join(srcDir, 'App.vue'))
  const handler = source.slice(source.indexOf('const onResize'))
  assert.match(handler, /window\.innerWidth/)
  assert.match(handler, /window\.innerHeight/)
  assert.match(handler, /Math\.min\(maxWidth/)
  assert.match(handler, /Math\.min\(maxHeight/)
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
