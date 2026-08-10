## 1. View-layer helpers

- [x] 1.1 Add a `cleanContent(content: string): string` helper (pure function, e.g. in `src/utils/notes.js` or inline in App.vue): strip `![alt](...)` → `alt` (regex), strip `data:` URL embeds, collapse whitespace, trim
- [x] 1.2 Add `getDisplayTitle(note): string` helper that returns `note.title?.trim()` if non-empty, else `cleanContent(note.content).slice(0, 50)` (+`…` only if longer than 50), else `"Untitled"`
- [x] 1.3 Add small unit-style sanity checks (e.g., a tiny test file or console-runnable sample inputs covering: explicit title, image-with-alt, data URL, longer-than-50, empty)

## 2. Client: allow saving with empty content

- [x] 2.1 In `addNote` (~App.vue:927): remove the `if (!newNoteContent.value.trim()) return` early-return guard
- [x] 2.2 In `saveEdit` (~App.vue:1019): remove the corresponding content-required guard so editing-to-empty is permitted
- [x] 2.3 Verify the server's `POST /api/notes` and `PUT /api/notes/:id` already accept empty title/content (no change needed; confirm via manual test)

## 3. Client: wire display title into surfaces

- [x] 3.1 In the gallery card template (~App.vue:206), replace `{{ note.title }}` rendering with `{{ getDisplayTitle(note) }}` (keep the canvas-type "Untitled Whiteboard" branch as-is — it already uses an explicit fallback; reuse `getDisplayTitle` if simpler)
- [x] 3.2 Apply `getDisplayTitle(note)` to the editor header (where the open note's title is shown)
- [x] 3.3 Audit other UI surfaces that render `note.title` directly (e.g., context menus, selection lists) and switch to `getDisplayTitle(note)`
- [x] 3.4 Ensure sort comparators that reference `note.title` either keep sorting by stored title (current behavior) or sort by `getDisplayTitle` — match existing UX; document if changed

## 4. Manual verification

- [ ] 4.1 Create a title-only note — it saves and shows the title
- [ ] 4.2 Create a content-only note — gallery shows first ~50 chars cleaned as the title
- [ ] 4.3 Create a note with content starting with `![cat](...)` — gallery shows `cat …` style cleaned title
- [ ] 4.4 Create a note with > 50 chars cleaned content — gallery shows ellipsis; ≤50 chars shows no ellipsis
- [ ] 4.5 Open a title-less note for editing — title field stays empty (derivation is display-only)
- [ ] 4.6 Update `CHANGELOG.md` under `[Unreleased]` → `Changed`: "Notes can be saved with title only; display title now derives from content when title is empty"
