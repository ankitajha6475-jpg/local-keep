/**
 * One-off repair for duplicated properties fences.
 *
 * Cause: the shared Yjs draft stored the whole file (fence + body) while the
 * editor held body-only, so `buildNoteContent(props, body)` prepended a second
 * fence on every save through the collab path. Fixed in `textCollab.js`.
 *
 * This collapses stacked leading fences into one and commits the result through
 * the normal revision path — history is appended to, never rewritten.
 *
 *   node scripts/repair-fences.js [--dry-run]
 */
import path from 'path'
import { pathToFileURL } from 'url'
import { openDatabase } from '../src/server/db.js'
import { createImageStore } from '../src/server/images.js'
import { createImageRefService } from '../src/server/services/imageRefs.js'
import { createRevisionService } from '../src/server/services/revisions.js'
import { createNoteService } from '../src/server/services/notes.js'
import { createTagService } from '../src/server/services/tags.js'
import { createLinkService } from '../src/server/services/links.js'
import { createNoteMetaService } from '../src/server/services/noteMeta.js'
import { createEventBus } from '../src/server/events.js'
import { parseNoteContent, buildNoteContent, getProp, setProp } from '../src/shared/noteMeta.js'

const DATA_DIR = process.env.LOCAL_KEEP_DATA_DIR || path.resolve('data')
const DRY = process.argv.includes('--dry-run')

/**
 * Collapse stacked leading fences into a single one. Later layers win on key
 * conflicts; list-valued keys are unioned so no tag is lost.
 */
export function collapseFences(content) {
  const layers = []
  let rest = String(content ?? '')
  let base = parseNoteContent(rest)
  layers.push(base)
  // A corrupted body still leads with a fence (splitFence strips exactly one).
  while (/^---[ \t]*\r?\n/.test(base.body)) {
    const next = parseNoteContent(base.body)
    if (!next.hadFence) break
    layers.push(next)
    base = next
    if (layers.length > 16) break // defensive
  }
  const body = layers[layers.length - 1].body

  // Merge properties outermost-last so the most recently written wins.
  let entries = []
  for (const layer of layers) {
    for (const entry of layer.entries) {
      if (entry.blank) continue
      const existing = getProp(entries, entry.key)
      if (existing === undefined) {
        entries = setProp(entries, entry.key, entry.value)
      } else if (Array.isArray(existing) && Array.isArray(entry.value)) {
        entries = setProp(entries, entry.key, [...new Set([...existing, ...entry.value])])
      } else {
        entries = setProp(entries, entry.key, entry.value)
      }
    }
  }
  return { content: buildNoteContent(entries, body), layers: layers.length }
}

function buildServices(db) {
  const imageStore = createImageStore({ imagesDir: path.join(DATA_DIR, 'images') })
  const bus = createEventBus()
  const imageRefs = createImageRefService({ db, imageStore })
  const tags = createTagService({ db })
  const links = createLinkService({ db })
  const noteMeta = createNoteMetaService({ db })
  const revisions = createRevisionService({ db, imageStore, imageRefs, bus, tags, links, noteMeta })
  const notes = createNoteService({ db, revisions, imageRefs, bus, tags, links, noteMeta })
  tags.setApplyNoteTags((noteId, nextTags, opts) =>
    notes.setProperties(noteId, {
      set: { tags: nextTags },
      actor: opts?.actor || 'system',
      message: opts?.message || 'tag edit'
    })
  )
  return notes
}

/**
 * The side-effecting entry point. Guarded so that importing this module for
 * `collapseFences` never touches the database — a repair script that mutates
 * data on import bypasses its own dry-run gate.
 */
function main() {
  const db = openDatabase(path.join(DATA_DIR, 'local-keep.db'))
  const notes = db.prepare('SELECT id, title, content FROM notes').all()
  const notesService = DRY ? null : buildServices(db)

  let fixed = 0
  for (const note of notes) {
    const { content, layers } = collapseFences(note.content)
    if (content === note.content) continue
    fixed += 1
    console.log(
      `${DRY ? '[dry-run] ' : ''}repair ${note.id} ` +
      `"${String(note.title || '').slice(0, 40)}" — ${layers} fence layers → 1`
    )
    if (DRY) continue

    notesService.updateNote({
      id: note.id,
      content,
      mode: 'take_head',
      actor: 'system',
      source: 'property',
      message: 'repair duplicated properties fence',
      force: true
    })
  }

  console.log(`${DRY ? '[dry-run] ' : ''}${fixed} note(s) ${DRY ? 'need repair' : 'repaired'}`)
  db.close()
}

// Only run when invoked directly (`node scripts/repair-fences.js`), never on import.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main()
