<template>
  <div class="graph-canvas" ref="root">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="xMidYMid meet"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <g :transform="`translate(${pan.x} ${pan.y}) scale(${zoom})`">
        <line
          v-for="(edge, i) in layoutEdges"
          :key="'e' + i"
          :x1="edge.source.x"
          :y1="edge.source.y"
          :x2="edge.target.x"
          :y2="edge.target.y"
          class="graph-edge"
          :class="{ unresolved: edge.status !== 'ok' }"
        />
        <g
          v-for="node in layoutNodes"
          :key="node.id"
          class="graph-node"
          :class="{ center: node.id === center, unresolved: node.unresolved }"
          :transform="`translate(${node.x} ${node.y})`"
          @click.stop="$emit('open', node)"
        >
          <circle :r="radius(node)" :class="'node-' + (node.type || 'text')" />
          <text :y="radius(node) + 13" text-anchor="middle" class="graph-label">
            {{ shortLabel(node) }}
          </text>
        </g>
      </g>
    </svg>
    <div class="graph-legend">
      <span><i class="dot text"></i> text</span>
      <span><i class="dot canvas"></i> whiteboard</span>
      <span><i class="dot unresolved"></i> unresolved</span>
    </div>
  </div>
</template>

<script>
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export default {
  name: 'GraphCanvas',
  props: {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    center: { type: String, default: null }
  },
  emits: ['open'],
  setup(props) {
    const width = 1000
    const height = 680
    const root = ref(null)
    const layoutNodes = ref([])
    const layoutEdges = ref([])
    const zoom = ref(1)
    const pan = ref({ x: 0, y: 0 })
    let simulation = null
    let drag = null

    function shortLabel(node) {
      const value = node.displayTitle || node.title || 'Untitled'
      return value.length > 22 ? value.slice(0, 21) + '…' : value
    }

    function radius(node) {
      if (node.unresolved) return 7
      if (node.id === props.center) return 12
      return 8
    }

    function build() {
      if (simulation) simulation.stop()
      const nodes = (props.nodes || []).map(n => ({ ...n }))
      if (nodes.length === 0) {
        layoutNodes.value = []
        layoutEdges.value = []
        return
      }
      const byId = new Map(nodes.map(n => [n.id, n]))
      const edges = (props.edges || [])
        .filter(e => byId.has(e.source) && byId.has(e.target))
        .map(e => ({ ...e, source: e.source, target: e.target }))

      simulation = forceSimulation(nodes)
        .force('link', forceLink(edges).id(d => d.id).distance(95).strength(0.6))
        .force('charge', forceManyBody().strength(-320))
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide().radius(d => radius(d) + 12))
        .alphaDecay(0.035)

      layoutNodes.value = nodes
      layoutEdges.value = edges

      simulation.on('tick', () => {
        // Trigger Vue updates; d3 mutates the same node objects.
        layoutNodes.value = [...nodes]
        layoutEdges.value = [...edges]
      })
    }

    watch(() => [props.nodes, props.edges, props.center], build, { deep: false })
    onMounted(build)
    onBeforeUnmount(() => { if (simulation) simulation.stop() })

    function onWheel(event) {
      const factor = event.deltaY < 0 ? 1.1 : 0.9
      zoom.value = Math.min(3, Math.max(0.35, zoom.value * factor))
    }

    function onPointerDown(event) {
      if (event.target.closest('.graph-node')) return
      drag = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    function onPointerMove(event) {
      if (!drag) return
      pan.value = {
        x: drag.panX + (event.clientX - drag.x),
        y: drag.panY + (event.clientY - drag.y)
      }
    }

    function onPointerUp() {
      drag = null
    }

    const containerStyle = computed(() => ({ width: '100%', height: '100%' }))
    return {
      width,
      height,
      root,
      layoutNodes,
      layoutEdges,
      zoom,
      pan,
      shortLabel,
      radius,
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      containerStyle
    }
  }
}
</script>

<style scoped>
.graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: radial-gradient(circle at 50% 40%, #ffffff 0%, #f8f9fa 70%);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

.graph-canvas svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}

.graph-edge {
  stroke: #c7c9cc;
  stroke-width: 1.4;
}

.graph-edge.unresolved {
  stroke: #e8a3a3;
  stroke-dasharray: 4 3;
}

.graph-node {
  cursor: pointer;
}

.graph-node circle {
  fill: #1a73e8;
  stroke: #fff;
  stroke-width: 2;
  transition: r 0.15s;
}

.graph-node.node-canvas circle {
  fill: #e8710a;
}

.graph-node.unresolved circle {
  fill: #fff;
  stroke: #d93025;
  stroke-dasharray: 3 2;
}

.graph-node.center circle {
  stroke: #202124;
  stroke-width: 3;
}

.graph-node:hover circle {
  filter: brightness(1.08);
}

.graph-label {
  font-size: 10px;
  fill: #3c4043;
  pointer-events: none;
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 2.5px;
  stroke-linejoin: round;
}

.graph-legend {
  position: absolute;
  left: 0.75rem;
  bottom: 0.65rem;
  display: flex;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: #5f6368;
  background: rgba(255, 255, 255, 0.85);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.graph-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.2rem;
}

.graph-legend .dot.text { background: #1a73e8; }
.graph-legend .dot.canvas { background: #e8710a; }
.graph-legend .dot.unresolved { border: 1px dashed #d93025; }
</style>
