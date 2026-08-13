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

export function advanceListWindowDown(windowStart, windowEnd, total, viewportHeight, rowHeight, options) {
  const safeTotal = Math.max(0, total)
  if (windowEnd >= safeTotal) return null
  const deferTrim = !!(options && options.deferTrim)
  const chunk = computeListWindowChunkSize(viewportHeight, rowHeight)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  let start = Math.max(0, windowStart)
  let end = Math.min(safeTotal, windowEnd + chunk)
  if (end - start > maxRows) {
    if (deferTrim) {
      start = windowStart
    } else {
      start = end - maxRows
    }
  }
  const next = clampListWindow({ start: start, end: end }, safeTotal)
  if (next.start === windowStart && next.end === windowEnd) return null
  return next
}

export function advanceListWindowUp(windowStart, windowEnd, total, viewportHeight, rowHeight, options) {
  if (windowStart <= 0) return null
  const deferTrim = !!(options && options.deferTrim)
  const safeTotal = Math.max(0, total)
  const chunk = computeListWindowChunkSize(viewportHeight, rowHeight)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  let end = Math.max(windowStart, windowEnd)
  let start = Math.max(0, windowStart - chunk)
  if (end - start > maxRows) {
    if (deferTrim) {
      end = windowEnd
    } else {
      end = start + maxRows
    }
  }
  const next = clampListWindow({ start: start, end: end }, safeTotal)
  if (next.start === windowStart && next.end === windowEnd) return null
  return next
}

export function trimListWindowForScroll(current, total, viewportHeight, rowHeight, direction) {
  const safeTotal = Math.max(0, total)
  const maxRows = computeListWindowMaxRows(viewportHeight, rowHeight)
  const start = Math.max(0, current.start)
  const end = Math.min(safeTotal, current.end)
  if (end - start <= maxRows) return null
  if (direction < 0) {
    return clampListWindow({ start: start, end: start + maxRows }, safeTotal)
  }
  return clampListWindow({ start: end - maxRows, end: end }, safeTotal)
}

export function measureListWindowEdgeHeight(contentEl, count, fromTop) {
  if (!contentEl || count <= 0) return 0
  const children = contentEl.children
  if (!children || children.length === 0) return 0
  let height = 0
  if (fromTop) {
    const limit = Math.min(count, children.length)
    for (let i = 0; i < limit; i += 1) {
      height += children[i].getBoundingClientRect().height
    }
    return height
  }
  let remaining = count
  for (let i = children.length - 1; i >= 0 && remaining > 0; i -= 1) {
    height += children[i].getBoundingClientRect().height
    remaining -= 1
  }
  return height
}

export function computeListWindowScrollAdjust(prevWindow, nextWindow, edgeHeight, rowHeight) {
  const estimated = Math.max(1, rowHeight)
  if (nextWindow.start > prevWindow.start) {
    const trimCount = nextWindow.start - prevWindow.start
    return edgeHeight - trimCount * estimated
  }
  if (nextWindow.start < prevWindow.start) {
    const prependCount = prevWindow.start - nextWindow.start
    return prependCount * estimated - edgeHeight
  }
  if (nextWindow.end < prevWindow.end) {
    const trimCount = prevWindow.end - nextWindow.end
    return -(edgeHeight - trimCount * estimated)
  }
  if (nextWindow.end > prevWindow.end) {
    const appendCount = nextWindow.end - prevWindow.end
    return appendCount * estimated - edgeHeight
  }
  return 0
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

export function listWindowsEqual(left, right) {
  if (!left || !right) return false
  return left.start === right.start && left.end === right.end
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
    deferTrim,
  } = params || {}

  const preload = preloadMargin != null
    ? preloadMargin
    : getListWindowPreloadMargin(viewportHeight)
  const current = clampListWindow({ start: windowStart, end: windowEnd }, total)
  const options = { deferTrim: deferTrim }

  if (viewportBottom >= contentBottom - preload) {
    return advanceListWindowDown(
      current.start,
      current.end,
      total,
      viewportHeight,
      rowHeight,
      options
    )
  }
  if (viewportTop <= contentTop + preload && current.start > 0) {
    return advanceListWindowUp(
      current.start,
      current.end,
      total,
      viewportHeight,
      rowHeight,
      options
    )
  }
  return null
}
