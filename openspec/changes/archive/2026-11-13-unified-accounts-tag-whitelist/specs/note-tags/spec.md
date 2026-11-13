# Note Tags Spec Delta

## Purpose

Filters notes and tag structures according to caller tag whitelist rules, supporting glob hierarchies and the `:untagged` pseudo-tag.

## ADDED Requirements

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
