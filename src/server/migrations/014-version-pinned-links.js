export const migration014VersionPinnedLinks = {
  version: 14,
  name: 'version-pinned-links',
  up(db) {
    // Pin a link to the immutable revision of its target it references.
    db.exec('ALTER TABLE note_links ADD COLUMN target_revision_id TEXT')
    // Backfill existing resolved links: pin them to the target's current head
    // revision (best effort — the head at original link time is unknown).
    db.exec(`
      UPDATE note_links
      SET target_revision_id = (
        SELECT n.head_revision_id FROM notes n WHERE n.id = note_links.target_note_id
      )
      WHERE target_note_id IS NOT NULL
    `)
    // Support version-chain lookups (each revision -> its parent, old->new).
    db.exec('CREATE INDEX IF NOT EXISTS idx_note_revisions_parent ON note_revisions(parent_revision_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_links_target_rev ON note_links(target_revision_id)')
  }
}
