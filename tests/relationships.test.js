import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreshContext } from './helpers/testDb.js'

test('tags and wiki links are indexed, resolved, and filterable', () => {
  const ctx = createFreshContext()
  try {
    const a = ctx.notes.createNote({
      title: 'Alpha',
      content: 'Planning #project/local #project/other\n\nSee [[Beta]] and [[note:missing|Missing]].'
    })
    const b = ctx.notes.createNote({
      title: 'Beta',
      content: 'Beta note #project/local'
    })

    const aFresh = ctx.notes.getNote(a.id)
    assert.deepEqual(aFresh.tags.sort(), ['project/local', 'project/other'])
    assert.equal(aFresh.linkCount, 2)

    const outgoing = ctx.links.outgoing(a.id)
    const betaLink = outgoing.find(l => l.label === 'Beta')
    assert.equal(betaLink.targetNoteId, b.id)
    assert.equal(betaLink.status, 'ok')
    assert.equal(outgoing.find(l => l.label === 'Missing').status, 'unresolved')

    const backlinks = ctx.links.backlinks(b.id)
    assert.equal(backlinks.length, 1)
    assert.equal(backlinks[0].sourceNoteId, a.id)
    assert.match(backlinks[0].context, /\[\[Beta\]\]/)

    const tree = ctx.tags.tree()
    const project = tree.tags.find(n => n.tag === 'project')
    assert.equal(project.total, 2)
    assert.equal(project.children.find(n => n.tag === 'project/local').direct, 2)

    const descendantIds = ctx.tags.noteIdsForTag('project')
    assert.equal(descendantIds.has(a.id), true)
    assert.equal(descendantIds.has(b.id), true)
    const exactIds = ctx.tags.noteIdsForTag('project', { exact: true })
    assert.equal(exactIds.size, 0)

    const graph = ctx.links.graph({ noteId: a.id, depth: 1 })
    assert.equal(graph.nodes.some(n => n.id === b.id), true)
    assert.equal(graph.edges.some(e => e.source === a.id && e.target === b.id), true)

    const counts = ctx.links.countsByNote([a.id, b.id])
    assert.equal(counts.get(a.id).links, 2)
    assert.equal(counts.get(b.id).backlinks, 1)
  } finally {
    ctx.cleanup()
  }
})

test('ambiguous titles are marked and explicit ids are stable', () => {
  const ctx = createFreshContext()
  try {
    const dup1 = ctx.notes.createNote({ title: 'Dup', content: 'one' })
    const dup2 = ctx.notes.createNote({ title: 'Dup', content: 'two' })
    const source = ctx.notes.createNote({
      title: 'Source',
      content: `By title [[Dup]]; by id [[note:${dup2.id}|Exact]].`
    })

    const links = ctx.links.outgoing(source.id)
    assert.equal(links.find(l => l.raw === '[[Dup]]').status, 'ambiguous')
    const exact = links.find(l => l.label === 'Exact')
    assert.equal(exact.targetNoteId, dup2.id)
    assert.equal(exact.status, 'ok')
  } finally {
    ctx.cleanup()
  }
})

test('archive changes link status and graph excludes archived targets', () => {
  const ctx = createFreshContext()
  try {
    const a = ctx.notes.createNote({ title: 'A', content: '[[B]]' })
    const b = ctx.notes.createNote({ title: 'B', content: 'b' })

    ctx.notes.archiveNote(b.id)
    const outgoing = ctx.links.outgoing(a.id)
    assert.equal(outgoing[0].status, 'archived')
    assert.equal(ctx.links.outgoing(a.id)[0].targetNoteId, b.id)

    const graph = ctx.links.graph({})
    assert.equal(graph.nodes.some(n => n.id === b.id), false)
    assert.equal(graph.edges.length, 0)

    ctx.notes.restoreNote(b.id)
    assert.equal(ctx.links.outgoing(a.id)[0].status, 'ok')
  } finally {
    ctx.cleanup()
  }
})

test('branches do not change head tags or links', () => {
  const ctx = createFreshContext()
  try {
    const a = ctx.notes.createNote({ title: 'Branchy', content: '#head-tag [[B]]' })
    const b = ctx.notes.createNote({ title: 'B', content: 'b' })
    const base = a.revisionId

    ctx.notes.updateNote({
      id: a.id,
      content: '#head-tag [[B]] plus [[C]]',
      baseRevisionId: base
    })
    const branch = ctx.notes.updateNote({
      id: a.id,
      content: '#branch-tag [[D]]',
      baseRevisionId: base
    })
    assert.equal(branch.conflict, true)

    const head = ctx.notes.getNote(a.id)
    assert.deepEqual(head.tags, ['head-tag'])
    assert.equal(ctx.links.outgoing(a.id).some(l => l.label === 'D'), false)

    const branchRev = ctx.revisions.getRevision(branch.createdRevisionId)
    assert.match(branchRev.content, /#branch-tag/)
    assert.equal(ctx.tags.tagsForNote(a.id).includes('branch-tag'), false)
  } finally {
    ctx.cleanup()
  }
})

test('tag tree includes untagged count and prefix filtering', () => {
  const ctx = createFreshContext()
  try {
    ctx.notes.createNote({ title: 'Tagged', content: '#area/work' })
    ctx.notes.createNote({ title: 'Untagged', content: 'plain' })
    const tree = ctx.tags.tree()
    assert.equal(tree.untaggedCount, 1)
    assert.equal(tree.totalNotes, 2)
    const prefix = ctx.tags.tree({ prefix: 'area' })
    assert.equal(prefix.tags.length, 1)
    assert.equal(prefix.tags[0].tag, 'area')
    assert.equal(prefix.tags[0].children[0].tag, 'area/work')
  } finally {
    ctx.cleanup()
  }
})
