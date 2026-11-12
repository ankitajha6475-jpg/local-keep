#!/usr/bin/env node
/**
 * Post-archive housekeeping for OpenSpec changes.
 *
 * `openspec archive` writes a main spec with a `TBD` Purpose and copies the
 * change's proposal verbatim, which leaves two things to tidy up:
 *
 *  1. The new main spec's `## Purpose` section says "TBD - created by
 *     archiving change <name>". It has to be written by hand.
 *  2. The archived proposal's `## Why` section can exceed the 1000-character
 *     budget the CLI warns about.
 *
 * Usage: node scripts/openspec-post-archive.js <change-name> "<purpose text>"
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const [changeName, purpose] = process.argv.slice(2)
if (!changeName || !purpose) {
  console.error('usage: node scripts/openspec-post-archive.js <change-name> "<purpose>"')
  process.exit(1)
}

// The archive directory is dated; find the one that matches the change name.
const archiveRoot = path.join(repoRoot, 'openspec/changes/archive')
const archived = fs.readdirSync(archiveRoot)
  .filter(name => name.endsWith(`-${changeName}`))
  .sort()
if (!archived.length) {
  console.error(`no archived change matching "${changeName}" under ${archiveRoot}`)
  process.exit(1)
}
const archivedDir = path.join(archiveRoot, archived[archived.length - 1])
const slug = archived[archived.length - 1].replace(/^\d{4}-\d{2}-\d{2}-/, '')

// 1. Fill in the Purpose of every main spec the change created.
const specsDir = path.join(archivedDir, 'specs')
if (fs.existsSync(specsDir)) {
  for (const capability of fs.readdirSync(specsDir)) {
    const mainSpec = path.join(repoRoot, 'openspec/specs', capability, 'spec.md')
    if (!fs.existsSync(mainSpec)) continue
    let text = fs.readFileSync(mainSpec, 'utf8')
    const tbd = /^## Purpose\nTBD - created by archiving change .*\. Update Purpose after archive\.$/m
    if (!tbd.test(text)) continue
    text = text.replace(tbd, `## Purpose\n${purpose}`)
    fs.writeFileSync(mainSpec, text)
    console.log(`purpose written: openspec/specs/${capability}/spec.md`)
  }
}

// 2. Report the archived proposal's Why length.
const proposalPath = path.join(archivedDir, 'proposal.md')
if (fs.existsSync(proposalPath)) {
  const text = fs.readFileSync(proposalPath, 'utf8')
  const why = text.slice(text.indexOf('## Why') + 7, text.indexOf('## What Changes')).trim()
  const status = why.length <= 1000 ? 'ok' : 'TOO LONG'
  console.log(`archived proposal Why: ${why.length} chars (${status}) — ${path.relative(repoRoot, proposalPath)}`)
}

console.log(`change: ${slug}`)
