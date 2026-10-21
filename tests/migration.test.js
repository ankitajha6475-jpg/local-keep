import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { createLegacyContext, TINY_PNG_DATA_URL } from './helpers/testDb.js'

function insertLegacyNote(db, note) {
  db.prepare(`
    INSERT INTO notes (id, title, content, type, canvasData, thumbnail, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    note.id,
    note.title || '',
    note.content || '',
    note.type || 'text',
    note.canvasData || null,
    note.thumbnail || null,
    note.createdAt || '2026-01-01T00:00:00.000Z',
    note.updatedAt || '2026-01-02T00:00:00.000Z'
  )
}

test('legacy notes become revision 1 with stable ids and a backup', () => {
  const ctx = createLegacyContext()
  try {
    insertLegacyNote(ctx.db, {
      id: 'note-text',
      title: 'Legacy text',
      content: 'old content #project/x [[note:note-canvas|Board]] ![x](/api/images/abcdef0123456789.png)'
    })
    const canvasData = JSON.stringify({
      elements: [{ id: 'el1', type: 'rectangle', x: 1, y: 2, width: 3, height: 4 }],
      files: {
        file1: {
          id: 'file1',
          mimeType: 'image/png',
          dataURL: TINY_PNG_DATA_URL,
          created: 1
        }
      }
    })
    insertLegacyNote(ctx.db, {
      id: 'note-canvas',
      title: 'Legacy canvas',
      type: 'canvas',
      canvasData,
      thumbnail: TINY_PNG_DATA_URL
    })

    const migrated = ctx.migrate()
    assert.deepEqual(migrated.applied, [1, 2, 3, 4])
    assert.ok(migrated.backupPath, 'a backup is created when notes exist')
    assert.equal(fs.existsSync(migrated.backupPath), true)

    const noteCount = ctx.db.prepare('SELECT COUNT(*) AS count FROM notes').get().count
    assert.equal(noteCount, 2)
    const revisionCount = ctx.db.prepare('SELECT COUNT(*) AS count FROM note_revisions').get().count
    assert.equal(revisionCount, 2)

    const text = ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get('note-text')
    assert.equal(text.title, 'Legacy text')
    assert.equal(text.content, 'old content #project/x [[note:note-canvas|Board]] ![x](/api/images/abcdef0123456789.png)')
    assert.ok(text.head_revision_id)
    assert.equal(text.revision_no, 1)
    assert.equal(text.display_title, 'Legacy text')

    const textRev = ctx.db.prepare(
      'SELECT * FROM note_revisions WHERE note_id = ?'
    ).get('note-text')
    assert.equal(textRev.parent_revision_id, null)
    assert.equal(textRev.revision_no, 1)
    assert.equal(textRev.content, text.content)
    assert.equal(textRev.source, 'import')

    const tags = ctx.db.prepare('SELECT tag FROM note_tags WHERE note_id = ?').all('note-text')
    assert.deepEqual(tags.map(t => t.tag), ['project/x'])
    const parsedLinks = ctx.db.prepare(
      'SELECT * FROM note_links WHERE source_note_id = ?'
    ).all('note-text')
    assert.equal(parsedLinks.length, 1)
    assert.equal(parsedLinks[0].target_note_id, 'note-canvas')
    assert.equal(parsedLinks[0].target_kind, 'id')
    assert.equal(parsedLinks[0].label, 'Board')
    assert.equal(parsedLinks[0].status, 'ok')

    const canvas = ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get('note-canvas')
    assert.ok(canvas.head_revision_id)
    assert.match(canvas.canvasData, /data:image\/png;base64/, 'head keeps renderable dataURL')
    const canvasRev = ctx.db.prepare(
      'SELECT * FROM note_revisions WHERE note_id = ?'
    ).get('note-canvas')
    const lean = JSON.parse(canvasRev.canvas_data)
    assert.equal(lean.files.file1.dataURL, undefined, 'revision strips base64')
    assert.match(lean.files.file1.hash, /^[a-f0-9]{16}$/)
    assert.equal(fs.existsSync(path.join(ctx.imagesDir, `${lean.files.file1.hash}.png`)), true)

    const render = ctx.db.prepare(
      'SELECT * FROM whiteboard_renders WHERE note_id = ?'
    ).get('note-canvas')
    assert.ok(render)
    assert.equal(render.source, 'legacy-thumbnail')
    assert.equal(render.tile_count, 1)
    const tile = ctx.db.prepare(
      'SELECT * FROM whiteboard_tiles WHERE render_id = ?'
    ).get(render.id)
    assert.ok(tile)
    assert.equal(tile.page_index, 0)

    const ftsCount = ctx.db.prepare('SELECT COUNT(*) AS count FROM notes_fts').get().count
    assert.equal(ftsCount, 2)
    assert.equal(migrated.notes.listNotes().length, 2)
  } finally {
    ctx.cleanup()
  }
})

test('migration is idempotent', () => {
  const ctx = createLegacyContext()
  try {
    insertLegacyNote(ctx.db, { id: 'n1', title: 'One', content: 'alpha' })
    const first = ctx.migrate()
    const revisionsAfterFirst = ctx.db.prepare(
      'SELECT COUNT(*) AS count FROM note_revisions'
    ).get().count

    const second = ctx.migrate()
    assert.deepEqual(second.applied, [])
    const revisionsAfterSecond = ctx.db.prepare(
      'SELECT COUNT(*) AS count FROM note_revisions'
    ).get().count

    assert.equal(first.applied.length, 4)
    assert.equal(revisionsAfterFirst, 1)
    assert.equal(revisionsAfterSecond, 1)
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM notes').get().count, 1)
  } finally {
    ctx.cleanup()
  }
})
