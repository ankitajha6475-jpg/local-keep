## 1. Sticky chrome

- [x] 1.1 Keep the dashboard header pinned at the top of the viewport
- [x] 1.2 Pin `.control-bar` and `.selection-bar` beneath the header with `position: sticky`

## 2. Responsive offset

- [x] 2.1 Measure header height with `ResizeObserver` and set `--app-header-height`
- [x] 2.2 Add CSS fallback heights for first paint and the mobile breakpoint
- [x] 2.3 Disconnect the observer on unmount

## 3. Shortcut hints

- [x] 3.1 Reuse the global Alt/Option reveal state for the dashboard chrome
- [x] 3.2 Add action labels and shortcut attributes to header, search, and create controls
- [x] 3.3 Reveal shortcut tooltips immediately while Alt/Option is held, keeping labels for other actions
- [x] 3.4 Document the Alt behavior in the Quick Shortcuts card
- [x] 3.5 Fall back to pointer `altKey` when a modifier keydown is missed

## 4. Modern header visuals

- [x] 4.1 Add the inline `AppIcon` SVG component
- [x] 4.2 Replace header, search, account-menu, and create-menu emoji with icons
- [x] 4.3 Refresh the brand mark, sync pill, icon buttons, account pill, and create button
- [x] 4.4 Add responsive rules for account name, sync pill, brand, and icon sizes

## 5. Verification and docs

- [x] 5.1 Run `npm run build`
- [x] 5.2 Add the `CHANGELOG.md` entry
- [x] 5.3 Run `openspec validate --strict`
- [ ] 5.4 Verify scrolling, Alt hints, and icon rendering at desktop and mobile widths
- [ ] 5.5 Archive the change once the layout is confirmed
