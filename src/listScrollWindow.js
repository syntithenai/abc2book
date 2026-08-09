export const LIST_WINDOW_CHUNK_VIEWPORTS = 0.5
export const LIST_WINDOW_MAX_VIEWPORTS = 3
export const LIST_WINDOW_PRELOAD_VIEWPORTS = 1.5

export function computeListWindowChunkSize(viewportHeight, rowHeight, chunkViewports) {
  const viewports = chunkViewports != null ? chunkViewports : LIST_WINDOW_CHUNK_VIEWPORTS
  const viewport = Math.max(0, viewportHeight)
  const row = Math.max(1, rowHeight)
  return Math.max(1, Math.ceil((viewport * viewports) / row))
}

export function computeListWindowMaxRows(viewportHeight, rowHeight, maxViewports) {
  const viewports = maxViewports != null ? maxViewports : LIST_WINDOW_MAX_VIEWPORTS
  const viewport = Math.max(0, viewportHeight)
  const row = Math.max(1, rowHeight)
  return Math.max(
    computeListWindowChunkSize(viewportHeight, rowHeight) * 2,
    Math.ceil((viewport * viewports) / row)
  )
}

export function createInitialListWindow(total, viewportHeight, rowHeight) {
  const safeTotal = Math.max(0, total)
  if (safeTotal === 0) return { start: 0, end: 0 }
  const chunk = computeListWindowChunkSize(viewportHeight, rowHeight)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  const initialRows = Math.min(safeTotal, Math.min(maxRows, chunk * 3))
  return clampListWindow({ start: 0, end: Math.max(Math.min(safeTotal, chunk), initialRows) }, safeTotal)
}

export function clampListWindow(window, total, viewportHeight, rowHeight) {
  const safeTotal = Math.max(0, total)
  if (safeTotal === 0) return { start: 0, end: 0 }
  const startVal = window && window.start != null ? window.start : 0
  const endVal = window && window.end != null ? window.end : 0
  if (startVal >= safeTotal || endVal <= startVal) {
    return createInitialListWindow(
      safeTotal,
      viewportHeight != null ? viewportHeight : 800,
      rowHeight != null ? rowHeight : 96
    )
  }
  const start = Math.max(0, Math.min(safeTotal - 1, startVal))
  const end = Math.max(start + 1, Math.min(safeTotal, endVal))
  return { start: start, end: end }
}

export function advanceListWindowDown(windowStart, windowEnd, total, viewportHeight, rowHeight) {
  const safeTotal = Math.max(0, total)
  if (windowEnd >= safeTotal) return null
  const chunk = computeListWindowChunkSize(viewportHeight, rowHeight)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  let start = Math.max(0, windowStart)
  let end = Math.min(safeTotal, windowEnd + chunk)
  if (end - start > maxRows) {
    start = end - maxRows
  }
  const next = clampListWindow({ start: start, end: end }, safeTotal)
  if (next.start === windowStart && next.end === windowEnd) return null
  return next
}

export function advanceListWindowUp(windowStart, windowEnd, total, viewportHeight, rowHeight) {
  if (windowStart <= 0) return null
  const safeTotal = Math.max(0, total)
  const chunk = computeListWindowChunkSize(viewportHeight, rowHeight)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  let end = Math.max(windowStart, windowEnd)
  let start = Math.max(0, windowStart - chunk)
  if (end - start > maxRows) {
    end = start + maxRows
  }
  const next = clampListWindow({ start: start, end: end }, safeTotal)
  if (next.start === windowStart && next.end === windowEnd) return null
  return next
}

export function computeListWindowSpacerHeights(windowStart, windowEnd, total, rowHeight) {
  const safeTotal = Math.max(0, total)
  const row = Math.max(0, rowHeight)
  const start = Math.max(0, Math.min(safeTotal, windowStart))
  const end = Math.max(start, Math.min(safeTotal, windowEnd))
  return {
    top: start * row,
    bottom: Math.max(0, safeTotal - end) * row,
  }
}

export function getListWindowPreloadMargin(viewportHeight, preloadViewports) {
  const viewports = preloadViewports != null ? preloadViewports : LIST_WINDOW_PRELOAD_VIEWPORTS
  return Math.max(0, Math.round(Math.max(0, viewportHeight) * viewports))
}

export function usesListScrollWindow(displayMode, paginated) {
  return paginated && displayMode !== 'compact'
}

export function resolveListWindowScrollSync(params) {
  const {
    viewportTop,
    viewportBottom,
    contentTop,
    contentBottom,
    windowStart,
    windowEnd,
    total,
    viewportHeight,
    rowHeight,
    preloadMargin,
  } = params || {}

  const preload = preloadMargin != null
    ? preloadMargin
    : getListWindowPreloadMargin(viewportHeight)
  const current = clampListWindow({ start: windowStart, end: windowEnd }, total)

  if (viewportBottom >= contentBottom - preload) {
    return advanceListWindowDown(current.start, current.end, total, viewportHeight, rowHeight)
  }
  if (viewportTop <= contentTop + preload && current.start > 0) {
    return advanceListWindowUp(current.start, current.end, total, viewportHeight, rowHeight)
  }
  return null
}
