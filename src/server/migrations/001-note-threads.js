import crypto from 'crypto'
import { getDisplayTitle } from '../../shared/notesText.js'
import { computeCanvasHashFromData, leanCanvasData, snapshotHash } from '../canvas.js'
import { extractImageRefs } from '../images.js'
import { rebuildFts } from '../fts.js'

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info('${table}')`).all().some(c => c.name === column)
}

function addColumn(db, table, column, ddl) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

function insertRevisionImageRefs(db, revisionId, content, canvasData) {
  const hashes = extractImageRefs(content, canvasData)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO revision_image_refs (image_hash, revision_id) VALUES (?, ?)'
  )
  for (const hash of hashes) insert.run(hash, revisionId)
}

export const migration001NoteThreads = {
  version: 1,
  name: 'note-threads-and-revisions',
  up(db, ctx = {}) {
    const { imageStore } = ctx

    // ── Head columns ──────────────────────────────────────────────────────
    addColumn(db, 'notes', 'head_revision_id', 'head_revision_id TEXT')
    addColumn(db, 'notes', 'revision_no', 'revision_no INTEGER NOT NULL DEFAULT 1')
    addColumn(db, 'notes', 'display_title', 'display_title TEXT')
    addColumn(db, 'notes', 'content_hash', 'content_hash TEXT')
    addColumn(db, 'notes', 'canvas_hash', 'canvas_hash TEXT')
    addColumn(db, 'notes', 'archived_at', 'archived_at TEXT')
    addColumn(db, 'notes', 'last_checkpoint_at', 'last_checkpoint_at TEXT')

    // ── Revision layer ────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_revisions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        parent_revision_id TEXT,
        revision_no INTEGER NOT NULL,
        title TEXT,
        content TEXT,
        display_title TEXT,
        type TEXT NOT NULL DEFAULT 'text',
        canvas_data TEXT,
        thumbnail TEXT,
        snapshot_hash TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'ui',
        source TEXT NOT NULL DEFAULT 'ui',
        message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_revision_id) REFERENCES note_revisions(id) ON DELETE SET NULL
      );
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS note_drafts (
        note_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        base_revision_id TEXT,
        title TEXT,
        content TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (note_id, session_id),
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS note_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        revision_id TEXT,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL
      );
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS revision_image_refs (
        image_hash TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        PRIMARY KEY (image_hash, revision_id),
        FOREIGN KEY(revision_id) REFERENCES note_revisions(id) ON DELETE CASCADE
      );
    `)

    // Whiteboard render tables are introduced here so the legacy thumbnail can
    // become a one-tile render; the whiteboard-pages change extends their use.
    db.exec(`
      CREATE TABLE IF NOT EXISTS whiteboard_renders (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        revision_id TEXT,
        scene_hash TEXT NOT NULL,
        renderer_version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'complete',
        source TEXT NOT NULL DEFAULT 'client',
        tile_count INTEGER NOT NULL DEFAULT 0,
        is_current INTEGER NOT NULL DEFAULT 1,
        rendered_at TEXT NOT NULL,
        error TEXT,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS whiteboard_tiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        render_id TEXT NOT NULL,
        page_index INTEGER NOT NULL,
        image_hash TEXT NOT NULL,
        ext TEXT NOT NULL DEFAULT 'png',
        width INTEGER,
        height INTEGER,
        bbox_json TEXT,
        element_ids_json TEXT,
        clipped INTEGER NOT NULL DEFAULT 0,
        UNIQUE(render_id, page_index),
        FOREIGN KEY(render_id) REFERENCES whiteboard_renders(id) ON DELETE CASCADE
      );
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_revisions_note ON note_revisions(note_id, revision_no);
      CREATE INDEX IF NOT EXISTS idx_revisions_parent ON note_revisions(parent_revision_id);
      CREATE INDEX IF NOT EXISTS idx_revisions_created ON note_revisions(created_at);
      CREATE INDEX IF NOT EXISTS idx_note_events_note ON note_events(note_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_note_events_created ON note_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_revision_image_refs_hash ON revision_image_refs(image_hash);
      CREATE INDEX IF NOT EXISTS idx_renders_note ON whiteboard_renders(note_id, rendered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updatedAt);
      CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(archived_at);
      CREATE INDEX IF NOT EXISTS idx_notes_display_title ON notes(display_title);
    `)

    // ── Backfill existing notes as revision 1 ─────────────────────────────
    // Rebuild head refs from scratch so stale pre-migration rows do not keep
    // orphaned images alive.
    db.exec('DELETE FROM image_refs')
    const notes = db.prepare('SELECT * FROM notes').all()
    const insertRevision = db.prepare(`
      INSERT INTO note_revisions
        (id, note_id, parent_revision_id, revision_no, title, content, display_title,
         type, canvas_data, thumbnail, snapshot_hash, actor, source, message, created_at)
      VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?, 'system', 'import', ?, ?)
    `)
    const updateHead = db.prepare(`
      UPDATE notes
      SET head_revision_id = ?, revision_no = 1, display_title = ?, content_hash = ?,
          canvas_hash = ?, last_checkpoint_at = COALESCE(last_checkpoint_at, updatedAt)
      WHERE id = ?
    `)
    const insertEvent = db.prepare(`
      INSERT INTO note_events (note_id, revision_id, type, actor, payload, created_at)
      VALUES (?, ?, 'imported', 'system', ?, ?)
    `)
    const insertRender = db.prepare(`
      INSERT INTO whiteboard_renders
        (id, note_id, revision_id, scene_hash, renderer_version, status, source,
         tile_count, is_current, rendered_at)
      VALUES (?, ?, ?, ?, 0, 'complete', 'legacy-thumbnail', 1, 1, ?)
    `)
    const insertTile = db.prepare(`
      INSERT INTO whiteboard_tiles
        (render_id, page_index, image_hash, ext, width, height, bbox_json,
         element_ids_json, clipped)
      VALUES (?, 0, ?, ?, NULL, NULL, NULL, NULL, 0)
    `)
    const insertHeadRef = db.prepare(
      'INSERT OR IGNORE INTO image_refs (image_hash, note_id) VALUES (?, ?)'
    )

    for (const note of notes) {
      if (note.head_revision_id) continue

      const createdAt = note.createdAt || new Date().toISOString()
      const displayTitle = getDisplayTitle(note)
      const canvasHash = computeCanvasHashFromData(note.canvasData)
      const hash = snapshotHash({
        title: note.title || '',
        content: note.content || '',
        canvasHash
      })
      const lean = leanCanvasData(note.canvasData, imageStore)
      const revisionId = crypto.randomUUID()

      insertRevision.run(
        revisionId,
        note.id,
        note.title || '',
        note.content || '',
        displayTitle,
        note.type || 'text',
        lean,
        note.thumbnail || null,
        hash,
        'imported from pre-revision schema',
        createdAt
      )

      updateHead.run(revisionId, displayTitle, hash, canvasHash, note.id)

      insertRevisionImageRefs(db, revisionId, note.content || '', lean)

      // Head refs use the lean canvas so files extracted from dataURLs are
      // tracked even before the head is next written.
      const headHashes = extractImageRefs(note.content || '', lean)
      for (const h of headHashes) insertHeadRef.run(h, note.id)

      if (note.type === 'canvas' && note.thumbnail && imageStore) {
        const stored = imageStore.storeImageFromDataURL(note.thumbnail)
        if (stored) {
          const renderId = crypto.randomUUID()
          insertRender.run(
            renderId,
            note.id,
            revisionId,
            canvasHash || '',
            note.updatedAt || createdAt
          )
          insertTile.run(renderId, stored.hash, stored.ext)
          insertHeadRef.run(stored.hash, note.id)
        }
      }

      insertEvent.run(
        note.id,
        revisionId,
        JSON.stringify({ source: 'migration', version: 1 }),
        createdAt
      )
    }

    rebuildFts(db)

    // Sanity: every note must now have a head revision.
    const missing = db.prepare(
      'SELECT COUNT(*) AS count FROM notes WHERE head_revision_id IS NULL'
    ).get().count
    if (missing > 0) {
      throw new Error(`migration failed: ${missing} note(s) have no head revision`)
    }
  }
}
