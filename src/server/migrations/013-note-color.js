export const migration013NoteColor = {
  version: 13,
  name: 'note-color',
  up(db) {
    db.exec('ALTER TABLE notes ADD COLUMN color TEXT')
  }
}
