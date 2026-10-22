export const DASHBOARD_MIN_CARD_WIDTH = 280
export const DASHBOARD_GRID_GAP = 16

/**
 * Match the old CSS `repeat(auto-fill, minmax(280px, 1fr))` behaviour without
 * asking the browser to lay out every card.
 */
export function dashboardColumnCount(width, options = {}) {
  const minCardWidth = Number(options.minCardWidth) || DASHBOARD_MIN_CARD_WIDTH
  const gap = Number(options.gap) || DASHBOARD_GRID_GAP
  const available = Math.max(0, Number(width) || 0)
  return Math.max(1, Math.floor((available + gap) / (minCardWidth + gap)))
}

/**
 * Turn the flat dashboard item list into virtual rows. Each row is one
 * RecycleScroller item with a fixed height.
 */
export function chunkDashboardItems(items, columns) {
  const list = Array.isArray(items) ? items : []
  const size = Math.max(1, Math.floor(Number(columns) || 1))
  const rows = []
  for (let index = 0; index < list.length; index += size) {
    rows.push({
      id: `row-${index / size}`,
      startIndex: index,
      items: list.slice(index, index + size)
    })
  }
  return rows
}

/**
 * Convert a visible row range (inclusive) to a flat item range (inclusive).
 */
export function virtualItemRange(startRow, endRow, columns, total) {
  const size = Math.max(1, Math.floor(Number(columns) || 1))
  const itemCount = Math.max(0, Number(total) || 0)
  if (itemCount === 0) return null
  const maxRow = Math.ceil(itemCount / size) - 1
  const firstRow = Math.max(0, Math.min(maxRow, Number(startRow) || 0))
  const lastRow = Math.max(firstRow, Math.min(maxRow, Number(endRow) || 0))
  const start = firstRow * size
  const end = Math.min(itemCount - 1, ((lastRow + 1) * size) - 1)
  if (end < start) return null
  return { start, end }
}

/**
 * Preserve the server's search order. Notes missing from `ids` sort last and
 * retain their relative order.
 */
export function orderBySearchResults(items, ids) {
  const rank = new Map((Array.isArray(ids) ? ids : []).map((id, index) => [id, index]))
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const rankA = rank.get(a.id)
    const rankB = rank.get(b.id)
    return (rankA ?? Number.MAX_SAFE_INTEGER) - (rankB ?? Number.MAX_SAFE_INTEGER)
  })
}

/**
 * Padded detail range. `pageSize` is both the batch size and the prefetch
 * granularity; `pages` is how many pages on each side stay warm.
 */
export function detailWindowRange(start, end, total, options = {}) {
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || 30))
  const pages = Math.max(0, Math.floor(Number(options.pages) || 1))
  const itemCount = Math.max(0, Number(total) || 0)
  if (itemCount === 0) return null
  const first = Math.max(0, Math.min(itemCount - 1, Number(start) || 0))
  const last = Math.max(first, Math.min(itemCount - 1, Number(end) || 0))
  return {
    start: Math.max(0, first - (pageSize * pages)),
    end: Math.min(itemCount - 1, last + (pageSize * pages))
  }
}
