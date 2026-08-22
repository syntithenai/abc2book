export const PLAYALONG_STAFF_GAP_PX = 168
const PREV_TRANSFORM_ATTR = 'data-playalong-prev-transform'
const ORIG_HEIGHT_ATTR = 'data-playalong-orig-height'
const ORIG_STYLE_HEIGHT_ATTR = 'data-playalong-orig-style-height'
const ORIG_VIEWBOX_ATTR = 'data-playalong-orig-viewbox'
const APPLIED_GAP_ATTR = 'data-playalong-gap'
const ORIG_VIEWER_OVERFLOW_ATTR = 'data-playalong-orig-viewer-overflow'
const ORIG_VIEWER_HEIGHT_ATTR = 'data-playalong-orig-viewer-height'
const ORIG_VIEWER_MAX_H_ATTR = 'data-playalong-orig-viewer-max-h'

export function lineIndexFromClassList(classList) {
  if (!classList) return null
  const list = classList.length != null ? classList : String(classList).split(/\s+/)
  for (let i = 0; i < list.length; i += 1) {
    const match = /^abcjs-l(\d+)$/.exec(list[i])
    if (match) return parseInt(match[1], 10)
  }
  return null
}

function svgInner(svg) {
  if (!svg) return null
  const groups = svg.querySelectorAll('g')
  for (let i = 0; i < groups.length; i += 1) {
    const kids = groups[i].children
    for (let j = 0; j < kids.length; j += 1) {
      if (lineIndexFromClassList(kids[j].classList) != null) return groups[i]
    }
  }
  return svg
}

function shouldShiftElement(el, line) {
  const parent = el.parentElement
  if (parent && lineIndexFromClassList(parent.classList) === line) return false
  return line != null
}

export function maxAbcjsLineIndex(svg) {
  if (!svg || typeof svg.querySelectorAll !== 'function') return -1
  let max = -1
  svg.querySelectorAll('[class*="abcjs-l"]').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line != null && line > max) max = line
  })
  return max
}

function normalizeGaps(gaps, maxLine) {
  const n = maxLine + 1
  const out = []
  if (Array.isArray(gaps)) {
    for (let i = 0; i < n; i += 1) out.push(Math.max(0, Number(gaps[i]) || 0))
    return out
  }
  const gap = Number(gaps) > 0 ? Number(gaps) : PLAYALONG_STAFF_GAP_PX
  for (let i = 0; i < n; i += 1) out.push(gap)
  return out
}

function offsetBeforeLine(gaps, line) {
  let y = 0
  for (let i = 0; i <= line && i < gaps.length; i += 1) y += gaps[i]
  return y
}

function svgUnitsPerCssPx(svg) {
  if (!svg || typeof svg.getBoundingClientRect !== 'function') return 1
  const rect = svg.getBoundingClientRect()
  if (!(rect.height > 1)) return 1
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(parseFloat)
    if (parts.length === 4 && parts[3] > 0) return parts[3] / rect.height
  }
  const height = parseFloat(svg.getAttribute('height')) || parseFloat(svg.style && svg.style.height)
  if (height > 0) return height / rect.height
  return 1
}

function viewerHost(svg) {
  if (!svg || typeof svg.closest !== 'function') return null
  return svg.closest('#abc_music_viewer')
}

function restoreViewer(svg) {
  const viewer = viewerHost(svg)
  if (!viewer) return
  if (viewer.hasAttribute(ORIG_VIEWER_OVERFLOW_ATTR)) {
    viewer.style.overflowY = viewer.getAttribute(ORIG_VIEWER_OVERFLOW_ATTR) || ''
    viewer.removeAttribute(ORIG_VIEWER_OVERFLOW_ATTR)
  }
  if (viewer.hasAttribute(ORIG_VIEWER_HEIGHT_ATTR)) {
    viewer.style.height = viewer.getAttribute(ORIG_VIEWER_HEIGHT_ATTR) || ''
    viewer.removeAttribute(ORIG_VIEWER_HEIGHT_ATTR)
  }
  if (viewer.hasAttribute(ORIG_VIEWER_MAX_H_ATTR)) {
    viewer.style.maxHeight = viewer.getAttribute(ORIG_VIEWER_MAX_H_ATTR) || ''
    viewer.removeAttribute(ORIG_VIEWER_MAX_H_ATTR)
  }
}

function unlockViewer(svg) {
  const viewer = viewerHost(svg)
  if (!viewer) return
  if (!viewer.hasAttribute(ORIG_VIEWER_OVERFLOW_ATTR)) {
    viewer.setAttribute(ORIG_VIEWER_OVERFLOW_ATTR, viewer.style.overflowY || '')
    viewer.setAttribute(ORIG_VIEWER_HEIGHT_ATTR, viewer.style.height || '')
    viewer.setAttribute(ORIG_VIEWER_MAX_H_ATTR, viewer.style.maxHeight || '')
  }
  viewer.style.overflowY = 'visible'
  viewer.style.height = 'auto'
  viewer.style.maxHeight = 'none'
}

export function clearPlayalongStaffGaps(svg) {
  if (!svg) return
  svg.querySelectorAll('[' + PREV_TRANSFORM_ATTR + ']').forEach(function(el) {
    const prev = el.getAttribute(PREV_TRANSFORM_ATTR)
    if (prev) el.setAttribute('transform', prev)
    else el.removeAttribute('transform')
    el.removeAttribute(PREV_TRANSFORM_ATTR)
  })
  const origHeight = svg.getAttribute(ORIG_HEIGHT_ATTR)
  if (origHeight != null) {
    if (origHeight) svg.setAttribute('height', origHeight)
    else svg.removeAttribute('height')
    svg.removeAttribute(ORIG_HEIGHT_ATTR)
  }
  const origStyleHeight = svg.getAttribute(ORIG_STYLE_HEIGHT_ATTR)
  if (origStyleHeight != null) {
    svg.style.height = origStyleHeight
    svg.removeAttribute(ORIG_STYLE_HEIGHT_ATTR)
  }
  const origViewBox = svg.getAttribute(ORIG_VIEWBOX_ATTR)
  if (origViewBox != null) {
    svg.setAttribute('viewBox', origViewBox)
    svg.removeAttribute(ORIG_VIEWBOX_ATTR)
  }
  restoreViewer(svg)
  svg.removeAttribute(APPLIED_GAP_ATTR)
}

export function applyPlayalongStaffGaps(svg, gaps) {
  if (!svg) return 0
  const maxLine = maxAbcjsLineIndex(svg)
  if (maxLine < 0) return 0
  const cssGaps = normalizeGaps(gaps, maxLine)
  const key = cssGaps.map(function(g) { return Math.round(g) }).join(',')
  if (svg.getAttribute(APPLIED_GAP_ATTR) === key) {
    return cssGaps.reduce(function(sum, g) { return sum + g }, 0)
  }
  clearPlayalongStaffGaps(svg)
  const scale = svgUnitsPerCssPx(svg)
  const svgGaps = cssGaps.map(function(g) { return g * scale })
  const inner = svgInner(svg)
  const targets = inner ? Array.from(inner.children) : []
  const shiftEls = targets.length ? targets : Array.from(svg.querySelectorAll('[class*="abcjs-l"]'))
  shiftEls.forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (!shouldShiftElement(el, line)) return
    const prev = el.getAttribute('transform') || ''
    const y = offsetBeforeLine(svgGaps, line)
    el.setAttribute(PREV_TRANSFORM_ATTR, prev)
    el.setAttribute('transform', 'translate(0,' + y + ')' + (prev ? ' ' + prev : ''))
  })
  const extraCss = cssGaps.reduce(function(sum, g) { return sum + g }, 0)
  const extraSvg = svgGaps.reduce(function(sum, g) { return sum + g }, 0)
  if (!svg.getAttribute(ORIG_HEIGHT_ATTR)) {
    svg.setAttribute(ORIG_HEIGHT_ATTR, svg.getAttribute('height') || '')
  }
  const height = parseFloat(svg.getAttribute('height'))
  if (Number.isFinite(height) && height > 0) {
    svg.setAttribute('height', String(height + extraSvg))
  }
  if (!svg.hasAttribute(ORIG_STYLE_HEIGHT_ATTR)) {
    svg.setAttribute(ORIG_STYLE_HEIGHT_ATTR, svg.style.height || '')
  }
  const styleHeight = parseFloat(svg.style.height)
  if (Number.isFinite(styleHeight) && styleHeight > 0) {
    svg.style.height = (styleHeight + extraCss) + 'px'
  }
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox && !svg.getAttribute(ORIG_VIEWBOX_ATTR)) {
    svg.setAttribute(ORIG_VIEWBOX_ATTR, viewBox)
    const parts = viewBox.trim().split(/[\s,]+/).map(parseFloat)
    if (parts.length === 4 && Number.isFinite(parts[3])) {
      svg.setAttribute('viewBox', parts[0] + ' ' + parts[1] + ' ' + parts[2] + ' ' + (parts[3] + extraSvg))
    }
  }
  unlockViewer(svg)
  svg.setAttribute(APPLIED_GAP_ATTR, key)
  return extraCss
}

function barCenterX(el) {
  const line = el.querySelector && el.querySelector('line')
  const rect = (line || el).getBoundingClientRect()
  return (rect.left + rect.right) / 2
}

export function measureAbcjsLineLayout(svg, overlayEl) {
  if (!svg || !overlayEl || typeof svg.querySelectorAll !== 'function') return []
  const overlayRect = overlayEl.getBoundingClientRect()
  const svgRect = svg.getBoundingClientRect()
  const byLine = {}

  function ensure(line) {
    if (!byLine[line]) {
      byLine[line] = {
        lineIndex: line,
        top: Infinity,
        left: Infinity,
        right: -Infinity,
        bottom: -Infinity,
        staffTop: Infinity,
        staffBottom: -Infinity,
        barXs: [],
        noteXs: [],
      }
    }
    return byLine[line]
  }

  function includeBox(slot, rect, staff) {
    if (!(rect.width > 0 || rect.height > 0)) return
    slot.top = Math.min(slot.top, rect.top)
    slot.left = Math.min(slot.left, rect.left)
    slot.right = Math.max(slot.right, rect.right)
    slot.bottom = Math.max(slot.bottom, rect.bottom)
    if (staff) {
      slot.staffTop = Math.min(slot.staffTop, rect.top)
      slot.staffBottom = Math.max(slot.staffBottom, rect.bottom)
    }
  }

  svg.querySelectorAll('[class*="abcjs-l"]').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line == null) return
    includeBox(ensure(line), el.getBoundingClientRect(), false)
  })
  svg.querySelectorAll('.abcjs-staff, .abcjs-top-line').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line == null) return
    includeBox(ensure(line), el.getBoundingClientRect(), true)
  })
  svg.querySelectorAll('.abcjs-bar').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line == null) return
    const slot = ensure(line)
    const x = barCenterX(el) - overlayRect.left
    if (Number.isFinite(x)) slot.barXs.push(x)
  })
  svg.querySelectorAll('.abcjs-note').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line == null) return
    const slot = ensure(line)
    const rect = el.getBoundingClientRect()
    if (!(rect.width > 0 || rect.height > 0)) return
    slot.noteXs.push(rect.left - overlayRect.left)
  })

  return Object.keys(byLine).map(function(key) {
    return byLine[key]
  }).sort(function(a, b) {
    return a.lineIndex - b.lineIndex
  }).map(function(box) {
    const staffTop = Number.isFinite(box.staffTop) ? box.staffTop : box.top
    const staffBottom = Number.isFinite(box.staffBottom) && box.staffBottom > -Infinity
      ? box.staffBottom
      : box.bottom
    box.barXs.sort(function(a, b) { return a - b })
    box.noteXs.sort(function(a, b) { return a - b })
    const unionTop = Number.isFinite(box.top) ? box.top : staffTop
    const unionBottom = Number.isFinite(box.bottom) && box.bottom > -Infinity ? box.bottom : staffBottom
    const svgTop = svgRect.top || 0
    let sliceTop = unionTop - svgTop
    if (box.lineIndex === 0) sliceTop = Math.min(sliceTop, 0)
    sliceTop = Math.max(0, sliceTop - 6)
    const sliceHeight = Number.isFinite(unionTop) && Number.isFinite(unionBottom)
      ? Math.max(24, unionBottom - svgTop - sliceTop + 6)
      : 0
    return {
      lineIndex: box.lineIndex,
      staffTop: staffTop - overlayRect.top,
      staffBottom: staffBottom - overlayRect.top,
      sliceTop: sliceTop,
      sliceHeight: sliceHeight,
      left: box.left - overlayRect.left,
      right: box.right - overlayRect.left,
      width: Math.max(80, box.right - box.left),
      barXs: box.barXs,
      noteXs: box.noteXs,
    }
  })
}

export function mountSvgLineSlice(host, svg, slice) {
  if (!host) return
  host.innerHTML = ''
  if (!svg || !slice || !(slice.sliceHeight > 0)) return
  const clone = svg.cloneNode(true)
  clone.removeAttribute('id')
  if (clone.querySelectorAll) {
    clone.querySelectorAll('[id]').forEach(function(el) {
      el.removeAttribute('id')
    })
  }
  const svgRect = svg.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  clone.style.position = 'absolute'
  clone.style.left = (svgRect.left - hostRect.left) + 'px'
  clone.style.top = (-(slice.sliceTop || 0)) + 'px'
  clone.style.margin = '0'
  clone.style.maxWidth = 'none'
  clone.style.maxHeight = 'none'
  if (svgRect.width > 0) clone.style.width = svgRect.width + 'px'
  if (svgRect.height > 0) clone.style.height = svgRect.height + 'px'
  host.appendChild(clone)
}

export function measureAbcjsLineSlots(svg, overlayEl) {
  return measureAbcjsLineLayout(svg, overlayEl).map(function(slot) {
    return {
      lineIndex: slot.lineIndex,
      top: slot.staffBottom,
      left: slot.left,
      width: slot.width,
    }
  })
}

export function buildBeatAnchors(options) {
  const opts = options || {}
  const beats = (opts.barBeats || []).slice().filter(function(b) { return Number.isFinite(b) }).sort(function(a, b) { return a - b })
  const xs = (opts.barXs || []).slice().filter(function(x) { return Number.isFinite(x) }).sort(function(a, b) { return a - b })
  const anchors = []
  const n = Math.min(beats.length, xs.length)
  for (let i = 0; i < n; i += 1) {
    anchors.push({ beat: beats[i], x: xs[i] })
  }
  const noteBeats = opts.noteBeats || []
  const noteXs = opts.noteXs || []
  const noteCount = Math.min(noteBeats.length, noteXs.length)
  for (let i = 0; i < noteCount; i += 1) {
    if (Number.isFinite(noteBeats[i]) && Number.isFinite(noteXs[i])) {
      anchors.push({ beat: noteBeats[i], x: noteXs[i] })
    }
  }
  anchors.sort(function(a, b) { return a.beat - b.beat })
  const duration = Math.max(1, Number(opts.patternDurationBeats) || 1)
  const startX = Number(opts.startX)
  const endX = Number(opts.endX)
  if (Number.isFinite(startX) && (anchors.length === 0 || anchors[0].beat > 0.05)) {
    anchors.unshift({ beat: 0, x: startX })
  }
  if (Number.isFinite(endX) && (anchors.length === 0 || anchors[anchors.length - 1].beat < duration - 0.05)) {
    anchors.push({ beat: duration, x: endX })
  }
  return anchors
}

export function alignedX(beat, anchors, fallbackX) {
  const pts = Array.isArray(anchors) ? anchors : []
  if (!pts.length) return fallbackX
  if (pts.length === 1) return pts[0].x
  let i = 0
  if (beat <= pts[0].beat) i = 0
  else if (beat >= pts[pts.length - 1].beat) i = pts.length - 2
  else {
    while (i < pts.length - 2 && beat > pts[i + 1].beat) i += 1
  }
  const a = pts[i]
  const b = pts[i + 1]
  const span = b.beat - a.beat
  const t = span !== 0 ? (beat - a.beat) / span : 0
  return a.x + t * (b.x - a.x)
}

function lineIndexFromEvent(ev) {
  const noteEl = ev && ev.elements && ev.elements[0] && ev.elements[0][0]
  if (!noteEl) return null
  let lineIndex = lineIndexFromClassList(noteEl.classList)
  let parent = noteEl.parentElement
  while (lineIndex == null && parent) {
    lineIndex = lineIndexFromClassList(parent.classList)
    parent = parent.parentElement
  }
  return lineIndex
}

/**
 * While playalong slices the hidden abcjs SVG into visible interleave rows,
 * scroll the matching row into vertical center. Returns true when handled.
 */
export function scrollPlayalongPlayingLineIntoCenter(ev) {
  if (typeof document === 'undefined') return false
  const stack = document.querySelector('.playalong-notation-stack--sliced')
  if (!stack) return false
  const lines = stack.querySelectorAll('.playalong-interleave-line')
  if (!lines.length) return false

  let match = null
  const lineIndex = lineIndexFromEvent(ev)
  if (lineIndex != null) {
    match = stack.querySelector('.playalong-interleave-line[data-line-index="' + lineIndex + '"]')
  }

  if (!match && ev && Number.isFinite(ev.top)) {
    let bestDist = Infinity
    for (let i = 0; i < lines.length; i += 1) {
      const el = lines[i]
      const top = parseFloat(el.getAttribute('data-slice-top'))
      const height = parseFloat(el.getAttribute('data-slice-height'))
      if (!Number.isFinite(top) || !Number.isFinite(height) || !(height > 0)) continue
      if (ev.top >= top - 2 && ev.top <= top + height + 2) {
        match = el
        break
      }
      const mid = top + height / 2
      const dist = Math.abs(ev.top - mid)
      if (dist < bestDist) {
        bestDist = dist
        match = el
      }
    }
  }

  if (!match) match = lines[0]
  try {
    match.scrollIntoView({ block: 'center', inline: 'nearest' })
  } catch (err) {
    try { match.scrollIntoView(true) } catch (e2) {}
  }
  return true
}
