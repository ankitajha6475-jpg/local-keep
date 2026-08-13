export const DRAWING_TOOLS = new Set(['freedraw', 'text', 'eraser', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line'])

export function isFingerTouch(touch) {
  if (!touch) return false
  return touch.touchType !== 'stylus'
}

export function shouldUseHandTool(activeToolType, touch) {
  if (!DRAWING_TOOLS.has(activeToolType)) return false
  return isFingerTouch(touch)
}
