## 1. Dependencies and renderer

- [x] 1.1 Add `marked`, `dompurify`, `turndown`, `turndown-plugin-gfm`; verify install/build
- [x] 1.2 Add `src/utils/markdown.js` with sanitised `renderMarkdown`, `htmlToMarkdown`, width handling, and wiki-link hook; verify unit tests
- [x] 1.3 Add renderer tests for common markdown, tables/task lists, width images, and XSS payloads; verify `npm test`

## 2. Editor modes

- [x] 2.1 Add Write/Markdown/Preview state and toolbar toggle; verify build
- [x] 2.2 Add Markdown textarea mode with cursor insertion for images and pasted markdown; verify build
- [x] 2.3 Add read-only Preview mode using the shared renderer; verify build
- [x] 2.4 Switch Write→Markdown/Preview by serialising first and back by re-rendering; verify round-trip test/manual

## 3. Paste normalisation

- [x] 3.1 Install/configure Turndown in `htmlToMarkdown` with GFM and removal of rich markup; verify tests
- [x] 3.2 Write-mode paste: HTML→markdown→sanitised HTML, plain-text fallback, image upload; verify build
- [x] 3.3 Markdown-mode paste: HTML→markdown at cursor, image upload at cursor; verify build
- [x] 3.4 Global paste: clean HTML/plain text before creating a note; verify build

## 4. Serializer fidelity

- [x] 4.1 Extend serializer for headings, paragraphs, ordered/unordered lists, blockquotes, code, HR, links, and wiki-link spans; verify round-trip tests
- [x] 4.2 Preserve image `data-md`/width and broken-image conversion; verify build/manual
- [x] 4.3 Normalise markdown blank lines/whitespace after serialisation; verify tests

## 5. Gallery and image refs

- [x] 5.1 Replace `renderContent` with the sanitised renderer; verify existing notes render
- [x] 5.2 Add internal-link click hook so future wiki links can open notes without card-click conflicts; verify build
- [x] 5.3 Normalise `data:image` sources to `/api/images/<hash>.<ext>` before save; verify with a data-URL note
- [x] 5.4 Confirm gallery/preview images support `/api/images/...` and `{width=N}`; verify build/manual

## 6. Verification and docs

- [x] 6.1 Run `npm test` and `npm run build`; verify pass
- [x] 6.2 Update `CHANGELOG.md`, `AGENTS.md`, and the architecture plan status
- [ ] 6.3 Manually paste styled HTML, a table, an image, and plain text in all three modes; verify no rich context or data loss
- [ ] 6.4 Check existing notes (headings/code/images) in gallery and preview; verify no regressions
