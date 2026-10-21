## Context

Notes have two free-form fields: `title` (optional) and `content` (markdown-style, may include inline images and base64 data URLs during editing). Today `addNote`/`saveEdit` block when `content` is empty, which prevents title-only notes; and the gallery renders `note.title` directly, so notes without a title show nothing above their content preview.

The user wants the gallery display title to be (in order): the explicit title when present, else a snippet derived from the leading content, else a fallback. The actual title field stays optional in storage.

## Goals / Non-Goals

**Goals:**
- Allow saving a note with only a title, only content, or both.
- Provide a deterministic, content-aware display title used by every list/card/header.
- Keep the derived title readable (no markdown noise, no base64 blobs, single line, reasonable length).

**Non-Goals:**
- Auto-generating and *storing* titles (no DB writes).
- Using `getDisplayTitle` for sorting by default (may follow-up; for now sort continues on `note.title || ''` but display uses `getDisplayTitle`).
- OCR / extracting text from whiteboard canvas content for whiteboard-less titles (covered elsewhere — out of scope).
- Changing server schema, FTS, or persisted payload.

## Decisions

### Decision 1: Pure view-layer helper
`getDisplayTitle(note): string` returns:
1. `note.title?.trim()` if non-empty
2. else `cleanContent(note.content).slice(0, 50)` if non-empty
3. else `'Untitled'`

Rationale: storing the derived title couples it to content updates and creates sync risks; deriving at render time is cheap (small data) and always correct.

### Decision 2: `cleanContent` rules
- Strip markdown image syntax `![alt](url)` → `alt` (or empty if no alt)
- Replace base64 `data:image/...` strings with empty (these appear transiently during edit but can persist if not extracted)
- Collapse whitespace runs to single space
- Strip leading/trailing whitespace
Rationale: the gallery already previews content; we want the same cleaning applied to the first 50 chars so titles read like text, not `data:image/png;base64,iVBOR…`.

### Decision 3: Length and truncation
- Slice first 50 characters of the cleaned content, append `…` only if the source was longer (not when exactly 50).
- Single line (newlines collapsed to spaces already).

### Decision 4: Allow empty save in client
Remove `if (!newNoteContent.value.trim()) return` from `addNote` and `saveEdit`. Replace with: save proceeds; if both title and content are empty, server still stores it (it'll display "Untitled" via the helper). Decision: don't special-case reject — the user might create an empty placeholder. If we want to prevent fully-empty notes, guard against `(title + content).trim()` empty returning without saving, but that's a minor UX choice — opted to allow everything for simplicity, since creating an untitled empty placeholder is still a valid user action.

### Decision 5: Editing modal
The title input stays separate. The implicit-title derivation only affects the *display* (gallery, header). When editing, the title field shows whatever was stored (possibly empty) — user can fill it in explicitly.

## Risks / Trade-offs

- **[Risk] Derived title duplicates visible content preview** — the gallery shows both derived title and a content snippet. Mitigation: when the title IS derived from content, the content preview should ideally start *after* the derived title's characters, or just accept minor redundancy (low impact, only affects title-less notes). Opting to accept minor redundancy for simplicity; revisit if it looks bad.
- **[Risk] Performance of cleaning at render** — data volume is small (single-user local app). Negligible.
- **[Risk] Inconsistent: stored empty title, derived shows "Untitled"** — fine; that's the desired behavior.

## Migration Plan

No data migration. Pure frontend change. Deploy → existing notes without titles now display a leading-content snippet instead of blank.

## Open Questions

none.
