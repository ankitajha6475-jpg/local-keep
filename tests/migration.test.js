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
    assert.deepEqual(migrated.applied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    assert.ok(migrated.backupPath, 'a backup is created when notes exist')
    const tokenColumns = ctx.db.prepare("PRAGMA table_info('api_tokens')").all().map(column => column.name)
    assert.ok(tokenColumns.includes('expires_at'))
    assert.ok(tokenColumns.includes('created_by'))
    const noteColumns = ctx.db.prepare("PRAGMA table_info('notes')").all().map(column => column.name)
    assert.ok(noteColumns.includes('color'))
    const mcpSettings = ctx.db.prepare('SELECT * FROM mcp_settings WHERE id = 1').get()
    assert.equal(mcpSettings.max_write_sessions, 5)
    assert.equal(mcpSettings.max_read_sessions, 8)
    assert.equal(fs.existsSync(migrated.backupPath), true)

    const noteCount = ctx.db.prepare('SELECT COUNT(*) AS count FROM notes').get().count
    assert.equal(noteCount, 2)
    // The text note had an inline `#project/x` marker, so normalization appended
    // exactly one revision; the canvas note needed none.
    const revisionCount = ctx.db.prepare('SELECT COUNT(*) AS count FROM note_revisions').get().count
    assert.equal(revisionCount, 3)

    const text = ctx.db.prepare('SELECT * FROM notes WHERE id = ?').get('note-text')
    assert.equal(text.title, 'Legacy text')
    // Head content is normalized: the fence carries the tag, the body does not.
    assert.equal(
      text.content,
      '---\ntags: [project/x]\n---\nold content [[note:note-canvas|Board]] ![x](/api/images/abcdef0123456789.png)'
    )
    assert.ok(text.head_revision_id)
    assert.equal(text.revision_no, 2)
    assert.equal(text.display_title, 'Legacy text')

    // Revision 1 is the immutable pre-normalization snapshot.
    const textRev = ctx.db.prepare(
      'SELECT * FROM note_revisions WHERE note_id = ? AND revision_no = 1'
    ).get('note-text')
    assert.equal(textRev.parent_revision_id, null)
    assert.equal(textRev.revision_no, 1)
    assert.equal(textRev.content, 'old content #project/x [[note:note-canvas|Board]] ![x](/api/images/abcdef0123456789.png)')
    assert.equal(textRev.source, 'import')

    // Revision 2 is the single normalization revision.
    const normRev = ctx.db.prepare(
      'SELECT * FROM note_revisions WHERE note_id = ? AND revision_no = 2'
    ).get('note-text')
    assert.equal(normRev.parent_revision_id, textRev.id)
    assert.equal(normRev.source, 'property')
    assert.equal(normRev.message, 'metadata normalization')
    assert.equal(normRev.content, text.content)
    assert.ok(normRev.snapshot_hash, 'the normalization revision has a snapshot hash')

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

    assert.equal(first.applied.length, 15)
    assert.equal(revisionsAfterFirst, 1)
    assert.equal(revisionsAfterSecond, 1)
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS count FROM notes').get().count, 1)
  } finally {
    ctx.cleanup()
  }
})
