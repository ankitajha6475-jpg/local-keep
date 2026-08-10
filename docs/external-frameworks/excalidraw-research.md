# Excalidraw Integration Research Notes

> Source: [github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
> Docs: [docs.excalidraw.com](https://docs.excalidraw.com)
> Latest stable: `v0.18.1` (Apr 2026)
> License: MIT | Stars: 126k+

## Overview

Open-source virtual whiteboard with hand-drawn style. Available as:
- **npm package** (`@excalidraw/excalidraw`) — embeddable React component
- **Standalone PWA** at [excalidraw.com](https://excalidraw.com) — real-time collab, E2E encryption

**Key fact: Excalidraw is a React component.** Our project is Vue 3, so we'll need a React-in-Vue wrapper (see Strategy section below).

---

## Quick Setup

```bash
npm install react react-dom @excalidraw/excalidraw
```

**Critical:** Also install `react` and `react-dom` — they are peer dependencies.

Import CSS:
```js
import "@excalidraw/excalidraw/index.css";
```

Data format: `.excalidraw` JSON file. Export to PNG, SVG, clipboard.

---

## Basic Usage (React)

```tsx
import { Excalidraw } from "@excalidraw/excalidraw";

function App() {
  return (
    <div style={{ height: "500px" }}>
      <Excalidraw />
    </div>
  );
}
```

**Dimensions:** Takes 100% width/height of its container. Container must have non-zero dimensions.

---

## Vue 3 Integration Strategy

Since Excalidraw is a React component, we have 3 options:

### Option A: `veaury` (Recommended)
React in Vue bridge library — most seamless.
```bash
npm install veaury
```
```vue
<template>
  <div style="height: 500px">
    <ExcalidrawVue :initialData="sceneData" @change="onChange" />
  </div>
</template>
```

### Option B: Manual mount/unmount in a Vue component
Use `react-dom/client` `createRoot` manually in `onMounted`/`onUnmounted`.

### Option C: `@vue/react` or `vuereact-combined`
Less common, more fragile.

---

## Core Props

All props are **optional**.

| Prop | Type | Description |
|------|------|-------------|
| `initialData` | `object \| null \| Promise` | Elements, appState, libraryItems, files to load initially |
| `excalidrawAPI` | `(api: ExcalidrawAPI) => void` | Callback to get imperative API ref |
| `onChange` | `(elements, appState, files) => void` | Fires on every change — **use this to persist drawing data** |
| `theme` | `"light" \| "dark"` | Default `"light"` |
| `viewModeEnabled` | `boolean` | Read-only mode |
| `zenModeEnabled` | `boolean` | Minimal UI |
| `gridModeEnabled` | `boolean` | Show grid |
| `langCode` | `string` | Default `"en"` |
| `name` | `string` | Drawing name (used in export filename) |
| `UIOptions` | `object` | Customize which tools/actions are visible |
| `autoFocus` | `boolean` | Auto-focus on mount |
| `isCollaborating` | `boolean` | Collaboration mode indicator |
| `detectScroll` | `boolean` | Auto-detect scroll offsets (default `true`) |

### `onChange` — Critical for persistence

```tsx
onChange={(elements, appState, files) => {
  // Save elements + appState to your backend/localStorage
  const serialized = serializeAsJSON(elements, appState);
  localStorage.setItem("drawing", serialized);
}}
```

### `UIOptions` — Customize toolbar

```tsx
UIOptions={{
  canvasActions: {
    export: { saveFileToDisk: true },
    loadScene: true,
    changeViewBackgroundColor: false, // hide some actions
  }
}}
```

---

## imperative API (`excalidrawAPI`)

Obtained via the `excalidrawAPI` prop:

```tsx
const [api, setApi] = useState(null);
<Excalidraw excalidrawAPI={setApi} />
```

| Method | Description |
|--------|-------------|
| `updateScene({ elements, appState })` | Replace scene data |
| `getSceneElements()` | Get non-deleted elements |
| `getSceneElementsIncludingDeleted()` | All elements |
| `getAppState()` | Current app state |
| `getFiles()` | Binary files on canvas |
| `addFiles(files)` | Add binary files |
| `resetScene()` | Clear everything |
| `scrollToContent(target?, opts?)` | Scroll to elements |
| `refresh()` | Recalculate offsets |
| `history.clear()` | Clear undo/redo |
| `setActiveTool({ type, locked? })` | Programmatic tool switch |
| `setToast({ message, closable?, duration? })` | Show toast notification |
| `toggleSidebar({ name, tab? })` | Open/close sidebar |
| `updateLibrary({ libraryItems })` | Update shape library |
| `id` | Unique component ID |

---

## Data Persistence: Save & Load

### Serialize (save drawing)

```ts
import { serializeAsJSON } from "@excalidraw/excalidraw";

// From onChange or manually:
const json = serializeAsJSON({
  elements: api.getSceneElements(),
  appState: api.getAppState(),
});
// → JSON string ready for storage
```

### Deserialize (load drawing)

```ts
import { loadFromBlob, loadSceneOrLibraryFromBlob } from "@excalidraw/excalidraw";

// From a file/blob:
const scene = await loadFromBlob(fileBlob, null, null);
api.updateScene(scene);

// Or pass as initialData prop:
<Excalidraw initialData={{
  elements: [...],
  appState: { ... },
  scrollToContent: true,
}} />
```

### Key data types

- `ExcalidrawElement[]` — array of shapes, text, lines, images
- `AppState` — zoom, scroll, active tool, theme, etc.
- `BinaryFiles` — images/files embedded in drawing

---

## Export Utilities

```ts
import { exportToCanvas, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
```

- `exportToCanvas(elements, appState, opts)` → HTMLCanvasElement
- `exportToBlob(elements, appState, opts)` → Promise<Blob>
- `exportToSvg(elements, appState, opts)` → Promise<SVGSVGElement>

---

## Programmatic Element Creation

The simplified Skeleton API:

```ts
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

const elements = convertToExcalidrawElements([
  { type: "rectangle", x: 100, y: 250, width: 200, height: 100,
    backgroundColor: "#ffc9c9", strokeWidth: 2 },
  { type: "text", x: 100, y: 100, text: "Hello!" },
  { type: "arrow", x: 100, y: 300, 
    start: { type: "rectangle" }, end: { type: "ellipse" } },
  { type: "frame", children: ["id1", "id2"], name: "My Frame" },
]);
```

Supported element types: `rectangle`, `ellipse`, `diamond`, `arrow`, `line`, `text`, `freedraw`, `image`, `frame`

---

## Styling

Override CSS variables on `.excalidraw` class:

```css
.my-app .excalidraw {
  --color-primary: #667eea;
  --color-primary-darker: #5568d3;
  --color-primary-darkest: #4a4fc0;
  --color-primary-light: #8b9cf7;
}
.my-app .excalidraw.theme--dark {
  --color-primary: #8b9cf7;
}
```

Full variable list: [`theme.scss`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/css/theme.scss)

---

## Other Utilities

```ts
import {
  getNonDeletedElements,
  isLinearElement,
  getCommonBounds,
  elementsOverlappingBBox,
  getSceneVersion,
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
  mergeLibraryItems,
  useHandleLibrary,
  useEditorInterface,
  useI18n,
  defaultLang,
  languages,
} from "@excalidraw/excalidraw";
```

---

## Integration Notes for local-keep

### What we need
1. A **whiteboard note type** alongside text notes
2. Each whiteboard stores its elements as `.excalidraw` JSON in the backend
3. Whiteboard maps to a Vue component embedding Excalidraw

### Architecture Plan

```
src/
  components/
    WhiteboardEditor.vue   ← Vue wrapper around Excalidraw (React)
    WhiteboardCard.vue      ← Card to display whiteboard in grid
  App.vue                   ← Add whiteboard note type
```

### Backend considerations
- Store `excalidrawData` (JSON) alongside note content
- Whiteboard JSON can be large; consider compression or file storage
- WebSocket already exists — could add real-time collab later via `isCollaborating` + `onChange`

### Steps to implement
1. `npm install react react-dom @excalidraw/excalidraw veaury`
2. Create `src/components/WhiteboardEditor.vue` — Vue component wrapping `<Excalidraw />`
3. Add whiteboard note creation in `App.vue` (new note type selector or separate button)
4. Backend: store whiteboard JSON data in note model
5. Persist changes via `onChange` → API call
6. Load via `initialData` prop

### Potential issues
- **React in Vue:** `veaury` is simplest; manual `createRoot`/`unmount` in `onMounted`/`onUnmounted` is alternative
- **SSR:** Excalidraw is client-only (no SSR); our app is already client-side (Vite SPA), so no issue
- **Fonts:** Self-hosting needed for offline. Set `window.EXCALIDRAW_ASSET_PATH = "/"` and copy `node_modules/@excalidraw/excalidraw/dist/prod/fonts` to `public/`
- **Build size:** ~2MB gzipped; acceptable for a desktop-style app
- **Multiple instances:** Use unique `id` per instance; keyboard handling should be scoped (`handleKeyboardGlobally=false`)
