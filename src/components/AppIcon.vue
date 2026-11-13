<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-for="(shape, index) in shapes" :key="index">
      <rect
        v-if="shape.width !== undefined"
        :x="shape.x"
        :y="shape.y"
        :width="shape.width"
        :height="shape.height"
        :rx="shape.rx"
        :ry="shape.ry"
      />
      <circle
        v-else-if="shape.r !== undefined"
        :cx="shape.cx"
        :cy="shape.cy"
        :r="shape.r"
      />
      <path v-else :d="shape.d" />
    </template>
  </svg>
</template>

<script>
// Minimal inline icon set (Lucide-style strokes) so the dashboard chrome
// does not depend on emoji fonts or an external icon package.
const ICONS = {
  note: [
    { d: 'M14.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5Z' },
    { d: 'M14 3v6h6' },
    { d: 'M8 13h8' },
    { d: 'M8 17h5' }
  ],
  refresh: [
    { d: 'M21 12a9 9 0 1 1-2.64-6.36' },
    { d: 'M21 3v6h-6' }
  ],
  tag: [
    { d: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42Z' },
    { cx: 7.5, cy: 7.5, r: 0.8 }
  ],
  palette: [
    { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' }
  ],
  graph: [
    { cx: 18, cy: 5, r: 3 },
    { cx: 6, cy: 12, r: 3 },
    { cx: 18, cy: 19, r: 3 },
    { d: 'm8.59 13.51 6.83 3.98' },
    { d: 'm15.41 6.51-6.82 3.98' }
  ],
  search: [
    { cx: 11, cy: 11, r: 7 },
    { d: 'm20 20-3.8-3.8' }
  ],
  broom: [
    { d: 'M13.5 10.5 22 2' },
    { d: 'M14.734 13.841a2 2 0 0 0-.314-2.42L12.58 9.58a2 2 0 0 0-2.421-.314l-7.657 4.461A1 1 0 0 0 2.3 15.3l6.403 6.403a1 1 0 0 0 1.571-.204z' },
    { d: 'm5 18 2-2' },
    { d: 'm7.699 10.7 5.602 5.601' }
  ],
  sparkles: [
    { d: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z' }
  ],
  zap: [
    { d: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z' }
  ],
  check: [
    { d: 'M20 6 9 17l-5-5' }
  ],
  'chevron-down': [
    { d: 'm6 9 6 6 6-6' }
  ],
  plus: [
    { d: 'M12 5v14' },
    { d: 'M5 12h14' }
  ],
  whiteboard: [
    { d: 'M2 3h20' },
    { d: 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3' },
    { d: 'm7 21 5-5 5 5' }
  ],
  x: [
    { d: 'M18 6 6 18' },
    { d: 'm6 6 12 12' }
  ],
  settings: [
    { cx: 12, cy: 12, r: 3 },
    { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
  ],
  users: [
    { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { cx: 9, cy: 7, r: 4 },
    { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { d: 'M16 3.13a4 4 0 0 1 0 7.75' }
  ],
  sliders: [
    { d: 'M4 21v-7' },
    { d: 'M4 10V3' },
    { d: 'M12 21v-9' },
    { d: 'M12 8V3' },
    { d: 'M20 21v-5' },
    { d: 'M20 12V3' },
    { d: 'M1 14h6' },
    { d: 'M9 8h6' },
    { d: 'M17 16h6' }
  ],
  plug: [
    { d: 'M12 22v-5' },
    { d: 'M9 8V2' },
    { d: 'M15 8V2' },
    { d: 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z' }
  ],
  lock: [
    { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 },
    { d: 'M7 11V7a5 5 0 0 1 10 0v4' }
  ],
  message: [
    { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }
  ],
  kanban: [
    { x: 3, y: 3, width: 5, height: 18, rx: 1, ry: 1 },
    { x: 10, y: 3, width: 5, height: 12, rx: 1, ry: 1 },
    { x: 17, y: 3, width: 5, height: 15, rx: 1, ry: 1 }
  ],
  send: [
    { d: 'm22 2-7 20-4-9-9-4Z' },
    { d: 'M22 2 11 13' }
  ]
}

export default {
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 20 },
    strokeWidth: { type: [Number, String], default: 1.9 }
  },
  computed: {
    shapes() {
      return ICONS[this.name] || ICONS.note
    }
  }
}
</script>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
