# Session Log: Workspace search, dashboard, editor, MCP, and shortcut refinements

- **Date**: 2026-10-22 16:02
- **Commit**: `d69ce010c008e493ab8de801dc00ac1f8170024d` — feat(workspace): land dashboard, editor, MCP, search, and shortcut refinements

## Changed Files

| File | Change |
|------|--------|
| `AGENTS.md` | Updated project guidance and changelog |
| `CHANGELOG.md` | Updated project guidance and changelog |
| `config.json` | Added default interface configuration |
| `docs/embeddings.md` | Updated user documentation |
| `docs/mcp.md` | Updated user documentation |
| `openspec/changes/archive/2026-10-22-add-link-dialog-autocomplete/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-link-dialog-autocomplete/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-link-dialog-autocomplete/specs/markdown-editor/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-link-dialog-autocomplete/specs/note-relationships/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-link-dialog-autocomplete/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-markdown-toolbar-tools/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-markdown-toolbar-tools/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-markdown-toolbar-tools/specs/markdown-editor/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-markdown-toolbar-tools/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-selection-link-summary/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-selection-link-summary/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-selection-link-summary/specs/note-relationships/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-selection-link-summary/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-ui-config-settings/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-ui-config-settings/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-ui-config-settings/specs/interface-config/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-add-ui-config-settings/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-dashboard-tabs-and-drafts/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-dashboard-tabs-and-drafts/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-dashboard-tabs-and-drafts/specs/dashboard-drafts/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-dashboard-tabs-and-drafts/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-hybrid-search-ranking/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-hybrid-search-ranking/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-hybrid-search-ranking/specs/semantic-search/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-hybrid-search-ranking/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-keyboard-shortcut-coverage/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-keyboard-shortcut-coverage/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-keyboard-shortcut-coverage/specs/keyboard-shortcuts/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-keyboard-shortcut-coverage/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-literal-tildes-mode-stability/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-literal-tildes-mode-stability/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-literal-tildes-mode-stability/specs/markdown-editor/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-literal-tildes-mode-stability/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-mcp-tag-and-purge-tools/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-mcp-tag-and-purge-tools/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-mcp-tag-and-purge-tools/specs/mcp-server/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-mcp-tag-and-purge-tools/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-note-color-tints/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-note-color-tints/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-note-color-tints/specs/note-colors/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-note-color-tints/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-plain-text-paste/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-plain-text-paste/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-plain-text-paste/specs/markdown-editor/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-plain-text-paste/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-sticky-dashboard-chrome/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-sticky-dashboard-chrome/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-sticky-dashboard-chrome/specs/dashboard-chrome/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-sticky-dashboard-chrome/tasks.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-virtualized-note-dashboard/design.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-virtualized-note-dashboard/proposal.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-virtualized-note-dashboard/specs/note-dashboard/spec.md` | Archived OpenSpec change artifact |
| `openspec/changes/archive/2026-10-22-virtualized-note-dashboard/tasks.md` | Archived OpenSpec change artifact |
| `openspec/specs/dashboard-chrome/spec.md` | Synced main specification |
| `openspec/specs/dashboard-drafts/spec.md` | Synced main specification |
| `openspec/specs/interface-config/spec.md` | Synced main specification |
| `openspec/specs/keyboard-shortcuts/spec.md` | Synced main specification |
| `openspec/specs/markdown-editor/spec.md` | Synced main specification |
| `openspec/specs/mcp-server/spec.md` | Synced main specification |
| `openspec/specs/note-colors/spec.md` | Synced main specification |
| `openspec/specs/note-dashboard/spec.md` | Synced main specification |
| `openspec/specs/note-relationships/spec.md` | Synced main specification |
| `openspec/specs/semantic-search/spec.md` | Synced main specification |
| `package.json` | Added dependency and lockfile update |
| `package-lock.json` | Added dependency and lockfile update |
| `README.md` | Updated user documentation |
| `server.js` | Updated Express routes and services wiring |
| `src/App.vue` | Updated application source |
| `src/components/AppIcon.vue` | Updated application source |
| `src/components/BacklinksPanel.vue` | Updated application source |
| `src/components/DashboardNoteCard.vue` | Updated application source |
| `src/components/GraphView.vue` | Updated application source |
| `src/components/LinkDialog.vue` | Updated application source |
| `src/components/MarkdownToolbar.vue` | Updated application source |
| `src/components/SelectionLinksPanel.vue` | Updated application source |
| `src/components/TagSidebar.vue` | Updated application source |
| `src/main.js` | Updated application source |
| `src/mcp/createServer.js` | Updated application source |
| `src/server/config.js` | Updated application source |
| `src/server/migrations/012-app-settings.js` | Updated application source |
| `src/server/migrations/013-note-color.js` | Updated application source |
| `src/server/services/embeddings.js` | Updated application source |
| `src/server/services/links.js` | Updated application source |
| `src/server/services/mcpEditing.js` | Updated application source |
| `src/server/services/notes.js` | Updated application source |
| `src/server/services/search.js` | Updated application source |
| `src/server/services/textCollab.js` | Updated application source |
| `src/server/services/uiSettings.js` | Updated application source |
| `src/shared/editorTools.js` | Updated application source |
| `src/shared/linkMarkdown.js` | Updated application source |
| `src/shared/noteColors.js` | Updated application source |
| `src/shared/shortcuts.js` | Updated application source |
| `src/shared/tags.js` | Updated application source |
| `src/shared/uiConfig.js` | Updated application source |
| `src/utils/dashboardVirtual.js` | Updated application source |
| `src/utils/editorSerialize.js` | Updated application source |
| `src/utils/markdown.js` | Updated application source |
| `tests/configApi.test.js` | Added or updated test coverage |
| `tests/dashboardVirtual.test.js` | Added or updated test coverage |
| `tests/editorSerialize.test.js` | Added or updated test coverage |
| `tests/editorTools.test.js` | Added or updated test coverage |
| `tests/embeddings.test.js` | Added or updated test coverage |
| `tests/helpers/testDb.js` | Added or updated test coverage |
| `tests/linkMarkdown.test.js` | Added or updated test coverage |
| `tests/markdown.test.js` | Added or updated test coverage |
| `tests/mcpAdministration.test.js` | Added or updated test coverage |
| `tests/mcpEditing.test.js` | Added or updated test coverage |
| `tests/mcp.test.js` | Added or updated test coverage |
| `tests/migrationAuth.test.js` | Added or updated test coverage |
| `tests/migration.test.js` | Added or updated test coverage |
| `tests/notesApi.test.js` | Added or updated test coverage |
| `tests/parsers.test.js` | Added or updated test coverage |
| `tests/relationshipsApi.test.js` | Added or updated test coverage |
| `tests/relationships.test.js` | Added or updated test coverage |
| `tests/search.test.js` | Added or updated test coverage |
| `tests/shortcuts.test.js` | Added or updated test coverage |
| `tests/textCollabApi.test.js` | Added or updated test coverage |
| `tests/textCollab.test.js` | Added or updated test coverage |
| `tests/uiConfig.test.js` | Added or updated test coverage |
| `tests/whiteboardRevisions.test.js` | Added or updated test coverage |

## Details

This batch lands the completed OpenSpec work accumulated across the session:

- **Dashboard**: index-first virtualized dashboard with responsive rows, bounded card hydration, Notes/Archived/Drafts tabs, sticky header/action bar, note colors, Quick Shortcuts, and tag-side filters.
- **Search**: dashboard hybrid search with RRF ordering, availability via `/api/config.search`, Qwen3-Embedding query instruction, and viewport reset when results render.
- **Editor**: markdown toolbar with shortcuts, plain/rich paste preference, literal single-tilde handling, stable Visual/Source/draft mode switching, link dialog improvements, and image insertion relocation.
- **MCP/server**: MCP tag and purge tools, compact mutation responses, MCP session settings, interface settings, live text collaboration refinements, and note color migrations.
- **Shortcuts**: central `src/shared/shortcuts.js` map, topmost-overlay dispatcher, Ctrl/Cmd and Alt/Option hint reveal, complete unique-action coverage, and tag-sidebar leaf icons.
- **Specs**: all completed OpenSpec changes were validated, synced to `openspec/specs/`, and archived under `openspec/changes/archive/2026-10-22-*`; placeholder Purpose sections for new capabilities were replaced.
- **Verification**: `npm test` 116/116, production build, `openspec validate --specs` 22/22, and no active OpenSpec changes remain.
