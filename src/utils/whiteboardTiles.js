// Pure reading-order page planner for Excalidraw-style elements.
// The caller can supply getBounds(el) -> [minX, minY, maxX, maxY] (the browser
// uses Excalidraw's getCommonBounds); tests can rely on x/y/width/height.

function defaultBounds(el) {
  const x = Number(el.x) || 0
  const y = Number(el.y) || 0
  const w = Number(el.width) || 0
  const h = Number(el.height) || 0
  return [Math.min(x, x + w), Math.min(y, y + h), Math.max(x, x + w), Math.max(y, y + h)]
}

function unionBounds(a, b) {
  if (!a) return [...b]
  if (!b) return [...a]
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3])
  ]
}

function expand(bounds, amount) {
  return [bounds[0] - amount, bounds[1] - amount, bounds[2] + amount, bounds[3] + amount]
}

function intersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

function widthOf(b) { return b[2] - b[0] }
function heightOf(b) { return b[3] - b[1] }

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i)
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  function union(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  return { find, union }
}

function buildAtomicUnits(elements, getBounds) {
  const indexById = new Map(elements.map((el, i) => [el.id, i]))
  const uf = createUnionFind(elements.length)

  function unionIds(a, b) {
    const ia = indexById.get(a)
    const ib = indexById.get(b)
    if (ia != null && ib != null) uf.union(ia, ib)
  }

  const groups = new Map()
  const frames = new Map()
  for (const el of elements) {
    for (const groupId of el.groupIds || []) {
      if (!groups.has(groupId)) groups.set(groupId, el.id)
      else unionIds(groups.get(groupId), el.id)
    }
    if (el.frameId) {
      if (!frames.has(el.frameId)) frames.set(el.frameId, el.id)
      else unionIds(frames.get(el.frameId), el.id)
      // Also union with the frame element itself when present.
      unionIds(el.frameId, el.id)
    }
    if (el.containerId) unionIds(el.containerId, el.id)
    for (const binding of [el.startBinding, el.endBinding]) {
      if (binding?.elementId) unionIds(binding.elementId, el.id)
    }
  }

  const units = new Map()
  elements.forEach((el, i) => {
    const root = uf.find(i)
    if (!units.has(root)) units.set(root, { elementIds: [], bbox: null })
    const unit = units.get(root)
    unit.elementIds.push(el.id)
    const bounds = getBounds ? getBounds(el) : defaultBounds(el)
    if (bounds) unit.bbox = unionBounds(unit.bbox, bounds)
  })

  return [...units.values()].filter(unit => unit.bbox)
}

function clusterUnits(units, gap) {
  const uf = createUnionFind(units.length)
  const expanded = units.map(unit => expand(unit.bbox, gap / 2))
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      if (intersects(expanded[i], expanded[j])) uf.union(i, j)
    }
  }

  const clusters = new Map()
  units.forEach((unit, i) => {
    const root = uf.find(i)
    if (!clusters.has(root)) {
      clusters.set(root, { elementIds: [], bbox: null, units: [] })
    }
    const cluster = clusters.get(root)
    cluster.units.push(unit)
    cluster.elementIds.push(...unit.elementIds)
    cluster.bbox = unionBounds(cluster.bbox, unit.bbox)
  })
  return [...clusters.values()]
}

function orderClusters(clusters, rowTolerance) {
  const tolerance = rowTolerance != null
    ? rowTolerance
    : Math.min(80, Math.max(24, median(clusters.map(c => heightOf(c.bbox))) * 0.5))

  const sorted = [...clusters].sort((a, b) => a.bbox[1] - b.bbox[1])
  const bands = []
  let band = null
  for (const cluster of sorted) {
    if (!band || cluster.bbox[1] <= band.maxY + tolerance) {
      if (!band) {
        band = { clusters: [], maxY: cluster.bbox[3] }
        bands.push(band)
      }
      band.clusters.push(cluster)
      band.maxY = Math.max(band.maxY, cluster.bbox[3])
    } else {
      band = { clusters: [cluster], maxY: cluster.bbox[3] }
      bands.push(band)
    }
  }
  for (const b of bands) b.clusters.sort((a, z) => a.bbox[0] - z.bbox[0])
  return bands.flatMap(b => b.clusters)
}

function packPages(clusters, maxW, maxH) {
  const pages = []
  let page = null
  for (const cluster of clusters) {
    if (!page) {
      page = { clusters: [], bbox: null }
      pages.push(page)
    }
    const next = unionBounds(page.bbox, cluster.bbox)
    const fits = !page.bbox || (widthOf(next) <= maxW && heightOf(next) <= maxH)
    if (fits) {
      page.clusters.push(cluster)
      page.bbox = next
    } else {
      page = { clusters: [cluster], bbox: [...cluster.bbox] }
      pages.push(page)
    }
  }
  return pages
}

/**
 * @param {Array} elements
 * @param {{getBounds?:Function,gap?:number,maxPageW?:number,maxPageH?:number,rowTolerance?:number}} opts
 * @returns {{pageIndex:number,bbox:number[],elementIds:string[],clusters:number,clipped:boolean,oversized:boolean}[]}
 */
export function planPages(elements, opts = {}) {
  const source = (elements || []).filter(el => el && !el.isDeleted)
  if (source.length === 0) return []

  const gap = opts.gap ?? 48
  const maxW = opts.maxPageW ?? 1600
  const maxH = opts.maxPageH ?? 1600
  const units = buildAtomicUnits(source, opts.getBounds)
  const clusters = orderClusters(clusterUnits(units, gap), opts.rowTolerance)
  const pages = packPages(clusters, maxW, maxH)

  return pages.map((page, index) => {
    const bbox = page.bbox
    const oversized = widthOf(bbox) > maxW || heightOf(bbox) > maxH
    const clipped = widthOf(bbox) > maxW * 2 || heightOf(bbox) > maxH * 2
    return {
      pageIndex: index,
      bbox,
      elementIds: [...new Set(page.clusters.flatMap(c => c.elementIds))],
      clusters: page.clusters.length,
      clipped,
      oversized
    }
  })
}
