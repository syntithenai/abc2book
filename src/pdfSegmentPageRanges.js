const MAX_PLAUSIBLE_SONG_SPAN = 12

/**
 * Normalize PDF index segments so page ranges are monotonic and non-overlapping.
 */
export function enforceMonotonicPageRanges(segments, numPages) {
  const list = (Array.isArray(segments) ? segments : []).map(function(seg) {
    const page = Math.max(1, parseInt(seg && seg.page, 10) || 1)
    const endPage = Math.max(page, parseInt(seg && seg.endPage, 10) || page)
    return Object.assign({}, seg, {
      page: page,
      endPage: endPage,
    })
  })
  if (!list.length) return list

  const docEnd = numPages > 0 ? numPages : null
  let minStart = 1

  for (let i = 0; i < list.length; i += 1) {
    let start = Math.max(1, parseInt(list[i].page, 10) || 1)
    if (start < minStart) start = minStart

    let nextStart = null
    for (let j = i + 1; j < list.length; j += 1) {
      const hint = Math.max(1, parseInt(list[j].page, 10) || 0)
      if (hint >= minStart && hint > start) {
        nextStart = hint
        break
      }
    }

    const rawEnd = Math.max(start, parseInt(list[i].endPage, 10) || start)
    let end = start
    if (nextStart && nextStart > start) {
      if (nextStart - start > MAX_PLAUSIBLE_SONG_SPAN) {
        end = start
      } else {
        end = Math.min(rawEnd, nextStart - 1)
      }
    } else if (!nextStart && docEnd && i === list.length - 1) {
      end = Math.max(start, Math.min(rawEnd, docEnd))
    } else if (!nextStart && rawEnd > start && rawEnd - start <= 3) {
      end = rawEnd
    } else if (rawEnd > start) {
      end = start
    }
    if (end < start) end = start
    if (docEnd) end = Math.min(end, docEnd)

    list[i].page = start
    list[i].endPage = end
    minStart = end + 1
  }

  return list
}
