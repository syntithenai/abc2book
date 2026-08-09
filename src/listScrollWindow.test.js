import {
  advanceListWindowDown,
  advanceListWindowUp,
  clampListWindow,
  computeListWindowChunkSize,
  computeListWindowMaxRows,
  computeListWindowSpacerHeights,
  createInitialListWindow,
  getListWindowPreloadMargin,
  resolveListWindowScrollSync,
} from './listScrollWindow'

describe('listScrollWindow', function() {
  const viewportHeight = 800
  const rowHeight = 96

  test('computes chunk and max rows from viewport', function() {
    expect(computeListWindowChunkSize(viewportHeight, rowHeight)).toBe(5)
    expect(computeListWindowMaxRows(viewportHeight, rowHeight)).toBe(25)
  })

  test('creates an initial window with preload headroom', function() {
    expect(createInitialListWindow(0, viewportHeight, rowHeight)).toEqual({ start: 0, end: 0 })
    expect(createInitialListWindow(100, viewportHeight, rowHeight)).toEqual({ start: 0, end: 15 })
  })

  test('clamps invalid windows back into range', function() {
    expect(clampListWindow({ start: 400, end: 425 }, 200, viewportHeight, rowHeight)).toEqual({ start: 0, end: 15 })
    expect(clampListWindow({ start: 10, end: 10 }, 100, viewportHeight, rowHeight)).toEqual({ start: 0, end: 15 })
  })

  test('appends half-screen chunks and trims from the start', function() {
    const first = advanceListWindowDown(0, 15, 100, viewportHeight, rowHeight)
    expect(first).toEqual({ start: 0, end: 20 })

    const second = advanceListWindowDown(0, 20, 100, viewportHeight, rowHeight)
    expect(second).toEqual({ start: 0, end: 25 })

    const third = advanceListWindowDown(0, 25, 100, viewportHeight, rowHeight)
    expect(third).toEqual({ start: 5, end: 30 })
  })

  test('prepends half-screen chunks and trims from the end', function() {
    const first = advanceListWindowUp(30, 55, 100, viewportHeight, rowHeight)
    expect(first).toEqual({ start: 25, end: 50 })

    const second = advanceListWindowUp(25, 50, 100, viewportHeight, rowHeight)
    expect(second).toEqual({ start: 20, end: 45 })
  })

  test('computes spacer heights for virtualized scroll range', function() {
    expect(computeListWindowSpacerHeights(10, 35, 100, rowHeight)).toEqual({
      top: 960,
      bottom: 6240,
    })
  })

  test('syncs when the viewport nears rendered content edges', function() {
    const preload = getListWindowPreloadMargin(viewportHeight)
    const contentTop = 1000
    const contentBottom = contentTop + (15 * rowHeight)

    expect(resolveListWindowScrollSync({
      viewportTop: contentBottom - viewportHeight - 10,
      viewportBottom: contentBottom + 10,
      contentTop: contentTop,
      contentBottom: contentBottom,
      windowStart: 0,
      windowEnd: 15,
      total: 100,
      viewportHeight: viewportHeight,
      rowHeight: rowHeight,
      preloadMargin: preload,
    })).toEqual({ start: 0, end: 20 })
  })
})
