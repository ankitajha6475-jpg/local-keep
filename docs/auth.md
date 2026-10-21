# Accounts and Authentication

Local Keep uses a shared workspace with multiple human accounts. Everyone can
read and edit the same notes; admins additionally manage people and passwords.
Notes are not per-user private (there is no per-note ACL in this version).

## First run

Open the app and create the first account. It is always an **admin**:

- Username (3–32 characters: letters, numbers, `.`, `_`, `-`)
- Display name
- Password (minimum 8 characters)

The first account is created with a hashed scrypt password. A signed,
`HttpOnly`, `SameSite=Strict` session cookie keeps you signed in for 30 days.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything a member can, plus add/disable people, change roles, reset passwords |
| **Member** | Use the shared notes, whiteboards, tags, links, graph, and MCP access |

The last active admin cannot be demoted or disabled.

## Sign in / sign out

- Sign in with username + password.
- The header avatar menu has **Account settings**, **Manage users** (admin), and
  **Lock workspace**.
- **Sign out all** revokes every browser session for your account and closes live WebSockets.
- Changing your password revokes other sessions automatically.
- A temporary/reset password sets `must_change_password`: normal REST/MCP access is
  blocked until the new password is set, and the UI opens the change-password dialog.

## Password reset

Local Keep has no email delivery. There are two supported reset paths:

### Admin resets a user

Header avatar → **Manage users** → **Reset password**. The server returns a
temporary password once; the user must choose a new password after signing in.

### CLI reset (including the admin)

On the host:

```bash
npm run auth:reset -- alice
```

The command prints a one-time temporary password and revokes the user's sessions.
Sign in with it and set a new password.

If no admin password is available, this is the recovery path. It requires shell
access to the machine/container data.

## Existing single-password installs

Migration 4 creates an admin account from the existing password:

- username: `admin`
- display name: `Administrator`
- role: `admin`
- password: your existing password

The legacy hash is verified on first login and upgraded to scrypt automatically.
Existing signed-in sessions are mapped to the admin account.

## Security notes

- Passwords are stored with scrypt; the old 32-bit hash is only accepted once for
  migration and then replaced.
- Session IDs are opaque and signed; the database is authoritative for
  revocation, so CLI resets invalidate live sessions immediately.
- MCP bearer tokens are separate from human sessions. Token names become revision
  actors `mcp:<name>`; human revisions use `user:<username>`.
- There is no self-service email reset, no OAuth, and no per-note permissions.
  Those are deliberate scope choices for a local/self-hosted app.
