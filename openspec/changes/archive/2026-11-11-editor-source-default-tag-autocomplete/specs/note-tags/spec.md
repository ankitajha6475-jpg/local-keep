## MODIFIED Requirements

### Requirement: Tags on notes

Note list/get responses SHALL include the note's current tags derived from the fence. Cards SHALL render tag chips; clicking a chip SHALL apply the tag filter. The note's properties panel SHALL edit tags through chips that write the `tags` property. A new note SHALL start with an empty properties section and an empty `tags` list, regardless of tags added during a previous editor session.

#### Scenario: Edit tags through chips

- **WHEN** the user adds `project/alpha` in the properties panel
- **THEN** the fence's `tags` list gains the entry
- **AND** the tag tree and counts update

#### Scenario: New note has no inherited tags

- **WHEN** the user adds tags to one note, closes the editor, and opens a new note
- **THEN** the new note's properties panel has no tag chips
- **AND** saving it writes no `tags` property until the user adds one

#### Scenario: Card tag chip

- **WHEN** a note declares `tags: [project/local-keep]`
- **THEN** its card shows a `#project/local-keep` chip
- **AND** clicking it filters the gallery

## ADDED Requirements

### Requirement: Tag autocomplete while typing

The properties-panel tag input SHALL suggest known tag paths while the user
types. Suggestions SHALL be derived client-side from the loaded tag tree plus the
note's own tags, SHALL exclude tags already applied to the note, and SHALL be
capped at eight rows. Matching SHALL be fuzzy and SHALL rank exact paths first,
then whole-path prefixes, then path-segment prefixes, then substrings, then
in-order character subsequences; ties SHALL prefer the shorter path. Selecting a
suggestion SHALL add that tag to the `tags` property. Manually typing a new path
and committing it SHALL remain possible. Empty input SHALL NOT open a suggestion
list.

#### Scenario: Suggest an existing tag

- **WHEN** the user types `proj` and `area/project` exists
- **THEN** `area/project` appears in the suggestion list
- **AND** selecting it adds that tag chip

#### Scenario: Fuzzy match

- **WHEN** the user types `ject` or an in-order abbreviation
- **THEN** matching tag paths are suggested
- **AND** exact and prefix matches rank above substring and subsequence matches

#### Scenario: Applied tags are excluded

- **WHEN** a tag is already a chip on the note
- **THEN** it does not appear in the suggestion list

#### Scenario: Create a new tag

- **WHEN** the user types a path that is not in the known tree and presses Enter
- **THEN** the typed tag is added
- **AND** autocomplete does not block it

#### Scenario: Keyboard and pointer selection

- **WHEN** the suggestion list is open
- **THEN** ArrowUp/ArrowDown move the highlight, Enter accepts the highlighted suggestion, Escape closes the list, and clicking a row adds that tag
