export function collectPdfSegmentStartPages(segments) {
  if (!Array.isArray(segments)) return []
  const pages = []
  segments.forEach(function(segment) {
    const page = Math.max(1, parseInt(segment && segment.page, 10) || 0)
    if (page > 0) pages.push(page)
  })
  return pages.filter(function(page, index, list) {
    return list.indexOf(page) === index
  }).sort(function(a, b) { return a - b })
}

/**
 * Next spread page, snapping earlier when an indexed section start would
 * otherwise appear to the right of the left column.
 */
export function computeAlignedNextPage(currentPage, spreadCount, numPages, segmentStarts) {
  const current = Math.max(1, parseInt(currentPage, 10) || 1)
  const step = Math.max(1, parseInt(spreadCount, 10) || 1)
  const maxPage = Math.max(1, parseInt(numPages, 10) || current)
  if (current >= maxPage) return current

  const fullNext = Math.min(current + step, maxPage)
  const starts = Array.isArray(segmentStarts) ? segmentStarts : []

  for (let i = 0; i < starts.length; i += 1) {
    const startPage = starts[i]
    if (startPage <= current) continue
    if (startPage > maxPage) break
    if (startPage < fullNext) return startPage
    if (startPage >= fullNext && startPage < fullNext + step) {
      if (startPage > fullNext) return startPage
    }
    if (startPage >= fullNext + step) break
  }

  return fullNext
}

/**
 * Previous spread page, snapping later when an indexed section start would
 * otherwise appear to the right of the left column.
 */
export function computeAlignedPrevPage(currentPage, spreadCount, numPages, segmentStarts) {
  const current = Math.max(1, parseInt(currentPage, 10) || 1)
  const step = Math.max(1, parseInt(spreadCount, 10) || 1)
  if (current <= 1) return 1

  const fullPrev = Math.max(1, current - step)
  const starts = Array.isArray(segmentStarts) ? segmentStarts : []

  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const startPage = starts[i]
    if (startPage >= current) continue
    if (startPage > fullPrev && startPage < fullPrev + step) {
      if (startPage > fullPrev) return startPage
    }
    if (startPage <= fullPrev - step) break
  }

  return fullPrev
}
