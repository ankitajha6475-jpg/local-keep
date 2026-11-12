## MODIFIED Requirements

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

No tag SHALL be committed while an IME owns the keystroke. Enter, the comma
key, the arrow keys, and Escape SHALL stand down during a composition so the
IME can confirm or cancel its candidate and the suggestion list does not move
on its own.

The suggestion list SHALL be wired as an ARIA combobox. The input SHALL declare
`role="combobox"` with `aria-expanded`, `aria-controls` pointing at the list,
and `aria-autocomplete="list"`. The list SHALL be a `role="listbox"` whose
options carry stable ids. While a suggestion is highlighted, the input SHALL
expose it through `aria-activedescendant`; the reference SHALL be absent when
no suggestion is highlighted or the list is closed.

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

#### Scenario: Enter during IME composition

- **WHEN** the user presses Enter while an IME is composing a tag path
- **THEN** the IME confirms the candidate
- **AND** no tag is committed

#### Scenario: Comma during IME composition

- **WHEN** the user presses the comma key while an IME is composing a tag path
- **THEN** no tag is committed

#### Scenario: The highlighted suggestion is announced

- **WHEN** the user presses ArrowDown to highlight a suggestion
- **THEN** the input's `aria-activedescendant` points at that suggestion's id
- **AND** a screen reader announces the highlighted suggestion

#### Scenario: The combobox is wired to its list

- **WHEN** the tag input is focused
- **THEN** its `aria-controls` references the id of the suggestion list
- **AND** `aria-expanded` reports whether the list is open
