## ADDED Requirements

### Requirement: Wiki-link insertion search

The wiki-link insertion dialog SHALL let the user find a target note by typing, using keyword search over titles and content. It SHALL exclude archived notes and the current note, present recent active notes for an empty query, and keep the display label separate from the target title.

Inserting a link to an existing note SHALL use the stable `note:<id>` form. Inserting a typed new title SHALL use the title form and remain unresolved until a matching note exists.

#### Scenario: Find a target by title

- **WHEN** the user types part of an existing note title in the wiki-link dialog
- **THEN** that note appears in the suggestions
- **AND** choosing it inserts a link with the note id as the target

#### Scenario: Preserve a label

- **WHEN** the user selected the text `read this` before opening the wiki-link dialog and chooses a note titled `Alpha`
- **THEN** the inserted link resolves to `Alpha` and displays `read this`
