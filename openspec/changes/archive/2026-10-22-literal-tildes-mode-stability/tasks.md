## 1. Literal tildes

- [x] 1.1 Add a marked inline extension that consumes single tildes as text
- [x] 1.2 Verify `~~text~~` still renders as `<del>`
- [x] 1.3 Add renderer and render→serialize regression tests for paths and single tildes

## 2. Mode and draft stability

- [x] 2.1 Make `syncVisualEditor` serialise immediately and clear `editorDirty`
- [x] 2.2 Stop `applySharedText` from marking the rendered surface dirty
- [x] 2.3 Keep clean Visual/Source switches from re-serialising
- [x] 2.4 Verify a note with tildes and a shared draft switches without source changes

## 3. Verification and docs

- [x] 3.1 Run targeted markdown/editor tests
- [x] 3.2 Run the full test suite
- [x] 3.3 Update `CHANGELOG.md` and `AGENTS.md`
- [x] 3.4 Run `openspec validate --strict`
- [x] 3.5 Verify the Visual/Source switch in a browser with tildes and `~~`
- [ ] 3.6 Archive after review
