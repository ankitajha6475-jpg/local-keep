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
const styleFiles = () => walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))
const rel = f => path.relative(repoRoot, f)

function luminance(hex) {
  const channels = hex.match(/\w\w/g).map(h => parseInt(h, 16) / 255)
  const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const [r, g, b] = channels.map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Composites `rgba(...)` over an opaque background and returns the hex. */
function composite(rgba, background) {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  assert.ok(m, `not a colour: ${rgba}`)
  const alpha = m[4] === undefined ? 1 : Number(m[4])
  const bg = background.match(/\w\w/g).map(h => parseInt(h, 16))
  const out = [Number(m[1]), Number(m[2]), Number(m[3])].map((v, i) =>
    Math.round(v * alpha + bg[i] * (1 - alpha))
  )
  return out.map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Reports each line of a stylesheet together with whether it sits inside a
 * given at-rule, by tracking brace depth.
 */
function insideAtRule(source, atRulePattern) {
  const lines = source.split('\n')
  const guardDepth = []
  const results = []
  let depth = 0
  let inside = 0
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (atRulePattern.test(line.trim())) {
      inside++
      guardDepth.push(depth)
    }
    results.push({ line: line.trim(), guarded: inside > 0 })
    depth += opens - closes
    while (guardDepth.length && depth <= guardDepth[guardDepth.length - 1]) {
      guardDepth.pop()
      inside--
    }
  }
  return results
}

// ── Scrollbars ──────────────────────────────────────────────────────────────

test('every webkit scrollbar rule is inside an @supports not (scrollbar-color: auto) block', () => {
  const problems = []
  for (const file of styleFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const { line, guarded } of insideAtRule(source, /^@supports\s+not\s+\(scrollbar-color:\s*auto\)/)) {
      if (!line.includes('::-webkit-scrollbar')) continue
      if (guarded) continue
      problems.push(`${rel(file)}: ${line}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('every container with a custom scrollbar declares the standard properties', () => {
  const problems = []
  for (const file of styleFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    // Collect the selectors that customise a scrollbar.
    const custom = new Set()
    for (const m of source.matchAll(/([^{}]+)\{[^}]*::-webkit-scrollbar/g)) {
      for (const sel of m[1].split(',')) {
        const trimmed = sel.trim().replace(/::[^{}]*$/, '').trim()
        if (trimmed) custom.add(trimmed)
      }
    }
    for (const sel of custom) {
      const rule = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(source)
      if (!rule) continue
      const body = rule[2]
      if (!/scrollbar-width\s*:/.test(body) || !/scrollbar-color\s*:/.test(body)) {
        problems.push(`${rel(file)}: ${sel} customises a scrollbar without scrollbar-width/scrollbar-color`)
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the scrollbar thumb tokens clear 3:1 against the surfaces they sit on', () => {
  const css = fs.readFileSync(path.join(srcDir, 'styles/base.css'), 'utf8')
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
    assert.ok(m, `token --${name} is missing from base.css`)
    return m[1].trim()
  }
  const light = token('scrollbar-thumb')
  assert.match(light, /^#[0-9a-fA-F]{6}$/)
  const lightRatio = contrast(light.slice(1).toLowerCase(), 'ffffff')
  assert.ok(lightRatio >= 3, `light scrollbar thumb ${light} is only ${lightRatio.toFixed(2)}:1 on white`)

  const dark = token('scrollbar-thumb-dark')
  assert.match(dark, /^rgba?\(/)
  // The pen inspector panel is rgba(0,0,0,0.82) over the whiteboard.
  const panel = composite('rgba(0, 0, 0, 0.82)', 'ffffff')
  const thumb = composite(dark, panel)
  const darkRatio = contrast(thumb, panel)
  assert.ok(darkRatio >= 3, `dark scrollbar thumb ${dark} is only ${darkRatio.toFixed(2)}:1 on ${panel}`)
})

test('the scrollbar thumb is no longer the near-invisible #dadce0', () => {
  const problems = []
  for (const file of styleFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const m of source.matchAll(/scrollbar-color\s*:\s*([^;]+);/g)) {
      if (/#dadce0/i.test(m[1])) problems.push(`${rel(file)}: ${m[0]}`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

// ── Colour scheme ───────────────────────────────────────────────────────────

test('the interface declares a colour scheme', () => {
  const css = fs.readFileSync(path.join(srcDir, 'styles/base.css'), 'utf8')
  const m = css.match(/color-scheme\s*:\s*([a-z]+)\s*;/)
  assert.ok(m, 'base.css must declare color-scheme')
  assert.equal(m[1], 'light', 'the app is light-only; a dark theme is a separate proposal')
})

// ── Images ──────────────────────────────────────────────────────────────────

/**
 * Returns the root `<template>` block of a single-file component. Inner
 * `<template #slot>` blocks are nested, so the tags are matched by depth.
 * This keeps JavaScript comments that mention `<img>` out of the scan.
 */
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

test('every img the app renders declares a loading behaviour and decoding', () => {
  const problems = []
  for (const file of walk(srcDir, f => f.endsWith('.vue'))) {
    const source = fs.readFileSync(file, 'utf8')
    const template = templateBlock(source)
    if (!template) continue
    const offset = source.indexOf(template)
    const re = /<img\b[^>]*>/g
    let m
    while ((m = re.exec(template)) !== null) {
      const tag = m[0]
      const line = source.slice(0, offset + m.index).split('\n').length
      if (!/loading=/.test(tag)) problems.push(`${rel(file)}:${line} <img> without loading=`)
      if (!/decoding=/.test(tag)) problems.push(`${rel(file)}:${line} <img> without decoding=`)
      if (/fetchpriority="high"/.test(tag) && /loading="lazy"/.test(tag)) {
        problems.push(`${rel(file)}:${line} <img> combines fetchpriority="high" with loading="lazy"`)
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the card thumbnail names the note it belongs to', () => {
  const source = fs.readFileSync(path.join(srcDir, 'components/DashboardNoteCard.vue'), 'utf8')
  assert.match(source, /:alt="`Canvas thumbnail of \$\{displayTitle\}`"/)
  assert.doesNotMatch(source, /alt="Canvas thumbnail"/)
})
