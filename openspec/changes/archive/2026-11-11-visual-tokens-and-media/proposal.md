## Why

Three visual defects from the `modern-web-guidance` audit remain after the
accessibility baseline:

1. **Scrollbars are nearly invisible.** `.note-preview` uses
   `scrollbar-color: #dadce0 transparent`, which is 1.37:1 on the white
   container, below the 3:1 non-text minimum. The whiteboard pen inspector is
   worse: 1.61:1 on its dark panel, and it declares no standard scrollbar
   properties at all.
2. **The WebKit fallback conflicts with the standard properties.** The
   `::-webkit-scrollbar` rules sit next to `scrollbar-color` in the same
   stylesheet, so browsers that support both apply both.
3. **Images declare no loading behaviour.** Card thumbnails, whiteboard page
   tiles, and rendered note images have no `loading` and no `decoding`. Their
   alternative text is a generic `"Canvas thumbnail"` rather than a
   description.

The interface also declares no `color-scheme`, so browser-drawn surfaces pick
their own appearance instead of matching the app.

## What Changes

- Scrollable containers SHALL use the standard `scrollbar-width` and
  `scrollbar-color` properties with the thumb and track expressed as separate
  custom properties.
- The scrollbar thumb SHALL meet 3:1 against the track and against the
  container's background where the track is transparent.
- The `::-webkit-scrollbar` fallback SHALL move into
  `@supports not (scrollbar-color: auto)`.
- The interface SHALL declare `color-scheme: light`.
- Images SHALL declare their loading behaviour, their decoding, and their
  intrinsic aspect ratio, and SHALL carry descriptive alternative text.

## Capabilities

### New Capabilities

- `visual-tokens`: the shared scrollbar tokens, the declared colour scheme,
  and the image loading contract.

### Modified Capabilities

- `text-note-images`: rendered note images declare their loading behaviour.
- `whiteboard-pages`: page tiles load lazily and reserve their space.

## Impact

- **Affected code**: `src/styles/base.css`, `src/App.vue`,
  `src/components/DashboardNoteCard.vue`, `src/components/WhiteboardEditor.vue`,
  `src/utils/markdown.js`.
- **Behaviour**: no data, schema, or API changes. The scrollbar thumb becomes
  slightly darker; images stop shifting the layout as they load.
- **Risk**: low. The only visible change is the scrollbar colour and the
  thumbnail's fixed aspect ratio.
