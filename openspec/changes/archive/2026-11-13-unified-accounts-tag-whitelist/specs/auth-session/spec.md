# Auth Session Spec Delta

## Purpose

Unifies API tokens under user accounts and introduces per-user tag whitelist rules evaluated using `.gitignore` pattern syntax.

## ADDED Requirements

### Requirement: Multi-user accounts and tag whitelist

The system SHALL manage user accounts in SQLite and authenticate sessions against active user accounts. Each user record SHALL include an optional `tag_whitelist` field containing `.gitignore`-style pattern rules.

#### Scenario: User account stores tag whitelist

- **WHEN** an admin updates a user with `tag_whitelist: "work/*\n!:untagged"`
- **THEN** the user's `tag_whitelist` is persisted in the `users` table
- **AND** returned in admin user management endpoints

### Requirement: API tokens are strictly owned by a user account

The `api_tokens` table SHALL include a `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE` foreign key.

#### Scenario: Authenticate with bearer token resolves owning user

- **WHEN** a client sends a valid `Authorization: Bearer <token>`
- **THEN** `authenticate()` resolves the token AND the owning `user` record
- **AND** the caller's effective tag whitelist is the owning user's `tag_whitelist`

#### Scenario: Deleting a user cascades to their API tokens

- **WHEN** an admin deletes a user
- **THEN** all API tokens belonging to that `user_id` are automatically deleted

### Requirement: Legacy token migration

Migration 016 SHALL assign existing tokens created by `user:admin` to the `admin` user, and legacy unassigned tokens to the member user `alex`.

#### Scenario: Migration backfills existing tokens

- **WHEN** migration 016 runs
- **THEN** `api_tokens` rows without `user_id` are populated with the target user's `id`
- **AND** no tokens remain with `user_id IS NULL`
