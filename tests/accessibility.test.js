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
const styleFiles = () => walk(srcDir, f => f.endsWith('.vue') || f.endsWith('.css'))
const rel = f => path.relative(repoRoot, f)

/** WCAG relative luminance and contrast ratio. */
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

// ── Contrast ─────────────────────────────────────────────────────────────────

const WHITE = 'ffffff'

test('the muted and success tokens meet the 4.5:1 text minimum on white', () => {
  const css = fs.readFileSync(path.join(srcDir, 'styles/base.css'), 'utf8')
  const token = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    assert.ok(m, `token --${name} is missing from base.css`)
    return m[1].slice(1).toLowerCase()
  }
  const muted = token('text-muted')
  const success = token('text-success')
  assert.ok(contrast(muted, WHITE) >= 4.5, `--text-muted ${muted} is ${contrast(muted, WHITE).toFixed(2)}:1`)
  assert.ok(contrast(success, WHITE) >= 4.5, `--text-success ${success} is ${contrast(success, WHITE).toFixed(2)}:1`)
})

test('every text colour meets 4.5:1 on white, unless it sits on a dark panel', () => {
  // Colours that are only used on a dark surface. Each entry names the
  // surface so the exemption is auditable.
  const DARK_SURFACE = {
    e2e8f0: 'the #0f172a code block in the temp-password panel (14.48:1)',
    d4d4d4: 'the rgba(0,0,0,0.82) pen-inspector panel (9.16:1)',
    ce9178: 'the rgba(0,0,0,0.82) pen-inspector panel (5.14:1)'
  }
  const failures = []
  const exemptions = []
  for (const file of styleFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((ln, i) => {
      const m = ln.match(/^\s*color:\s*(#[0-9a-fA-F]{6})\s*;/)
      if (!m) return
      const hex = m[1].slice(1).toLowerCase()
      const ratio = contrast(hex, WHITE)
      if (ratio >= 4.5) return
      if (DARK_SURFACE[hex]) {
        exemptions.push(`${rel(file)}:${i + 1} #${hex} — ${DARK_SURFACE[hex]}`)
        return
      }
      failures.push(`${rel(file)}:${i + 1} #${hex} is ${ratio.toFixed(2)}:1 on white`)
    })
  }
  assert.deepEqual(failures, [], `text colours below 4.5:1:\n${failures.join('\n')}`)
  assert.ok(exemptions.length > 0, 'expected the known dark-surface exemptions to still exist')
})

test('the old failing colours are no longer used as text colours', () => {
  const banned = ['#80868b', '#94a3b8', '#9aa0a6', '#1e8e3e']
  const hits = []
  for (const file of styleFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((ln, i) => {
      const m = ln.match(/^\s*color:\s*(#[0-9a-fA-F]{6})\s*;/)
      if (m && banned.includes(m[1].toLowerCase())) hits.push(`${rel(file)}:${i + 1} ${m[1]}`)
    })
  }
  assert.deepEqual(hits, [], `these colours fail WCAG 1.4.3 on white:\n${hits.join('\n')}`)
})

// ── Focus indicator ─────────────────────────────────────────────────────────

test('no rule removes the native focus indicator', () => {
  const hits = []
  for (const file of styleFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((ln, i) => {
      if (/outline:\s*none/.test(ln)) hits.push(`${rel(file)}:${i + 1}`)
    })
  }
  assert.deepEqual(hits, [], `outline: none found at:\n${hits.join('\n')}`)
})

test('the shared focus ring is declared and its colour clears 3:1 on white', () => {
  const css = fs.readFileSync(path.join(srcDir, 'styles/base.css'), 'utf8')
  assert.match(css, /:focus-visible\s*\{/, 'base.css must declare a :focus-visible rule')
  const m = css.match(/--focus-ring-color:\s*(#[0-9a-fA-F]{6})/)
  assert.ok(m, '--focus-ring-color is missing')
  const ratio = contrast(m[1].slice(1).toLowerCase(), WHITE)
  assert.ok(ratio >= 3, `focus ring ${m[1]} is only ${ratio.toFixed(2)}:1 on white`)
})

// ── Accessible names ────────────────────────────────────────────────────────

const GLYPHS = /^[×✕✖✗⨯+\-←→↑↓↗↙‹›«»…⋮≡🖊🗑📁📄📋⧉🔗⚙️🎛✨🔌👥🔍⚠️✓✔☑️⏻⏹⏵⏸⏭⏮🔄✂⏏ⓘ]\s*$/u

function buttonsIn(file) {
  const src = fs.readFileSync(file, 'utf8')
  const out = []
  const re = /<button\b/g
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index
    let i = start + 6, quote = null, end = -1
    while (i < src.length) {
      const c = src[i]
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null }
      else if (c === '"' || c === "'") quote = c
      else if (c === '>') { end = i; break }
      i++
    }
    if (end === -1) continue
    const tag = src.slice(start, end + 1)
    const close = src.indexOf('</button>', end)
    const inner = src.slice(end + 1, close === -1 ? end + 1 : close)
    out.push({ tag, inner, line: src.slice(0, start).split('\n').length })
  }
  return out
}

test('every icon-only button exposes an accessible name', () => {
  const problems = []
  for (const file of vueFiles()) {
    for (const button of buttonsIn(file)) {
      if (/aria-label|aria-labelledby/.test(button.tag)) continue
      const plain = button.inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      // A button with readable text content is named by that text, even when
      // it also carries an icon. Only a button whose content is nothing but a
      // glyph needs an explicit accessible name.
      const meaningful = plain.replace(GLYPHS, '').trim()
      if (meaningful.length > 0) continue
      problems.push(`${rel(file)}:${button.line} icon-only button with no accessible name ("${plain.slice(0, 30)}")`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

// ── Label association ───────────────────────────────────────────────────────

test('every label is associated with a control', () => {
  const problems = []
  for (const file of vueFiles()) {
    const src = fs.readFileSync(file, 'utf8')
    const re = /<label\b([^>]*)>/g
    let m
    while ((m = re.exec(src)) !== null) {
      const attrs = m[1]
      if (/\bfor=/.test(attrs)) continue
      const close = src.indexOf('</label>', m.index)
      const inner = src.slice(m.index, close === -1 ? m.index + 40 : close)
      // A label that wraps its control is implicitly associated.
      if (/<(input|select|textarea)\b/.test(inner)) continue
      problems.push(`${rel(file)}:${src.slice(0, m.index).split('\n').length} <label> without for= and without a nested control`)
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('every for= points at an id that exists', () => {
  const problems = []
  for (const file of vueFiles()) {
    const src = fs.readFileSync(file, 'utf8')
    const ids = new Set()
    for (const m of src.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1])
    for (const m of src.matchAll(/(?:^|\s)for="([^"]+)"/g)) {
      if (!ids.has(m[1])) {
        problems.push(`${rel(file)}: for="${m[1]}" has no matching id`)
      }
    }
    // Bound ids (:id="...") are resolved at runtime, so only static ids are checked.
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

// ── Live regions ────────────────────────────────────────────────────────────

test('the page has exactly one polite and one assertive live region', () => {
  const roles = []
  for (const file of vueFiles()) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/role="(status|alert|log)"([^>]*)>/g)) {
      roles.push({
        file: rel(file),
        line: src.slice(0, m.index).split('\n').length,
        role: m[1],
        live: (m[2].match(/aria-live="([^"]+)"/) || [])[1] || ''
      })
    }
  }
  const polite = roles.filter(r => r.role === 'status')
  const assertive = roles.filter(r => r.role === 'alert')
  assert.equal(polite.length, 1, `expected one polite region, found ${polite.length}: ${JSON.stringify(polite)}`)
  assert.equal(assertive.length, 1, `expected one assertive region, found ${assertive.length}: ${JSON.stringify(assertive)}`)
  assert.equal(polite[0].live, 'polite')
  assert.equal(assertive[0].live, 'assertive')
  assert.equal(roles.filter(r => r.role === 'log').length, 0)
})

// ── Reduced motion ──────────────────────────────────────────────────────────

/**
 * Walks a stylesheet and reports whether each declaration is inside a
 * `prefers-reduced-motion` block, tracking brace depth.
 */
function motionGuardMap(source) {
  const lines = source.split('\n')
  const guardDepth = []
  const results = []
  let depth = 0
  let inMedia = 0
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    const trimmed = line.trim()
    if (/@media[^{]*prefers-reduced-motion/.test(trimmed)) {
      inMedia++
      guardDepth.push(depth)
    }
    const declaration = /^\s*(animation|transition)\s*:/.test(line)
    if (declaration) {
      results.push({ line: trimmed, guarded: inMedia > 0 })
    }
    depth += opens - closes
    while (guardDepth.length && depth <= guardDepth[guardDepth.length - 1]) {
      guardDepth.pop()
      inMedia--
    }
  }
  return results
}

test('every animation and every transform transition is behind a reduced-motion guard', () => {
  const problems = []
  for (const file of styleFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const { line, guarded } of motionGuardMap(source)) {
      if (guarded) continue
      if (/^animation\s*:/.test(line)) {
        problems.push(`${rel(file)}: unguarded animation — ${line}`)
        continue
      }
      if (/^transition\s*:/.test(line) && /\btransform\b/.test(line)) {
        problems.push(`${rel(file)}: unguarded transform transition — ${line}`)
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
})

test('the reduced-motion block opts in with no-preference', () => {
  const source = fs.readFileSync(path.join(srcDir, 'App.vue'), 'utf8')
  assert.match(source, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.doesNotMatch(source, /animation-duration:\s*0\.01ms/, 'the guide forbids a global 0.01ms override')
})

// ── Combobox wiring ─────────────────────────────────────────────────────────

test('the tag combobox is wired to its list', () => {
  const src = fs.readFileSync(path.join(srcDir, 'App.vue'), 'utf8')
  assert.match(src, /aria-controls="tag-suggestions"/)
  assert.match(src, /id="tag-suggestions"/)
  assert.match(src, /:aria-activedescendant="tagActiveDescendant"/)
  assert.match(src, /:id="`tag-suggestion-\$\{index\}`"/)
})
