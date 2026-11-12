## 1. Scrollbar tokens and contrast

- [x] 1.1 Add `--scrollbar-thumb`, `--scrollbar-track`, and the dark thumb token to `src/styles/base.css`
- [x] 1.2 Apply `scrollbar-width` / `scrollbar-color` to `.note-preview` and `.markdown-preview`
- [x] 1.3 Apply `scrollbar-width` / `scrollbar-color` to the whiteboard's `.debug-log`
- [x] 1.4 Move the `::-webkit-scrollbar` rules into `@supports not (scrollbar-color: auto)`
- [x] 1.5 Drop the now-empty `::-webkit-scrollbar-track` rules

## 2. Colour scheme

- [x] 2.1 Declare `color-scheme: light` on `:root`

## 3. Images

- [x] 3.1 Add `loading="lazy"` and `decoding="async"` to the dashboard card thumbnail
- [x] 3.2 Give the card thumbnail descriptive `alt` text
- [x] 3.3 Verify the thumbnail's reserved space — the card height is fixed at 380px, so no `aspect-ratio` is needed and adding one would be dead CSS
- [x] 3.4 Add `loading="lazy"` and `decoding="async"` to the whiteboard page tile
- [x] 3.5 Add `loading="lazy"` and `decoding="async"` to rendered note images

## 4. Verification and docs

- [x] 4.1 Add source-level tests for the scrollbar and image contracts
- [x] 4.2 Run the full test suite
- [x] 4.3 Run the frontend build and check the built CSS
- [x] 4.4 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 4.5 Run `openspec validate --strict`
