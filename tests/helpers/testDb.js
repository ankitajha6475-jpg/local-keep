import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase, runMigrations } from '../../src/server/db.js'
import { createBaseSchema } from '../../src/server/schema.js'
import { createImageStore } from '../../src/server/images.js'
import { createImageRefService } from '../../src/server/services/imageRefs.js'
import { createRevisionService } from '../../src/server/services/revisions.js'
import { createNoteService } from '../../src/server/services/notes.js'
import { createRenderService } from '../../src/server/services/renders.js'
import { createTagService } from '../../src/server/services/tags.js'
import { createLinkService } from '../../src/server/services/links.js'
import { createEventBus } from '../../src/server/events.js'
import { migration001NoteThreads } from '../../src/server/migrations/001-note-threads.js'
import { migration002RelationshipsAndTags } from '../../src/server/migrations/002-relationships-and-tags.js'
import { migration003ApiTokens } from '../../src/server/migrations/003-api-tokens.js'

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'local-keep-test-'))
}

function openContext() {
  const dir = makeDir()
  const dbFile = path.join(dir, 'test.db')
  const imagesDir = path.join(dir, 'images')
  const backupDir = path.join(dir, 'backups')
  const db = openDatabase(dbFile)
  createBaseSchema(db)
  const imageStore = createImageStore({ imagesDir })
  return {
    dir,
    dbFile,
    imagesDir,
    backupDir,
    db,
    imageStore,
    cleanup() {
      try { db.close() } catch (_) { /* noop */ }
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

function buildServices(ctx) {
  const bus = createEventBus()
  const imageRefs = createImageRefService({ db: ctx.db, imageStore: ctx.imageStore })
  const tags = createTagService({ db: ctx.db })
  const links = createLinkService({ db: ctx.db })
  const revisions = createRevisionService({
    db: ctx.db,
    imageStore: ctx.imageStore,
    imageRefs,
    bus,
    tags,
    links
  })
  const notes = createNoteService({
    db: ctx.db,
    revisions,
    imageRefs,
    bus,
    tags,
    links
  })
  const renders = createRenderService({ db: ctx.db, imageRefs, bus })
  return { bus, imageRefs, revisions, notes, tags, links, renders }
}

export function createFreshContext() {
  const ctx = openContext()
  const result = runMigrations({
    db: ctx.db,
    migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens],
    backupDir: ctx.backupDir,
    context: { imageStore: ctx.imageStore }
  })
  return { ...ctx, migration: result, ...buildServices(ctx) }
}

/**
 * Create a pre-revision database. The caller inserts legacy notes, then calls
 * `migrate()`; services are built after migration.
 */
export function createLegacyContext() {
  const ctx = openContext()
  let services = null
  const migrate = () => {
    const result = runMigrations({
      db: ctx.db,
      migrations: [migration001NoteThreads, migration002RelationshipsAndTags, migration003ApiTokens],
      backupDir: ctx.backupDir,
      context: { imageStore: ctx.imageStore }
    })
    services = buildServices(ctx)
    return { ...result, ...services }
  }
  return { ...ctx, migrate, getServices: () => services }
}

/** A 1x1 transparent PNG data URL, useful for legacy thumbnails. */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
