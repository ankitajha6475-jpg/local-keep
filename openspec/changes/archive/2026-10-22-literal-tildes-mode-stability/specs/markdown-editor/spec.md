## ADDED Requirements

### Requirement: Literal single tildes

Rendered markdown SHALL treat a single `~` as literal text. Only the GFM `~~text~~` form SHALL produce strikethrough (`<del>`). Single tildes in paths such as `~/.config`, in prose, and in link destinations MUST NOT open or close a strikethrough span, and MUST survive a render→serialize round-trip unchanged.

#### Scenario: Paths with tildes

- **WHEN** a note contains `"~/.claude/settings.json": false` and `"~/.github/hooks": true`
- **THEN** Visual mode shows both paths as literal text
- **AND** no `<del>` spans the two lines
- **AND** Source mode still shows the original single tildes

#### Scenario: Real strikethrough

- **WHEN** a note contains `~~done~~`
- **THEN** Visual mode renders a `<del>done</del>`
- **AND** Source mode shows `~~done~~`

#### Scenario: Single-tilde pairs

- **WHEN** a note contains `~not struck~`
- **THEN** Visual mode shows the literal text `~not struck~`
- **AND** no `<del>` is produced

### Requirement: Clean mode and draft switching

Opening a note or switching between Visual and Source SHALL NOT rewrite canonical markdown. The Visual surface SHALL be serialised immediately after real edits and cleared from the "needs serialisation" state. Applying a shared draft snapshot SHALL render from canonical markdown and clear that state, because the surface is already in sync. `editorDirty` MUST represent only un-serialised DOM edits; unsaved-change detection SHALL compare the canonical note against its head separately.

#### Scenario: Clean switch

- **WHEN** a user opens a note and toggles Visual/Source without editing
- **THEN** the source text is byte-identical to the stored markdown
- **AND** no save prompt appears

#### Scenario: Switch a note with a shared draft

- **WHEN** a note has a shared draft and the user opens it, then switches to Source without editing
- **THEN** Source shows the draft markdown exactly
- **AND** single tildes are not rewritten as `~~`
- **AND** no content is duplicated

#### Scenario: Real edit then switch

- **WHEN** the user edits in Visual and switches to Source
- **THEN** the source contains the serialised edit
- **AND** paths retain single tildes
- **AND** the body is not duplicated
