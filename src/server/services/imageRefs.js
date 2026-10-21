import fs from 'fs'
import path from 'path'
import { extractImageRefs } from '../images.js'

export function createImageRefService({ db, imageStore }) {
  function currentTileHashes(noteId) {
    try {
      const rows = db.prepare(`
        SELECT DISTINCT t.image_hash AS hash
        FROM whiteboard_tiles t
        JOIN whiteboard_renders r ON r.id = t.render_id
        WHERE r.note_id = ? AND r.is_current = 1
      `).all(noteId)
      return new Set(rows.map(r => r.hash))
    } catch (_) {
      return new Set()
    }
  }

  /** Rebuild the head/tile reference set for one note. */
  function syncHeadRefs(noteId, content, canvasData) {
    try {
      const hashes = extractImageRefs(content, canvasData)
      for (const hash of currentTileHashes(noteId)) hashes.add(hash)
      db.prepare('DELETE FROM image_refs WHERE note_id = ?').run(noteId)
      if (hashes.size > 0) {
        const insert = db.prepare(
          'INSERT OR IGNORE INTO image_refs (image_hash, note_id) VALUES (?, ?)'
        )
        for (const hash of hashes) insert.run(hash, noteId)
      }
    } catch (error) {
      console.error('Image ref sync error:', error.message)
    }
  }

  /** Rebuild the immutable reference set for one revision. */
  function syncRevisionRefs(revisionId, content, canvasData) {
    try {
      const hashes = extractImageRefs(content, canvasData)
      db.prepare('DELETE FROM revision_image_refs WHERE revision_id = ?').run(revisionId)
      if (hashes.size > 0) {
        const insert = db.prepare(
          'INSERT OR IGNORE INTO revision_image_refs (image_hash, revision_id) VALUES (?, ?)'
        )
        for (const hash of hashes) insert.run(hash, revisionId)
      }
    } catch (error) {
      console.error('Revision image ref sync error:', error.message)
    }
  }

  function addNoteRefs(noteId, hashes) {
    try {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO image_refs (image_hash, note_id) VALUES (?, ?)'
      )
      for (const hash of hashes) insert.run(hash, noteId)
    } catch (_) { /* best effort */ }
  }

  function releaseNoteRefs(noteId) {
    db.prepare('DELETE FROM image_refs WHERE note_id = ?').run(noteId)
    db.prepare(`
      DELETE FROM revision_image_refs
      WHERE revision_id IN (SELECT id FROM note_revisions WHERE note_id = ?)
    `).run(noteId)
  }

  function referencedHashes() {
    const hashes = new Set()
    for (const row of db.prepare('SELECT DISTINCT image_hash AS hash FROM image_refs').all()) {
      hashes.add(row.hash)
    }
    try {
      for (const row of db.prepare('SELECT DISTINCT image_hash AS hash FROM revision_image_refs').all()) {
        hashes.add(row.hash)
      }
    } catch (_) { /* table may not exist during early migration */ }
    try {
      for (const row of db.prepare('SELECT DISTINCT image_hash AS hash FROM whiteboard_tiles').all()) {
        hashes.add(row.hash)
      }
    } catch (_) { /* table may not exist during early migration */ }
    return hashes
  }

  function cleanupImages() {
    const referenced = referencedHashes()
    const files = fs.readdirSync(imageStore.imagesDir)
    const deleted = []
    for (const file of files) {
      const match = file.match(/^([a-f0-9]{16})\.[a-z]+$/)
      if (!match) continue
      if (!referenced.has(match[1])) {
        fs.unlinkSync(path.join(imageStore.imagesDir, file))
        deleted.push(file)
      }
    }
    return deleted
  }

  return {
    syncHeadRefs,
    syncRevisionRefs,
    addNoteRefs,
    releaseNoteRefs,
    referencedHashes,
    cleanupImages
  }
}
