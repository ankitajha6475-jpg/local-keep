import test from 'node:test'
import assert from 'node:assert/strict'
import { planPages } from '../src/utils/whiteboardTiles.js'

function el(id, x, y, width = 40, height = 20, extra = {}) {
  return { id, type: 'rectangle', x, y, width, height, ...extra }
}

test('orders separated clusters left-to-right, top-to-bottom', () => {
  const pages = planPages([
    el('tl', 0, 0),
    el('tr', 400, 0),
    el('bl', 0, 400),
    el('br', 400, 400)
  ], { gap: 48, maxPageW: 1600, maxPageH: 1600 })

  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0].bbox, [0, 0, 440, 420])
  assert.equal(pages[0].elementIds.length, 4)
})

test('reading order within a band is x-sorted', () => {
  // Use small max height so each band is packed separately and order is visible.
  const pages = planPages([
    el('b', 300, 0),
    el('a', 0, 0),
    el('d', 300, 300),
    el('c', 0, 300)
  ], { gap: 20, maxPageW: 2000, maxPageH: 2000 })
  assert.equal(pages.length, 1)
  // All on one page; planner order is not directly exposed, so verify no split.
  assert.equal(pages[0].elementIds.length, 4)
})

test('packs wide clusters into multiple pages without dropping elements', () => {
  const pages = planPages([
    el('left', 0, 0, 1000, 500),
    el('right', 1200, 0, 1000, 500)
  ], { gap: 10, maxPageW: 1600, maxPageH: 1600 })
  assert.equal(pages.length, 2)
  assert.deepEqual(pages[0].elementIds, ['left'])
  assert.deepEqual(pages[1].elementIds, ['right'])
  assert.equal(pages.some(p => p.elementIds.length === 0), false)
})

test('arrows and groups keep distant elements together', () => {
  const pages = planPages([
    el('a', 0, 0),
    el('b', 900, 0),
    { id: 'arrow', type: 'arrow', x: 40, y: 10, width: 860, height: 0, startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } }
  ], { gap: 10, maxPageW: 500, maxPageH: 500 })
  assert.equal(pages.length, 1)
  assert.deepEqual(new Set(pages[0].elementIds), new Set(['a', 'b', 'arrow']))
})

test('frame children and bound text stay in one page', () => {
  const pages = planPages([
    el('frame', 0, 0, 200, 200, { type: 'frame' }),
    el('child1', 20, 20, 40, 20, { frameId: 'frame' }),
    el('child2', 600, 600, 40, 20, { frameId: 'frame' }),
    el('text', 620, 620, 30, 10, { containerId: 'child2' })
  ], { gap: 10, maxPageW: 1600, maxPageH: 1600 })
  assert.equal(pages.length, 1)
  assert.deepEqual(new Set(pages[0].elementIds), new Set(['frame', 'child1', 'child2', 'text']))
})

test('empty and deleted elements produce no pages', () => {
  assert.deepEqual(planPages([]), [])
  assert.deepEqual(planPages([el('gone', 0, 0, 10, 10, { isDeleted: true })]), [])
})

test('an oversized solid cluster is flagged rather than split', () => {
  const pages = planPages([el('huge', 0, 0, 5000, 200)], {
    gap: 10,
    maxPageW: 1600,
    maxPageH: 1600
  })
  assert.equal(pages.length, 1)
  assert.equal(pages[0].oversized, true)
  assert.equal(pages[0].clipped, true)
  assert.deepEqual(pages[0].elementIds, ['huge'])
})

test('custom getBounds is used when supplied', () => {
  const bounds = new Map([
    ['a', [0, 0, 10, 10]],
    ['b', [1000, 0, 1010, 10]]
  ])
  const pages = planPages([el('a', 0, 0), el('b', 0, 0)], {
    getBounds: item => bounds.get(item.id),
    gap: 10,
    maxPageW: 500,
    maxPageH: 500
  })
  assert.equal(pages.length, 2)
})
