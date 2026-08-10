# 数位板 Web 应用实战指南：基于 local-keep 项目的经验

> 目的: 帮助另一个项目实现以下四个需求
> 来源: 对 `local-keep` 项目（Vue 3 + Excalidraw 0.18）的实战研究
> 经验总结日期: 2026-07-07

## 0. 背景速览

local-keep 项目用 Excalidraw + Vue 3 + Docker，已经实现了：
- 数位笔/触屏完整支持（笔、手指、橡皮擦）
- 全屏切换（含 header）
- 容器化部署（Vite dev + Express prod 双模式）

下面的章节按你列的四个需求逐条展开。最后附一份"复制即可用"的最小骨架（Dockerfile + main.js + 全屏 + 笔按钮代码片段）。

---

## 需求 1: 橡皮擦实现 ✅

### 1.1 推荐方案: 直接使用 Excalidraw 内置 eraser 工具

Excalidraw 自带 `eraser` 工具（划过去删除元素），工具栏切换即可：

```js
// 切到橡皮擦
excalidrawAPI.setActiveTool({ type: 'eraser' })

// 切回画笔
excalidrawAPI.setActiveTool({ type: 'freedraw' })
```

### 1.2 Excalidraw 内部已经做了什么

**关键发现**: Excalidraw 已经**内置识别数位笔侧键** (PointerEvent `button === 5`)，按下时自动切橡皮擦，松开切回。常量定义在 `@excalidraw/.../dist/dev/chunk-4FTI6OG3.js:154`：

```js
var POINTER_BUTTON = {
  MAIN: 0,
  WHEEL: 1,
  SECONDARY: 2,
  TOUCH: -1,
  ERASER: 5       // ← 数位笔翻转成橡皮擦时浏览器发的 button
};
```

在 `handleCanvasPointerDown` (Excalidraw `index.js:27455-27498`) 里完整实现：

```js
if (event.button === POINTER_BUTTON.ERASER
    && this.state.activeTool.type !== TOOL_TYPE.eraser) {
    this.setState({
        activeTool: {
            type: 'eraser',
            lastActiveToolBeforeEraser: this.state.activeTool  // 记住原工具
        }
    }, () => {
        this.handleCanvasPointerDown(event);  // 重新分发
        addEventListener(window, 'pointerup', () => {
            // pointerup 时切回 lastActiveToolBeforeEraser
        }, { once: true });
    });
}
```

### 1.3 工具栏手动切换（推荐兜底）

无论笔有没有侧键，工具栏都应该有橡皮擦按钮方便用户强制切换：

```js
UIOptions: {
  // 不要禁用 eraser，保持默认
}
```

不需要任何自定义代码。

---

## 需求 2: Web App 全屏实现 ✅

### 2.1 核心代码（Fullscreen API）

local-keep 的实现 (`src/components/WhiteboardEditor.vue:335-350`):

```js
const isFullscreen = ref(false)
const editorRoot = ref(null)   // 指向最外层 div

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    editorRoot.value?.requestFullscreen()
  }
}

// 组件挂载时：
document.addEventListener('fullscreenchange', handleFullscreenChange)
// 组件卸载时：
document.removeEventListener('fullscreenchange', handleFullscreenChange)
```

### 2.2 CSS（关键 100vw × 100vh）

```css
.whiteboard-editor:fullscreen {
  width: 100vw;
  height: 100vh;
}
/* Safari 旧版（仅 iOS） */
.whiteboard-editor:-webkit-full-screen {
  width: 100vw;
  height: 100vh;
}
```

### 2.3 关键陷阱

1. **`requestFullscreen()` 必须在用户手势内调用** (`click`、`keydown` 等)。不能在 setTimeout 或 promise 链里调。
2. **`editorRoot` 必须是已挂载的真实 DOM 节点**。如果给 `<div ref="editorRoot">` 加 `v-if="..."` 切换，要确保调用时 div 已渲染。Vue 中用 `onMounted` 后访问。
3. **Esc 退出全屏是浏览器原生**，不用自己监听。但 `fullscreenchange` 事件用来同步你的 UI 状态（按钮 icon）。
4. **iOS Safari 完全不支持** Fullscreen API（iPad iOS 不行）。如果是 iPad-only 应用，需要 fallback 到 CSS `position: fixed; inset: 0; z-index: 9999` 的"伪全屏"。
5. **HTTPS 必需**：除了 `localhost`，所有环境都要 HTTPS 才能用 Fullscreen API。容器部署见需求 4。

### 2.4 用户体验建议

```html
<button @click="toggleFullscreen" :title="isFullscreen ? '退出全屏 (Esc)' : '全屏'">
  {{ isFullscreen ? '↙' : '↗' }}
</button>
```

- 鼠标移开几秒后隐藏 header（用 CSS transition）
- 全屏中按 Esc 退出（浏览器原生）

---

## 需求 3: 监测数位笔按钮，切换笔/橡皮擦 ✅

这是 4 个需求里**最容易踩坑**的。下面分浏览器逐一说明。

### 3.1 进展树

```
监测笔按钮
  ├─ Chrome / Firefox / Safari macOS / Edge → 标准 PointerEvent.button === 5
  │       ↓
  │   Excalidraw 内置处理完毕（需求 1.2），什么都不用做
  │
  ├─ Safari iPadOS (Apple Pencil) → ⚠️ 不发 button=5，发 keyup
  │       ↓
  │   必须手写 hack（见 3.2）
  │
  └─ Wacom / Huion 数位板（蓝牙驱动） → 行为因驱动而异
          ↓
      debug 面板观察实际事件（见 3.4），按需补 hack
```

### 3.2 Safari iPadOS Hack（copy 即用）

local-keep 的实现 (`src/components/WhiteboardEditor.vue:209-222`):

```js
let lastToolBeforeEraser = null   // TODO: 记住用户当前工具

function handleStylusKeyUp(e) {
  // Apple Pencil 侧键：Safari 发一个 keydown 缺失，keyup 触发,
  // key === 'Unidentified' && keyCode === 0
  if (e.key === 'Unidentified' && e.keyCode === 0) {
    e.preventDefault()
    if (!excalidrawAPI) return
    const tool = excalidrawAPI.getAppState().activeTool.type
    if (tool === 'eraser') {
      excalidrawAPI.setActiveTool({ type: 'freedraw' })
    } else {
      lastToolBeforeEraser = tool   // 记下原工具
      excalidrawAPI.setActiveTool({ type: 'eraser' })
    }
  }
}

// 挂载时
window.addEventListener('keyup', handleStylusKeyUp)
// 卸载时
window.removeEventListener('keyup', handleStylusKeyUp)
```

**为什么是 `keyup` 而不是 `keydown`**: 因为 Safari 在这个怪事件上**没有 keydown**（已记录在 AGENTS.md `Gotchas #6`）。

### 3.3 标准桌面浏览器的"double tap 侧键"问题

某些数位笔（如 Wacom Pro Pen 2）的侧键是**双击切换**模式而不是按住切换。如果你需要这种 UI 行为，最简方案是用工具栏：

```html
<button v-if="!eraserLocked" @click="lockEraser">🔒 橡皮擦</button>
<button v-else @click="unlockEraser">🔓 画笔</button>
```

并配合内部状态：

```js
const eraserLocked = ref(false)
function lockEraser() { eraserLocked.value = true; excalidrawAPI.setActiveTool({type:'eraser'}) }
```

### 3.4 Debug 面板（强烈推荐！）

local-keep 自建了一个 Debug 面板，专门捕获所有 pointer/key/mouse/contextmenu 事件，在遇到"笔按钮没反应"时** invaluable**。

关键技巧:
- 必须 **capture phase** (`addEventListener(..., true)`)，否则 Excalidraw 的 canvas handler 可能 `stopPropagation`
- 捕获要在 `document` 层级，不是 canvas 内部（canvas 内事件被 Excalidraw 吞了你也看不到）
- 显示 `pointerType`、`button`、`buttons`、`pressure`、`tiltX`、`tiltY`、`twist`、`pointerId` 等所有 PointerEvent 字段

极简版：

```js
function handleDebugPointer(e) {
  console.log(
    e.type,
    'pointerType=', e.pointerType,
    'button=', e.button,
    'buttons=', e.buttons,
    'pressure=', e.pressure,
    'tilt=', e.tiltX, e.tiltY,
    'twist=', e.twist
  )
}
document.addEventListener('pointerdown', handleDebugPointer, true)
document.addEventListener('pointerup', handleDebugPointer, true)
document.addEventListener('keydown', handleDebugKey, true)  // 捕获伪 keyup
document.addEventListener('keyup', handleDebugKey, true)
```

完整版（带 UI）参考 local-keep 的 `WhiteboardEditor.vue` 第 35-78（template）+ 257-370 (handler)。

### 3.5 跨平台笔按钮事件总表（local-keep 项目实测）

| 设备 + 浏览器 | 侧键按下时发什么 | 是否需要自定义 |
|--------------|------------------|---------------|
| Wacom + Chrome (Win) | PointerEvent, button=5 | ❌ Excalidraw 内置 |
| Wacom + Firefox | PointerEvent, button=5 | ❌ |
| Apple Pencil + Safari (iPadOS) | keyup, key="Unidentified", keyCode=0 | ✅ 必须 hack |
| Apple Pencil + Chrome iOS | (未测) 可能根本不发 | ✅ 需要 debug |
| Surface Pen + Edge | PointerEvent, button=5 | ❌ |
| Bluetooth 数位笔（按驱动） | 取决于驱动 | 🤷 需要 debug |

---

## 需求 4: 在容器中 serve ✅

### 4.1 local-keep 的双模式架构

```
Docker "local-keep" (node:22-alpine)
├── DEVELOPMENT: 由 docker-compose 启动
│   ├── node --watch server.js     → Express API + WS on :5173
│   └── npx vite --host 0.0.0.0    → Vite dev server on :5174
│       (Vite proxy /api → :5173, /ws → ws::5173)
│
└── PRODUCTION: 预先 build 好的 dist/ 由 Express 直接 serve
    └── node server.js             → 静态 + API + WS 全在 :5173
```

### 4.2 docker-compose.yml（开发模式）

local-keep 的 `docker-compose.yml`:

```yaml
services:
  app:
    image: node:22-alpine
    container_name: local-keep
    working_dir: /app
    command: >
      sh -c "npm install && npx concurrently \"node --watch server.js\" \"npx vite --host 0.0.0.0\""
    environment:
      - DEBUG=local-keep:*
      - NODE_ENV=development
    ports:
      - "5173:5173"
      - "5174:5174"
    volumes:
      - .:/app                    # 源码挂载（HMR）
      - /app/node_modules         # 匿名 volume 隔离 host 的 node_modules
    restart: unless-stopped
```

**关键点**:
1. `node:22-alpine` 镜像已经包含 Vite、Express 全部原生依赖，无需系统包
2. **`- /app/node_modules`** 这条匿名 volume 是关键 trick —— 让容器用容器内装的 `node_modules`，不被宿主机的覆盖（尤其跨平台时 node_modules 里的原生模块可能不兼容）
3. `npx vite --host 0.0.0.0` 必须显式 `--host 0.0.0.0` 否则只监听 127.0.0.1，外部访问不到
4. `concurrently` 同时跑两进程，避免双开 terminal
5. `node --watch` 自动重启 server.js（节省手动 docker restart 的成本）

### 4.3 Production 模式: 单端口 + Express serve dist

`package.json`:
```json
{
  "scripts": {
    "start": "npm run build && DEBUG=local-keep:* node server.js",
    "build": "vite build",
    "dev": "DEBUG=local-keep:* concurrently \"node server.js\" \"vite\""
  }
}
```

`server.js` (静态服务部分，约 `server.js:611-625`):
```js
// Serve static files from dist in production, or use Vite dev in development
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
} else {
  console.log('⚠️  dist/ not found. Run "npm run build" first.')
}

server.listen(PORT, '0.0.0.0', () => { ... })
```

### 4.4 Vite proxy 配置（开发模式）

`vite.config.js`:
```js
export default defineConfig({
  plugins: [vue(), react({ jsxImportSource: 'react' })],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:5173', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:5173', ws: true }
    }
  }
})
```

**关键**:
- 开发时浏览器连 `:5174`（Vite），由 Vite 反向代理 `/api/*` 和 `/ws` 到 `:5173`（Express）
- 生产时只有 `:5173`，Express 既给 API 又给静态文件
- `changeOrigin: true` 保证 cookie/host header 正确

### 4.5 容器部署对照表

| 项目维度 | Dev 模式 | Prod 模式 |
|---------|---------|-----------|
| 端口 | 5173 (API+WS) + 5174 (Vite) | 5173 (全部) |
| HMR | ✅ Vite 自动 | ❌ |
| server.js 自动重启 | ✅ `node --watch` | ❌ 重启需重新部署 |
| 浏览器 URL | `:5174` | `:5173` |
| 需要 build dist | ❌ | ✅ `npm run build` |
| 启动命令 | `docker compose up` | `docker run <img> npm start` |

### 4.6 部署常见陷阱

1. **HTTPS 才能用 Fullscreen API 和某些 PointerEvent 行为**。容器内用 Caddy/Nginx 加 TLS，或者反代。
2. **WebSocket 升级**: 反代（如 Nginx）要加 `Upgrade` / `Connection` header，或者直接 TCP 透传。
3. **`/app/node_modules` 匿名 volume** 要保留 —— 删了再 `docker compose up` 会触发重装。
4. **`--host 0.0.0.0`** 是用 Docker 网络访问 Vite/Express 的前提。
5. **Alpine 镜像缺 glibc** —— 某些原生模块（如 better-sqlite3）要 recompile，用 `node:22-slim` 替代。

---

## 5. 最小可用骨架（Copy-Paste 起步代码）

### 5.1 package.json 关键依赖

```json
{
  "dependencies": {
    "@excalidraw/excalidraw": "^0.18.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "vue": "^3.4.0",
    "@vitejs/plugin-react": "^4.7.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "express": "^4.22.2",
    "concurrently": "^8.2.2",
    "vite": "^5.0.0"
  }
}
```

**注意**: `@vitejs/plugin-react` 必须 v4，不是 v6+！v6 要求 Vite 6，会跟 Vue plugin 不兼容（已在 AGENTS.md `Gotchas #3` 验证）。

### 5.2 Vue 组件骨架（含全屏 + 笔按钮 + Excalidraw）

```vue
<template>
  <div ref="editorRoot" class="whiteboard">
    <header>
      <button @click="goBack">← Back</button>
      <button @click="debugOpen = !debugOpen">🖊</button>
      <button @click="toggleFullscreen">{{ isFullscreen ? '↙' : '↗' }}</button>
    </header>
    <div ref="canvasContainer" class="canvas"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

const editorRoot = ref(null)
const canvasContainer = ref(null)
const isFullscreen = ref(false)
const debugOpen = ref(false)

let excalidrawAPI = null
let reactRoot = null

// ── 全屏 ──
function handleFullscreenChange() { isFullscreen.value = !!document.fullscreenElement }
function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) document.exitFullscreen()
  else editorRoot.value?.requestFullscreen()
}

// ── Safari iPadOS 笔侧键 hack ──
function handleStylusKeyUp(e) {
  if (e.key === 'Unidentified' && e.keyCode === 0) {
    e.preventDefault()
    if (!excalidrawAPI) return
    const tool = excalidrawAPI.getAppState().activeTool.type
    excalidrawAPI.setActiveTool(
      { type: tool === 'eraser' ? 'freedraw' : 'eraser' }
    )
  }
}

// ── Debug 面板 ──
function handleDebugPointer(e) {
  if (!debugOpen.value) return
  console.log(`[${e.type}] pointerType=${e.pointerType} button=${e.button} pressure=${e.pressure}`)
}

onMounted(() => {
  reactRoot = createRoot(canvasContainer.value)
  reactRoot.render(
    React.createElement(Excalidraw, {
      excalidrawAPI: (api) => { excalidrawAPI = api },
      UIOptions: { tools: { image: false } }
    })
  )

  window.addEventListener('keyup', handleStylusKeyUp)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('pointerdown', handleDebugPointer, true)
  document.addEventListener('pointerup', handleDebugPointer, true)
})

onUnmounted(() => {
  reactRoot?.unmount()
  window.removeEventListener('keyup', handleStylusKeyUp)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('pointerdown', handleDebugPointer, true)
  document.removeEventListener('pointerup', handleDebugPointer, true)
})
</script>

<style>
.whiteboard { display: flex; flex-direction: column; height: 100vh; }
.canvas { flex: 1; }
.whiteboard:fullscreen { width: 100vw; height: 100vh; }
</style>
```

### 5.3 docker-compose.yml（dev 模式起步）

```yaml
services:
  app:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && npx concurrently \"node --watch server.js\" \"npx vite --host 0.0.0.0\""
    environment:
      - NODE_ENV=development
    ports:
      - "5173:5173"
      - "5174:5174"
    volumes:
      - .:/app
      - /app/node_modules
    restart: unless-stopped
```

### 5.4 Production Dockerfile

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package.json ./package.json
EXPOSE 5173
CMD ["node", "server.js"]
```

---

## 6. 优先级建议（按工作量排序）

| 需求 | 工作量 | 推荐顺序 |
|------|-------|---------|
| 需求 4 (容器) | 半天 | **第 1** —— 没部署没法测其他 |
| 需求 1 (橡皮擦) | 1 小时 | **第 2** —— Excalidraw 已经内置，几乎不用写代码 |
| 需求 2 (全屏) | 2 小时 | **第 3** —— copy 上面的代码 + CSS |
| 需求 3 (笔按钮) | 1-3 天 | **第 4** —— 跨平台兼容最费时，必须真机测试 |

---

## 7. 引言 & 进一步阅读

- 本项目研究文档: `doc/research/20260707-excalidraw-internals-research.md`
- Excalidraw 官方文档: https://docs.excalidraw.com
- W3C Pointer Events 规范: https://w3c.github.io/pointerevents/
- Fullscreen API MDN: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
- local-keep 项目 AGENTS.md（项目 conventions & gotchas）: `AGENTS.md`

---

## 附录 A: 跨浏览器笔按钮事件速查（实战版本）

```
按下笔侧键 →

  Chrome/Edge (Win) [Wacom, Surface Pen]
  Firefox (Win/Linux) [Wacom, Huion]
  Safari (macOS) [Wacom]
    └─ PointerEvent
       ├─ button: 5 (ERASER)
       ├─ pointerType: "pen"
       └─ Excalidraw 自动切 eraser

  Safari (iPadOS) [Apple Pencil]
    └─ keyboard keyup
       ├─ key: "Unidentified"
       ├─ code: ""
       ├─ keyCode: 0
       └─ ⚠️ 无对应 keydown
       ⚠️ 必须自己 hack → excalidrawAPI.setActiveTool({type:'eraser'})

  Chrome (iOS) [Apple Pencil]
    └─ 行为未确定 → 打开 debug 面板观察
```

## 附录 B: Quick Reference 行号表

所有"copy-paste"代码的具体出处：

| 功能 | 文件 | 行号 |
|------|------|------|
| 全屏切换 | `src/components/WhiteboardEditor.vue` | 335-350 |
| 全屏监听注册 | `src/components/WhiteboardEditor.vue` | 425 |
| Safari 笔侧键 hack | `src/components/WhiteboardEditor.vue` | 209-222 |
| Debug 面板 template | `src/components/WhiteboardEditor.vue` | 35-78 |
| Debug pointer handler | `src/components/WhiteboardEditor.vue` | 257-288 |
| Docker compose (dev) | `docker-compose.yml` | 全文 |
| Vite config | `vite.config.js` | 全文 |
| Production static serve | `server.js` | 611-625 |
