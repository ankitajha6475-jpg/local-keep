import crypto from 'crypto'
import { computeCanvasHashFromData } from '../canvas.js'
import { EVENTS } from '../events.js'

function fail(status, message, code = 'render_error') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function tileDto(row) {
  return {
    pageIndex: row.page_index,
    hash: row.image_hash,
    ext: row.ext,
    url: `/api/images/${row.image_hash}.${row.ext}`,
    width: row.width,
    height: row.height,
    bbox: row.bbox_json ? JSON.parse(row.bbox_json) : null,
    elementIds: row.element_ids_json ? JSON.parse(row.element_ids_json) : [],
    clipped: !!row.clipped
  }
}

export function createRenderService({ db, imageRefs, bus }) {
  function latest(noteId) {
    const note = db.prepare('SELECT id, canvas_hash FROM notes WHERE id = ?').get(noteId)
    if (!note) throw fail(404, 'Note not found', 'note_not_found')
    const render = db.prepare(`
      SELECT * FROM whiteboard_renders
      WHERE note_id = ?
      ORDER BY is_current DESC, rendered_at DESC
      LIMIT 1
    `).get(noteId)
    if (!render) {
      return { noteId, renderId: null, status: 'unrendered', stale: true, tiles: [], tileCount: 0, renderedAt: null }
    }
    const tiles = db.prepare(
      'SELECT * FROM whiteboard_tiles WHERE render_id = ? ORDER BY page_index ASC'
    ).all(render.id)
    return {
      noteId,
      renderId: render.id,
      status: render.status,
      source: render.source,
      rendererVersion: render.renderer_version,
      sceneHash: render.scene_hash,
      canvasHash: note.canvas_hash || null,
      stale: (render.scene_hash || '') !== (note.canvas_hash || ''),
      renderedAt: render.rendered_at,
      tileCount: render.tile_count,
      tiles: tiles.map(tileDto)
    }
  }

  function saveManifest({
    noteId,
    tiles = [],
    source = 'client',
    rendererVersion = 1,
    requestId = null
  }) {
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId)
    if (!note) throw fail(404, 'Note not found', 'note_not_found')
    if (note.archived_at) throw fail(409, 'Note is archived', 'note_archived')
    if (!Array.isArray(tiles)) throw fail(400, 'tiles must be an array', 'invalid_tiles')
    if (tiles.length > 100) throw fail(400, 'Too many page tiles', 'too_many_tiles')

    const cleanTiles = tiles.map((tile, index) => {
      const hash = String(tile.hash || '')
      const ext = String(tile.ext || 'png')
      if (!/^[a-f0-9]{16}$/.test(hash)) throw fail(400, `Invalid tile hash at ${index}`, 'invalid_tile')
      if (!/^[a-z]+$/.test(ext)) throw fail(400, `Invalid tile ext at ${index}`, 'invalid_tile')
      return {
        pageIndex: Number(tile.pageIndex ?? index),
        hash,
        ext,
        width: tile.width != null ? Number(tile.width) : null,
        height: tile.height != null ? Number(tile.height) : null,
        bbox: Array.isArray(tile.bbox) ? tile.bbox : null,
        elementIds: Array.isArray(tile.elementIds) ? tile.elementIds : [],
        clipped: tile.clipped ? 1 : 0
      }
    }).sort((a, b) => a.pageIndex - b.pageIndex)

    const sceneHash = computeCanvasHashFromData(note.canvasData) || ''
    const renderId = crypto.randomUUID()
    const now = new Date().toISOString()

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE whiteboard_renders SET is_current = 0 WHERE note_id = ?').run(noteId)
      db.prepare(`
        INSERT INTO whiteboard_renders
          (id, note_id, revision_id, scene_hash, renderer_version, status, source,
           tile_count, is_current, rendered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        renderId,
        noteId,
        note.head_revision_id || null,
        sceneHash,
        rendererVersion,
        cleanTiles.length === 0 ? 'empty' : 'complete',
        source,
        cleanTiles.length,
        now
      )
      const insertTile = db.prepare(`
        INSERT INTO whiteboard_tiles
          (render_id, page_index, image_hash, ext, width, height, bbox_json,
           element_ids_json, clipped)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertRef = db.prepare(
        'INSERT OR IGNORE INTO image_refs (image_hash, note_id) VALUES (?, ?)'
      )
      for (const tile of cleanTiles) {
        insertTile.run(
          renderId,
          tile.pageIndex,
          tile.hash,
          tile.ext,
          tile.width,
          tile.height,
          tile.bbox ? JSON.stringify(tile.bbox) : null,
          JSON.stringify(tile.elementIds),
          tile.clipped
        )
        insertRef.run(tile.hash, noteId)
      }
      imageRefs.syncHeadRefs(noteId, note.content || '', note.canvasData)
      db.exec('COMMIT')
      const manifest = latest(noteId)
      bus?.emit(EVENTS.RENDER_UPDATED, {
        noteId,
        renderId,
        tileCount: cleanTiles.length,
        stale: manifest.stale,
        requestId
      })
      return manifest
    } catch (error) {
      try { db.exec('ROLLBACK') } catch (_) { /* noop */ }
      throw error
    }
  }

  return { latest, saveManifest }
}
