# Note Tags

## Purpose

Gives notes a hierarchical, code-aware tag structure with a browsable tree, counts, and descendant-aware filtering.

## Requirements

### Requirement: Tag syntax and normalisation

Tags SHALL be a list-valued property of the note's properties section, not text parsed from the body. Tag paths SHALL be hierarchical slash paths (`area/project/topic`), NFKC-normalised, lowercased, deduplicated, limited to 64 characters, and capped at 100 per note. The body MAY contain `#` text, which is never interpreted as a tag. Inline content parsing SHALL be used only by migration and by the pre-migration compatibility writers.

#### Scenario: Body hash text is not a tag

- **WHEN** a note's body contains `#project/alpha` and its fence declares `tags: [ops]`
- **THEN** the note's tags are exactly `ops`
- **AND** the body text renders unchanged

#### Scenario: Parse a hierarchical tag

- **WHEN** a note declares `tags: [project/local-keep/design]`
- **THEN** the note has that full tag path
- **AND** the tag tree exposes `project`, `project/local-keep`, and the full path

#### Scenario: Ignore code and colours

- **WHEN** a note's body contains `#e2ece4` or `#tag` inside code
- **THEN** neither is recorded as a tag

### Requirement: Tag tree and counts

`GET /api/tags` SHALL return a tree of tag paths with direct note counts and subtree counts. Prefix filtering SHALL be supported. The UI SHALL show a collapsible tag tree with counts and an "Untagged" entry.

#### Scenario: Tag tree counts

- **WHEN** two notes use `#project/local-keep` and one uses `#project/other`
- **THEN** `project` has subtree count 3
- **AND** `project/local-keep` has direct count 2

### Requirement: Operable tag tree

The tag tree SHALL support renaming a tag path, moving a subtree under a new parent, and deleting a subtree, applied across every note whose tags match. Operations SHALL use exact-path semantics: renaming `area/project` rewrites `area/project` and `area/project/*`, and must not touch `area/projector`. Archived notes SHALL be skipped and reported.

#### Scenario: Rename a subtree

- **WHEN** the user renames `area/project` to `area/proj`
- **THEN** every note tagged `area/project` or `area/project/...` has those paths rewritten to `area/proj` and `area/proj/...`
- **AND** `area/projector` is unchanged

#### Scenario: Move a subtree

- **WHEN** the user moves `alpha` under `ops`
- **THEN** `alpha` and `alpha/*` become `ops/alpha` and `ops/alpha/*`
- **AND** the tree re-derives from the rewritten tags

#### Scenario: Delete a subtree with confirmation

- **WHEN** the user confirms deleting `area/project`
- **THEN** those tag paths are removed from every affected note's `tags` property
- **AND** the notes themselves remain intact

### Requirement: Tag tree operations are property mutations

Rename, move, and delete SHALL rewrite the `tags` property of each affected note and create one revision per note with `source: property` and a shared message describing the operation. Archived notes SHALL NOT be modified and SHALL be reported as skipped.

#### Scenario: Batch revision message

- **WHEN** a rename touches five notes
- **THEN** each affected note gains exactly one revision
- **AND** all five revisions carry the same operation message

### Requirement: Tag filtering

Note list and search SHALL accept a `tag` filter. By default it SHALL include descendants (`#project` matches `#project/local-keep`); `exactTag=1` SHALL restrict to the exact tag. Selecting a tag in the sidebar SHALL filter the gallery and show a removable breadcrumb.

#### Scenario: Filter by parent tag

- **WHEN** the user selects `#project`
- **THEN** notes tagged `#project` or any `#project/...` child are shown
- **AND** selecting the exact-only mode shows only exact `#project` notes

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

### Requirement: Tag rebuild on revision

Tags SHALL describe the current head. When a revision moves the head, the system SHALL rebuild that note's tags from its fence. Branch revisions that do not move the head SHALL NOT change the head's tags.

#### Scenario: Edit adds a tag

- **WHEN** a user saves a revision whose fence adds `project/new`
- **THEN** the head's tags include `project/new`
- **AND** the tag tree counts include it

#### Scenario: Branch does not change head tags

- **WHEN** a stale save is kept as a branch with a new tag
- **THEN** the head's tags remain unchanged
- **AND** the branch content is still readable in history

### Requirement: Tag migration

A versioned migration SHALL create tag tables and backfill existing notes from their head content and canvas text. The migration MUST be idempotent and MUST run after the note-thread migration. A later normalization migration SHALL move tags from body markers into the fence and MUST append a normalization revision per note rather than rewriting history.

#### Scenario: Backfill existing tags

- **WHEN** the migration runs on an existing database containing `#tag`
- **THEN** `note_tags` contains the parsed entries
- **AND** re-running the migration creates no duplicates

#### Scenario: Normalization moves markers into the fence

- **WHEN** the properties migration runs on a note with inline `#tag` markers
- **THEN** the head body no longer contains those markers
- **AND** the fence lists them under `tags`
- **AND** one normalization revision is appended

### Requirement: Tag sidebar never scrolls horizontally

The tag sidebar SHALL keep a fixed-width column in which every row fits without
a horizontal scrollbar. Long tag names SHALL truncate with an ellipsis and the
count pill SHALL remain visible; the sidebar SHALL hide horizontal overflow so
the browser can never render a horizontal scrollbar in the column.

#### Scenario: Long tag name

- **WHEN** a tag path is longer than the sidebar width
- **THEN** the name is truncated with an ellipsis
- **AND** the count pill stays visible on the row

#### Scenario: No horizontal scrollbar

- **WHEN** the sidebar renders any set of tags
- **THEN** the sidebar never shows a horizontal scrollbar

### Requirement: Tag whitelist pattern matcher

The system SHALL evaluate `.gitignore`-style pattern lists top-to-bottom against a note's set of tags.

- Lines starting with `#` are comments; blank lines are ignored.
- Patterns support standard wildcards (`*`, `**`, `?`) and directory delimiters (`/`).
- Leading `!` negates a pattern, excluding matching notes.
- The special token `:untagged` matches any note having zero tags.
- A note with multiple tags SHALL be permitted if at least one tag matches an allow pattern, AND no tag on the note matches an active deny (`!`) pattern.
- If `tag_whitelist` is null or empty, access is unrestricted for admins and empty/denied for restricted non-admins.

#### Scenario: Match untagged note with :untagged

- **GIVEN** whitelist `*\n!:untagged`
- **WHEN** evaluating an untagged note
- **THEN** access is denied

#### Scenario: Match multiple tags with exclusions

- **GIVEN** whitelist `work/*\n!work/private/*`
- **WHEN** evaluating a note with tags `['work/project', 'work/private/keys']`
- **THEN** access is denied due to the explicit exclusion

#### Scenario: Match multiple tags with one permitted

- **GIVEN** whitelist `work/*`
- **WHEN** evaluating a note with tags `['work/project', 'random']`
- **THEN** access is granted because `work/project` matches

### Requirement: Workspace query filtering

All workspace read paths (`/api/notes/index`, `/api/notes/window`, `/api/search/*`, `/api/tags`, `/api/graph`) SHALL enforce the authenticated user's tag whitelist. Notes that do not match the whitelist SHALL NOT be returned or counted.

#### Scenario: Tag tree reflects visible notes only

- **WHEN** a user requests `GET /api/tags`
- **THEN** direct and subtree counts only count notes permitted by the user's whitelist
