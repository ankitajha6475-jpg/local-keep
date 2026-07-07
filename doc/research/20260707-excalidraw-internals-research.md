# Excalidraw 内部实现研究：笔/触屏/橡皮擦/全屏机制

> 研究日期: 2026-07-07
> 研究对象: `@excalidraw/excalidraw@0.18.1`（dist/dev/index.js, chunk-4FTI6OG3.js）
> 研究动机: 搞清楚 WhiteboardEditor.vue 里我们写的自定义代码 vs Excalidraw 框架内置代码的边界，避免重复造轮子和漏掉框架能力。

## 1. 研究方法

1. 用 `mcp_codebase-memo` 工具把本项目索引到知识图谱
2. 用 `grep` 在 WhiteboardEditor.vue 找到所有跟 stylus/touch/pointer 相关的代码
3. 进入 `node_modules/@excalidraw/excalidraw/dist/dev/` 用 `grep` 反查框架源码
4. 阅读关键函数：`handleCanvasPointerDown`、`handleCanvasPointerMove`、`POINTER_BUTTON` 常量、`gesture` 对象、`penMode` 切换

## 2. 高层结论

我们项目自带的 80 行自定义代码 vs Excalidraw 框架能力对照表：

| 功能 | Excalidraw 内置 | 我们的代码 | 关系 |
|------|----------------|-----------|------|
| 笔侧键→橡皮擦切换 | ✅ PointerEvent.button=5 | ✅ keyup(key="Unidentified") | **互补**（兜底 Safari 怪癖） |
| 两指缩放/平移 | ✅ gesture.pointers Map | ✅ touchstart/end 数手指 | ⚠️ **重叠**（可能可删我们的） |
| 区分手指 vs 笔 | ✅ pointerType="pen"→penMode | ✅ touchType==="stylus" | ⚠️ **重叠**（两套事件流） |
| 压感/tilt/twist | ✅ 内部完整处理 | ❌ 未使用 | 框架独占 |
| Debug 事件面板 | ❌ | ✅ 自建 | 我们独占 |
| 全屏切换 | ❌ | ✅ Fullscreen API | 我们独占 |
| 拦截图片粘贴 | ❌ | ✅ | 我们独占 |

## 3. Excalidraw 内部机制详解

### 3.1 `POINTER_BUTTON` 常量表

**位置**: `chunk-4FTI6OG3.js:154`

```js
var POINTER_BUTTON = {
  MAIN: 0,
  WHEEL: 1,
  SECONDARY: 2,
  TOUCH: -1,
  ERASER: 5     // ← 关键：数位笔侧键映射到 button=5
};
```

**含义**:
- `0` = 主键（鼠标左键、笔尖、单指触摸）
- `1` = 中键（鼠标滚轮）
- `2` = 右键（上下文菜单）
- `-1` = 触屏（伪造的 PointerEvent）
- **`5` = 橡皮擦键（数位笔的侧键按下时浏览器会发出）**

### 3.2 `handleCanvasPointerDown` —— 核心入口

**位置**: `index.js:27380`

这是 Excalidraw 接收所有 canvas pointer 事件的总入口。关键分支：

```js
// (1) 触屏 + 未完成的 freedraw 笔触 → 取消笔触（防止触屏乱画）
if (event.pointerType === "touch" && this.state.newElement
    && this.state.newElement.type === "freedraw") {
    // ... 抛弃该 freedraw 元素，清理状态
    return;
}

// (2) 首次检测到笔 → 进入 penMode
if (!this.state.penDetected && event.pointerType === "pen") {
    this.setState({ penMode: true, penDetected: true });
}

// (3) 自动把屏识别为 touch 设备
if (!this.device.isTouchScreen && ["pen", "touch"].includes(event.pointerType)) {
    this.device = updateObject(this.device, { isTouchScreen: true });
}

// (4) 数位笔侧键 → 临时切到橡皮擦
if (event.button === POINTER_BUTTON.ERASER
    && this.state.activeTool.type !== TOOL_TYPE.eraser) {
    this.setState({ activeTool: updateActiveTool(this.state, {
        type: TOOL_TYPE.eraser,
        lastActiveToolBeforeEraser: this.state.activeTool
    })}, () => {
        this.handleCanvasPointerDown(event);  // 用新工具重新分发
        addEventListener(window, "pointerup", () => {
            // pointerup 时切回原工具
        }, { once: true });
    });
    return;
}

// (5) pen 模式下屏蔽手指
const allowOnPointerDown =
    !this.state.penMode
    || event.pointerType !== "touch"
    || this.state.activeTool.type === "selection"
    || this.state.activeTool.type === "text"
    || this.state.activeTool.type === "image";
if (!allowOnPointerDown) return;
```

### 3.3 `gesture.pointers` —— 多指手势追踪

**位置**: `index.js:24701`

```js
var gesture = {
    pointers: new Map(),  // pointerId → { x, y }
    lastCenter: null,
    initialDistance: null,
    initialScale: null
};
```

每当 pointerdown/pointermove 进来，Excalidraw 更新这个 Map（`updateGestureOnPointerDown`, index.js:31005）。

**两指 pinch-to-zoom 实现** (`index.js:26961`)：

```js
if (gesture.pointers.size === 2 && gesture.lastCenter
    && initialScale && gesture.initialDistance) {
    const center = getCenter(gesture.pointers);       // 两指中点
    const deltaX = center.x - gesture.lastCenter.x;   // 平移量
    const deltaY = center.y - gesture.lastCenter.y;
    const distance2 = getDistance(...);                // 两指距离
    const scaleFactor = distance2 / gesture.initialDistance;
    const nextZoom = getNormalizedZoom(initialScale * scaleFactor);
    // → 同步更新 zoom + scrollX/scrollY
}
```

**关键**: Excalidraw 自己就原生支持两指 pinch-to-zoom 和两指平移，无须额外代码。我们的 WhiteboardEditor.vue 第 223-255 行注册的 `touchstart/end` 监听是**冗余的**（早期版本可能 Excalidraw 不支持才加的）。

### 3.4 `penMode` / `penDetected`

- `penDetected`: 一旦检测到 `pointerType === "pen"` 就设为 `true`（一次性开关，整个 session 持续）
- `penMode`: 是否启用"笔优先 + 手指只能 selection/text/image" 模式
- Excalidraw 工具栏自带交互（`index.js:12436`）：
  ```js
  onPointerDown: ({ pointerType }) => {
      if (!appState.penDetected && pointerType === "pen") {
          app.togglePenMode(true);
      }
  }
  ```
- 我们的代码**没有使用** `penMode`，而是自己用 `touch.touchType === "stylus"` 判断，绕过了 Excalidraw 的内置状态。

### 3.5 浏览器侧键事件流（跨平台）

| 浏览器          | 笔侧键事件表现                                       |
|----------------|------------------------------------------------------|
| Chrome (Win/Linux) | 标准 PointerEvent，`button === 5`，`pointerType === "pen"` |
| Firefox        | 同上                                                  |
| Safari (macOS) | 同上                                                  |
| **Safari (iPadOS)** | ⚠️ **不**发 PointerEvent button=5，而是发匿名的 `keyup`，`key="Unidentified"` 且 `keyCode=0`（关键：没有对应 keydown） |
| 工具栏侧键 (rec) | PointerEvent 中可能是 `button === 2` (right) → contextmenu |

这就是为什么我们的 WhiteboardEditor.vue 需要 `handleStylusKeyUp` 的浏览器兼容 hack（第 209-222 行）—— Excalidraw 完全没处理 Safari iPadOS 这个怪异行为。

### 3.6 压感、tilt、twist（框架内置，我们未利用）

Excalidraw 内部对 PointerEvent 这些字段都接住并用于渲染，但我们项目的 debug 面板只是把它们打出来。如果未来要做"压感影响笔触粗细"的功能，可以直接读 `excalidrawAPI.getAppState()` 和 scene elements 的特定字段，无需额外采集。

## 4. 我们的代码详解

### 4.1 `handleStylusKeyUp` — Safari iPadOS 笔侧键兜底

**位置**: `src/components/WhiteboardEditor.vue:209-222`

```js
function handleStylusKeyUp(e) {
  if (e.key === 'Unidentified' && e.keyCode === 0) {
    e.preventDefault()
    if (!excalidrawAPI) return
    const tool = excalidrawAPI.getAppState().activeTool.type
    if (tool === 'eraser') excalidrawAPI.setActiveTool({ type: 'freedraw' })
    else excalidrawAPI.setActiveTool({ type: 'eraser' })
  }
}
```

**为什么需要**:
1. Safari/iPadOS 用 Apple Pencil 侧键时浏览器**不发** PointerEvent.button=5
2. 而是发一个伪 keyup，没有对应 keydown
3. Excalidraw 完全不知道这件事 → 需要我们自己桥接 → 调用 `excalidrawAPI.setActiveTool({type:'eraser'})`

**致命陷阱**（已记录在 AGENTS.md gotcha #6）:
- 这个 keyup 在笔尖点击画布时**也会被触发**！
- 必须确保只在"侧键"事件触发时切换工具
- 实践中 iPad + Apple Pencil 表现稳定，其他设备未测

### 4.2 `handleTouchStart`/`handleTouchEnd` — 两指切换 hand 工具

**位置**: `src/components/WhiteboardEditor.vue:225-255`

```js
function isFingerTouch(touch) {
  if (touch.touchType === 'stylus') return false   // 排除笔
  return true
}

function handleTouchStart(e) {
  for (const touch of e.changedTouches) {
    if (isFingerTouch(touch)) touchFingerCount++
  }
  if (touchFingerCount >= 2 && excalidrawAPI && fingerToolRestore === null) {
    const tool = excalidrawAPI.getAppState().activeTool.type
    if (DRAWING_TOOLS.has(tool)) {
      fingerToolRestore = tool
      excalidrawAPI.setActiveTool({ type: 'hand' })  // 切到 hand 工具
    }
  }
}
```

**疑问**: 这部分逻辑与 Excalidraw 内置的 `gesture.pointers` 两指 pinch 重叠了。当前 v0.18 Excalidraw 已自带两指平移/缩放，我们这段代码是否还需要值得测试。

**潜在删除路径**:
1. 把第 223-255 行的 touch 监听注释掉
2. 在 iPad/触屏笔记本上测试：
   - 单指绘画
   - 两指平移
   - 两指缩放
3. 如果 Excalidraw 原生手势已经 OK → 删除我们的代码
4. 如果还有问题 → 保留

### 4.3 `handleFullscreenChange` + `toggleFullscreen` — 全屏

**位置**: `src/components/WhiteboardEditor.vue:335-350`

```js
function toggleFullscreen() {
  if (!document.fullscreenEnabled) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    editorRoot.value?.requestFullscreen()
  }
}
```

注意 `editorRoot` 指向最外层 `<div class="whiteboard-editor">`，所以全屏会变成整个 WhiteboardEditor 占满屏幕（包括 header）。CSS 必须让该 div 占满 100vw × 100vh（见 WhiteboardEditor.vue 末尾样式）。

### 4.4 Debug 面板（我们的独有功能）

**位置**: `src/components/WhiteboardEditor.vue:35-78` (template), `257-296` (handler)

- `handleDebugPointer(e)`: 捕获 pointer 事件 28+ 字段并展示
- `handleDebugKey(e)`: 捕获 key 事件
- `handleDebugMouse(e)`: 捕获 mouse 事件
- `handleDebugContextMenu(e)`: 捕获 contextmenu 事件
- 全部以 **capture phase** (`addEventListener(..., true)`) 在 document 层级注册 → 即使 Excalidraw 在 canvas 上 `preventDefault` 或 `stopPropagation` 我们也能看到

**用法**:
- 笔未识别、橡皮擦不切换、笔尖乱触发侧键 → 打开 Debug 面板（🖊 按钮）查看实际事件流
- 按事件签名做 filter 过滤（⊘ 按钮）
- Copy 按钮导出文本日志用于 bug 报告

## 5. 设计观察 / 可改进项

1. **冗余的 touch 处理**: 我们的 `handleTouchStart/End` 与 Excalidraw 内置的两指 pinch 重叠，建议测试后删除。
2. **未使用 penMode**: 我们用各自的 `touchType` 判断，没用 Excalidraw 内置的 penMode/penDetected 状态。如果改用 Excalidraw 内置状态，可能更稳定且能复用其内在衰减逻辑（手指事件被屏蔽）。
3. **侧键 hack 只覆盖 Safari**: 其他浏览器如果将来出现怪 event，也需要类似处理；Debug 面板能帮我们发现。
4. **未利用压感**: 可考虑把 PointerEvent 的 `pressure` 字段直接传给 Excalidraw 的 freedraw 行为。
5. **侧键修复未持久化**: `handleStylusKeyUp` 切到 eraser，但松开之后切回笔是通过状态推算（看当前 tool 是不是 eraser），而不是直接监听笔尖下笔事件。这可能在快速来回切换时出错。

## 6. 关键文件 / 行号速查

| 主题 | 文件 | 行号 |
|------|------|------|
| POINTER_BUTTON 常量 | `@excalidraw/.../dist/dev/chunk-4FTI6OG3.js` | 154-160 |
| handleCanvasPointerDown | `@excalidraw/.../dist/dev/index.js` | 27380-27560 |
| 两指 pinch 实现 | `@excalidraw/.../dist/dev/index.js` | 26961-26990 |
| gesture.pointers 定义 | `@excalidraw/.../dist/dev/index.js` | 24701 |
| penMode toggle UI | `@excalidraw/.../dist/dev/index.js` | 12436 |
| ERASER button → eraser 工具逻辑 | `@excalidraw/.../dist/dev/index.js` | 27455-27498 |
| 我们: stylus keyup hack | `src/components/WhiteboardEditor.vue` | 209-222 |
| 我们: 两指手写识别 | `src/components/WhiteboardEditor.vue` | 225-255 |
| 我们: debug 面板 | `src/components/WhiteboardEditor.vue` | 35-78, 257-370 |
| 我们: 全屏 | `src/components/WhiteboardEditor.vue` | 335-350, 425 |
