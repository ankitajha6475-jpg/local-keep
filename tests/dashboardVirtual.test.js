import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chunkDashboardItems,
  dashboardColumnCount,
  detailWindowRange,
  orderBySearchResults,
  virtualItemRange
} from '../src/utils/dashboardVirtual.js'

test('dashboardColumnCount follows the 280px minimum card width', () => {
  assert.equal(dashboardColumnCount(0), 1)
  assert.equal(dashboardColumnCount(295), 1)
  assert.equal(dashboardColumnCount(296), 1)
  assert.equal(dashboardColumnCount(592), 2)
  assert.equal(dashboardColumnCount(888), 3)
  assert.equal(dashboardColumnCount(1184), 4)
})

test('chunkDashboardItems makes stable fixed-size rows', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: `n${index}` }))
  const rows = chunkDashboardItems(items, 3)
  assert.deepEqual(rows.map(row => row.id), ['row-0', 'row-1', 'row-2'])
  assert.deepEqual(rows.map(row => row.startIndex), [0, 3, 6])
  assert.deepEqual(rows.map(row => row.items.length), [3, 3, 1])
  assert.equal(rows[1].items[0].id, 'n3')
  assert.deepEqual(chunkDashboardItems(items, 0).map(row => row.items.length), [1, 1, 1, 1, 1, 1, 1])
})

test('virtualItemRange maps rows to the inclusive item range', () => {
  assert.equal(virtualItemRange(0, 0, 3, 7).start, 0)
  assert.equal(virtualItemRange(0, 0, 3, 7).end, 2)
  assert.equal(virtualItemRange(1, 1, 3, 7).start, 3)
  assert.equal(virtualItemRange(1, 1, 3, 7).end, 5)
  assert.equal(virtualItemRange(2, 2, 3, 7).end, 6)
  assert.equal(virtualItemRange(99, 99, 3, 7).start, 6)
  assert.equal(virtualItemRange(0, 10, 2, 0), null)
})

test('orderBySearchResults preserves server relevance rank', () => {
  const notes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  assert.deepEqual(
    orderBySearchResults(notes, ['c', 'a']).map(note => note.id),
    ['c', 'a', 'b', 'd']
  )
  assert.deepEqual(
    orderBySearchResults(notes, []).map(note => note.id),
    ['a', 'b', 'c', 'd']
  )
})

test('detailWindowRange keeps one page of prefetch on each side', () => {
  assert.deepEqual(detailWindowRange(40, 50, 200, { pageSize: 30, pages: 1 }), { start: 10, end: 80 })
  assert.deepEqual(detailWindowRange(0, 5, 20, { pageSize: 30, pages: 1 }), { start: 0, end: 19 })
  assert.equal(detailWindowRange(0, 0, 0), null)
})
