# Tasks: Sidebar scroll and reveal modifiers

## 1. Tag sidebar (src/components/TagSidebar.vue)

- [x] 1.1 Add `overflow-x: hidden` to `.tag-sidebar` so a horizontal scrollbar can never appear; verify `.tag-name` ellipsis keeps rows single-line

## 2. Shortcut reveal (src/App.vue)

- [x] 2.1 `onShortcutRevealDown`: reveal only for bare Alt (`e.key === 'Alt'` with no Ctrl/Cmd held) and `preventDefault` it so Chrome does not focus its menu bar
- [x] 2.2 `onShortcutRevealUp`: hide hints when Alt is released (and preventDefault bare Alt keyup); keep hints while Ctrl/Cmd+Alt combos are in progress
- [x] 2.3 `onShortcutRevealPointer`: require `e.altKey` only (drop Ctrl/Cmd reveal)
- [x] 2.4 Quick Shortcuts card copy: reveal instruction becomes Alt/Option-only

## 3. Validation

- [x] 3.1 `openspec validate sidebar-scroll-and-reveal-modifiers --strict` passes
- [x] 3.2 `npm test` passes
- [x] 3.3 Browser check: no horizontal scrollbar in the tag sidebar; holding Alt reveals hints and Chrome keeps focus; `Ctrl+Alt+V` still switches editor mode; releasing Alt hides hints
- [x] 3.4 Record the change in `CHANGELOG.md` under `[Unreleased]`
