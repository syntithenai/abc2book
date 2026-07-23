/**
 * Post-process abcjs SVG output to show tablature without standard notation.
 * abcjs always lays out notation first; we hide those elements and crop the SVG.
 */

const NOTATION_HIDE_SELECTORS = [
  'g.abcjs-note:not(.abcjs-tabNumber)',
  'g.abcjs-rest',
  '.abcjs-stem',
  '.abcjs-ledger',
  'g.abcjs-beam',
  'g.abcjs-slur',
  'g.abcjs-tie',
  'g.abcjs-tuplet',
  '.abcjs-chord',
  '.abcjs-lyric',
  '.abcjs-clef',
  'g.abcjs-key-signature',
  'g.abcjs-time-signature',
]

function hideElements(root, selector) {
  root.querySelectorAll(selector).forEach(function(el) {
    el.style.display = 'none'
  })
}

function isVisible(el) {
  return el && el.style.display !== 'none'
}

function voiceIndexFromClassList(classList) {
  if (!classList) return null
  for (let i = 0; i < classList.length; i++) {
    const match = /^abcjs-v(\d+)$/.exec(classList[i])
    if (match) return parseInt(match[1], 10)
  }
  return null
}

function lineIndexFromClassList(classList) {
  if (!classList) return null
  for (let i = 0; i < classList.length; i++) {
    const match = /^abcjs-l(\d+)$/.exec(classList[i])
    if (match) return parseInt(match[1], 10)
  }
  return null
}

function lineIndexFromElement(el, svg) {
  let node = el
  while (node && node !== svg) {
    const idx = lineIndexFromClassList(node.classList)
    if (idx !== null) return idx
    node = node.parentNode
  }
  return null
}

function collectVoiceIndices(svg) {
  const indices = new Set()
  svg.querySelectorAll('[class*="abcjs-v"]').forEach(function(el) {
    const idx = voiceIndexFromClassList(el.classList)
    if (idx !== null) indices.add(idx)
  })
  return indices
}

function hasTabNumberContent(el) {
  if (!el) return false
  if (el.classList) {
    if (el.classList.contains('tab-number') || el.classList.contains('abcjs-tabNumber')) {
      return true
    }
  }
  if (el.querySelector && el.querySelector('.tab-number, .abcjs-tabNumber')) {
    return true
  }
  return false
}

const TAB_VOICE_GAP = 10
const TAB_LABEL_LINE = 14
const TAB_SYSTEM_GAP = 56
const TAB_LABEL_OFFSET = 3
const TAB_CROP_PAD = 6

function readNodeY(node) {
  if (!node) return []
  const ys = []
  const attrs = ['y', 'y1', 'y2', 'cy']
  attrs.forEach(function(name) {
    const value = node.getAttribute && node.getAttribute(name)
    if (value != null && value !== '') {
      const n = parseFloat(value)
      if (Number.isFinite(n)) ys.push(n)
    }
  })
  const d = node.getAttribute && node.getAttribute('d')
  if (d) {
    const matches = d.match(/-?\d*\.?\d+/g)
    if (matches) {
      for (let i = 1; i < matches.length; i += 2) {
        const n = parseFloat(matches[i])
        if (Number.isFinite(n)) ys.push(n)
      }
    }
  }
  return ys
}

function boxFromGraphicNodes(root) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const nodes = [root].concat(Array.from(root.querySelectorAll('path, line, polyline, rect, text, circle, ellipse')))
  nodes.forEach(function(node) {
    readNodeY(node).forEach(function(y) {
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })
    const x = parseFloat(node.getAttribute && node.getAttribute('x'))
    if (Number.isFinite(x)) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
  })
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null
  return {
    x: Number.isFinite(minX) ? minX : 0,
    y: minY,
    width: Number.isFinite(maxX) ? Math.max(1, maxX - minX) : 1,
    height: Math.max(1, maxY - minY),
  }
}

function parseTranslate(transform) {
  if (!transform) return { x: 0, y: 0 }
  const match = /translate\(\s*([^,\s)]+)(?:[,\s]+([^)]+))?\s*\)/.exec(transform)
  if (!match) return { x: 0, y: 0 }
  return {
    x: parseFloat(match[1]) || 0,
    y: parseFloat(match[2]) || 0,
  }
}

function accumulatedTranslate(el, stopAt) {
  let x = 0
  let y = 0
  let node = el
  while (node && node !== stopAt) {
    const shift = parseTranslate(node.getAttribute && node.getAttribute('transform'))
    x += shift.x
    y += shift.y
    node = node.parentNode
  }
  return { x: x, y: y }
}

function offsetBox(box, el, root) {
  if (!box) return null
  const shift = accumulatedTranslate(el, root || (el && el.ownerSVGElement))
  return {
    x: box.x + shift.x,
    y: box.y + shift.y,
    width: box.width,
    height: box.height,
  }
}

function readStaffBox(staff) {
  if (!staff) return null
  let box = null
  try {
    const raw = staff.getBBox()
    if (raw && Number.isFinite(raw.height) && raw.height > 0) box = raw
  } catch (e) {
    // jsdom and some detached nodes lack SVG geometry APIs.
  }
  if (!box) box = boxFromGraphicNodes(staff)
  return offsetBox(box, staff, staff.ownerSVGElement)
}

function readElementBox(el) {
  if (!el) return null
  if (el.style && el.style.display === 'none') return null
  let box = null
  try {
    const raw = el.getBBox()
    if (raw && Number.isFinite(raw.height) && raw.height > 0) box = raw
  } catch (e) {
    // fall through
  }
  if (!box) box = boxFromGraphicNodes(el)
  return offsetBox(box, el, el.ownerSVGElement)
}

function staffLineCount(staff) {
  return staff.querySelectorAll('path, line, polyline').length
}

const NOTATION_STAFF_LINE_COUNT = 5

function collectLineNumbers(svg) {
  const lines = new Set()
  svg.querySelectorAll('[class*="abcjs-l"]').forEach(function(el) {
    const line = lineIndexFromClassList(el.classList)
    if (line !== null) lines.add(line)
  })
  return Array.from(lines).sort(function(a, b) { return a - b })
}

/**
 * Tab numbers copy notation voice classes, but the 6-string staff is a separate voice.
 * Keep every non-notation staff (4/6-line tab) on lines that contain tab numbers.
 */
export function getTabStaffVoiceIndices(svg) {
  const indices = new Set()
  if (!svg) return indices

  const linesWithTab = new Set()
  svg.querySelectorAll('.tab-number, .abcjs-tabNumber').forEach(function(el) {
    const line = lineIndexFromElement(el, svg)
    if (line !== null) linesWithTab.add(line)
  })
  if (!linesWithTab.size) return indices

  linesWithTab.forEach(function(lineNum) {
    svg.querySelectorAll('g.abcjs-staff').forEach(function(staff) {
      if (lineIndexFromClassList(staff.classList) !== lineNum) return
      const voice = voiceIndexFromClassList(staff.classList)
      if (voice === null) return
      const lineCount = staffLineCount(staff)
      if (lineCount > 0 && lineCount !== NOTATION_STAFF_LINE_COUNT) {
        indices.add(voice)
      }
    })
  })

  if (!indices.size) {
    linesWithTab.forEach(function(lineNum) {
      let best = null
      svg.querySelectorAll('g.abcjs-staff').forEach(function(staff) {
        if (lineIndexFromClassList(staff.classList) !== lineNum) return
        const voice = voiceIndexFromClassList(staff.classList)
        if (voice === null) return
        const lineCount = staffLineCount(staff)
        if (!best || lineCount > best.lineCount || (lineCount === best.lineCount && voice > best.voice)) {
          best = { voice: voice, lineCount: lineCount }
        }
      })
      if (best && best.lineCount >= 4) indices.add(best.voice)
    })
  }

  return indices
}

/** @deprecated Use getTabStaffVoiceIndices — tab numbers use notation voice classes. */
export function getTabVoiceIndices(svg) {
  return getTabStaffVoiceIndices(svg)
}

function hideNotationElements(svg) {
  NOTATION_HIDE_SELECTORS.forEach(function(selector) {
    svg.querySelectorAll(selector).forEach(function(el) {
      if (hasTabNumberContent(el)) return
      el.style.display = 'none'
    })
  })
}

function hideNonTabStaffs(svg, tabStaffVoices) {
  svg.querySelectorAll('g.abcjs-staff').forEach(function(staff) {
    const voice = voiceIndexFromClassList(staff.classList)
    const isNotationStaff = staffLineCount(staff) === NOTATION_STAFF_LINE_COUNT
    if (isNotationStaff || voice === null || !tabStaffVoices.has(voice)) {
      staff.style.display = 'none'
    }
  })
}

function hideNonTabVoiceLayers(svg, tabStaffVoices) {
  collectVoiceIndices(svg).forEach(function(voiceIndex) {
    if (tabStaffVoices.has(voiceIndex)) return
    svg.querySelectorAll('[class~="abcjs-v' + voiceIndex + '"]').forEach(function(el) {
      if (hasTabNumberContent(el)) return
      if (el.classList && el.classList.contains('abcjs-bar')) return
      el.style.display = 'none'
    })
  })
}

function voiceHasTabNumbersOnLine(svg, lineNum, notationVoice) {
  if (notationVoice === null || notationVoice === undefined) return false
  let found = false
  svg.querySelectorAll('.tab-number, .abcjs-tabNumber').forEach(function(el) {
    if (el.style.display === 'none') return
    if (lineIndexFromElement(el, svg) !== lineNum) return
    if (voiceIndexFromClassList(el.classList) !== notationVoice) return
    found = true
  })
  return found
}

function staffInstrumentKey(staff) {
  const lines = staffLineCount(staff)
  if (lines >= 6) return 'guitar'
  if (lines === 5) return 'banjo5'
  if (lines === 4) return 'violin'
  return 'other-' + lines
}

function labelInstrumentKey(label) {
  const text = String(label.textContent || '').toLowerCase()
  if (text.indexOf('guitar') !== -1) return 'guitar'
  if (text.indexOf('violin') !== -1) return 'violin'
  if (text.indexOf('banjo') !== -1) return 'banjo5'
  if (text.indexOf('uke') !== -1 || text.indexOf('mandolin') !== -1) return 'violin'
  if (text.indexOf('bouzouki') !== -1) return 'violin'
  return 'other'
}

function hideEmptyTabStaffs(svg, tabStaffVoices) {
  collectLineNumbers(svg).forEach(function(lineNum) {
    const notationVoices = notationVoicesOnLine(svg, lineNum)
    tabStaffsOnLine(svg, lineNum, tabStaffVoices).forEach(function(staffInfo, index) {
      const notationVoice = notationVoices[index]
      if (!voiceHasTabNumbersOnLine(svg, lineNum, notationVoice)) {
        staffInfo.staff.style.display = 'none'
      }
    })
  })
}

function measureTabLineContentExtent(svg, lineNum, tabStaffVoices) {
  let minY = Infinity
  let maxY = -Infinity
  function includeBox(box) {
    if (!box) return
    minY = Math.min(minY, box.y)
    maxY = Math.max(maxY, box.y + box.height)
  }
  const notationVoices = notationVoicesOnLine(svg, lineNum)
  tabStaffsOnLine(svg, lineNum, tabStaffVoices).forEach(function(staffInfo, index) {
    if (!voiceHasTabNumbersOnLine(svg, lineNum, notationVoices[index])) return
    includeBox(staffInfo.box)
  })
  svg.querySelectorAll('g.abcjs-tabNumber, .tab-number').forEach(function(el) {
    if (el.style.display === 'none') return
    if (lineIndexFromElement(el, svg) !== lineNum) return
    includeBox(readElementBox(el))
  })
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null
  return { minY: minY, maxY: maxY, height: maxY - minY }
}

function pathXFromBarNode(node) {
  if (!node) return null
  if (node.tagName === 'line') {
    const x = parseFloat(node.getAttribute('x1'))
    return Number.isFinite(x) ? x : null
  }
  const d = node.getAttribute('d') || ''
  const match = /M\s*([-\d.]+)/.exec(d)
  return match ? parseFloat(match[1]) : null
}

function setBarNodeVerticalRange(node, top, bottom, width) {
  if (!node) return
  const w = width == null ? 1.2 : width
  if (node.tagName === 'line') {
    node.setAttribute('y1', String(top))
    node.setAttribute('y2', String(bottom))
    return
  }
  const x = pathXFromBarNode(node)
  if (!Number.isFinite(x)) return
  node.setAttribute('d', [
    'M', x, top,
    'L', x, bottom,
    'L', x + w, bottom,
    'L', x + w, top,
    'z',
  ].join(' '))
}

function notationVoicesOnLine(svg, lineNum) {
  const voices = new Set()
  svg.querySelectorAll('.tab-number, .abcjs-tabNumber').forEach(function(el) {
    if (el.style.display === 'none') return
    if (lineIndexFromElement(el, svg) !== lineNum) return
    const voice = voiceIndexFromClassList(el.classList)
    if (voice !== null) voices.add(voice)
  })
  return Array.from(voices).sort(function(a, b) { return a - b })
}

function tabStaffsOnLine(svg, lineNum, tabStaffVoices) {
  return collectVisibleTabStaffs(svg, tabStaffVoices).filter(function(info) {
    return info.line === lineNum
  })
}

function tabStaffBoxForNotationVoice(svg, lineNum, notationVoice, tabStaffVoices) {
  const tabStaffs = tabStaffsOnLine(svg, lineNum, tabStaffVoices)
  if (!tabStaffs.length) return null
  const notationVoices = notationVoicesOnLine(svg, lineNum)
  const idx = notationVoices.indexOf(notationVoice)
  const staffInfo = tabStaffs[idx >= 0 ? idx : 0]
  return staffInfo ? (readStaffBox(staffInfo.staff) || staffInfo.box) : null
}

/** Barlines are drawn on notation voices but should span only the matching tab staff. */
function trimBarlinesToTabStaff(svg, tabStaffVoices) {
  svg.querySelectorAll('g.abcjs-bar').forEach(function(bar) {
    const line = lineIndexFromElement(bar, svg)
    if (line === null) return
    const notationVoice = voiceIndexFromClassList(bar.classList)
    if (!voiceHasTabNumbersOnLine(svg, line, notationVoice)) {
      bar.style.display = 'none'
      return
    }
    const staffBox = tabStaffBoxForNotationVoice(svg, line, notationVoice, tabStaffVoices)
    if (!staffBox) {
      bar.style.display = 'none'
      return
    }
    bar.style.display = ''
    bar.removeAttribute('transform')
    const top = staffBox.y
    const bottom = staffBox.y + staffBox.height
    bar.querySelectorAll('path, line').forEach(function(node) {
      node.style.display = ''
      setBarNodeVerticalRange(node, top, bottom, 1.2)
    })
  })
}

/** Hide tall brace connectors left when notation staves are removed. */
function hideStaffBraceConnectors(svg, tabStaffVoices) {
  collectLineNumbers(svg).forEach(function(lineNum) {
    const tabExt = measureTabLineContentExtent(svg, lineNum, tabStaffVoices)
    if (!tabExt || !(tabExt.height > 0)) return
    svg.querySelectorAll('path, line').forEach(function(node) {
      if (lineIndexFromElement(node, svg) !== lineNum) return
      if (node.style.display === 'none') return
      if (node.closest && node.closest('g.abcjs-bar')) return
      if (node.closest && node.closest('g.abcjs-staff')) return
      const box = readElementBox(node)
      if (!box) return
      if (box.height > tabExt.height * 1.15 && box.width <= 4) {
        node.style.display = 'none'
      }
    })
  })
}

function collectTabInstrumentLabels(svg) {
  return Array.from(svg.querySelectorAll('text.abcjs-instrument-name, .abcjs-instrument-name, .instrument-name'))
}

function isInstrumentLabelEl(el) {
  if (!el || !el.classList) return false
  return el.classList.contains('abcjs-instrument-name') || el.classList.contains('instrument-name')
}

function hideAllInstrumentLabels(svg) {
  collectTabInstrumentLabels(svg).forEach(function(label) {
    label.style.display = 'none'
    delete label.dataset.tabOnlyLabel
    label.removeAttribute('transform')
  })
}

function hideUnplacedInstrumentLabels(svg) {
  collectTabInstrumentLabels(svg).forEach(function(label) {
    if (label.dataset.tabOnlyLabel !== '1') {
      label.style.display = 'none'
    }
  })
}

function collectVisibleTabStaffs(svg, tabStaffVoices) {
  const staffs = []
  svg.querySelectorAll('g.abcjs-staff').forEach(function(staff) {
    if (staff.style.display === 'none') return
    const voice = voiceIndexFromClassList(staff.classList)
    if (!tabStaffVoices.has(voice)) return
    const line = lineIndexFromClassList(staff.classList)
    const box = readStaffBox(staff)
    if (!box) return
    staffs.push({
      staff: staff,
      voice: voice,
      line: line == null ? 0 : line,
      box: box,
    })
  })
  staffs.sort(function(a, b) {
    if (a.line !== b.line) return a.line - b.line
    return a.box.y - b.box.y
  })
  return staffs
}

function lineHasVisibleTabNumbers(svg, lineNum) {
  let found = false
  svg.querySelectorAll('.tab-number, .abcjs-tabNumber').forEach(function(el) {
    if (el.style.display === 'none') return
    if (lineIndexFromElement(el, svg) !== lineNum) return
    found = true
  })
  return found
}

function hideLineElements(svg, lineNum) {
  svg.querySelectorAll('*').forEach(function(el) {
    if (!elementHasLineClass(el, lineNum)) return
    el.style.display = 'none'
  })
}

/** Keep one label per tab staff, placed just above the staff's left edge. */
function layoutTabInstrumentLabels(svg, tabStaffVoices) {
  hideAllInstrumentLabels(svg)
  const labels = collectTabInstrumentLabels(svg)
  const usedLabels = new Set()

  collectLineNumbers(svg).forEach(function(lineNum) {
    if (!lineHasVisibleTabNumbers(svg, lineNum)) return
    const notationVoices = notationVoicesOnLine(svg, lineNum)
    tabStaffsOnLine(svg, lineNum, tabStaffVoices).forEach(function(staffInfo, index) {
      const notationVoice = notationVoices[index]
      if (!voiceHasTabNumbersOnLine(svg, lineNum, notationVoice)) return
      const wantKey = staffInstrumentKey(staffInfo.staff)
      let label = null
      let labelIndex = -1
      labels.forEach(function(candidate, idx) {
        if (usedLabels.has(idx)) return
        if (labelInstrumentKey(candidate) === wantKey) {
          label = candidate
          labelIndex = idx
        }
      })
      if (!label) {
        labels.forEach(function(candidate, idx) {
          if (usedLabels.has(idx) || label) return
          label = candidate
          labelIndex = idx
        })
      }
      if (!label) return
      usedLabels.add(labelIndex)
      label.style.display = ''
      label.dataset.tabOnlyLabel = '1'
      label.removeAttribute('transform')
      const staffBox = readStaffBox(staffInfo.staff) || staffInfo.box
      label.setAttribute('x', String(staffBox.x))
      label.setAttribute('text-anchor', 'start')
      label.setAttribute('y', String(staffBox.y - TAB_LABEL_OFFSET))
    })
  })
  hideUnplacedInstrumentLabels(svg)
}

/** Hide barlines that no longer align with a visible tab staff after vertical compaction. */
function hideOrphanBarlines(svg, tabStaffVoices) {
  svg.querySelectorAll('g.abcjs-bar').forEach(function(bar) {
    if (bar.style.display === 'none') return
    const line = lineIndexFromElement(bar, svg)
    if (line === null || !lineHasVisibleTabNumbers(svg, line)) {
      bar.style.display = 'none'
      return
    }
    const notationVoice = voiceIndexFromClassList(bar.classList)
    const staffBox = tabStaffBoxForNotationVoice(svg, line, notationVoice, tabStaffVoices)
    if (!staffBox) {
      bar.style.display = 'none'
      return
    }
    const barBox = readElementBox(bar)
    if (!barBox) {
      bar.style.display = 'none'
      return
    }
    const barMid = barBox.y + barBox.height / 2
    const pad = 8
    if (barMid < staffBox.y - pad || barMid > staffBox.y + staffBox.height + pad) {
      bar.style.display = 'none'
    }
  })
}

/** Hide leftover notation graphics (beams, stems, slashes) outside tab staves. */
function hideStrayNotationGraphics(svg, tabStaffVoices) {
  svg.querySelectorAll('path, line, polyline').forEach(function(node) {
    if (node.style.display === 'none') return
    if (node.closest && node.closest('g.abcjs-staff')) return
    if (node.closest && node.closest('g.abcjs-bar')) return
    if (node.closest && (node.closest('.abcjs-tabNumber') || node.closest('.tab-number'))) return
    const line = lineIndexFromElement(node, svg)
    if (line === null || !lineHasVisibleTabNumbers(svg, line)) {
      node.style.display = 'none'
      return
    }
    const box = readElementBox(node)
    if (!box) return
    const tabStaffs = tabStaffsOnLine(svg, line, tabStaffVoices)
    const withinTab = tabStaffs.some(function(info) {
      const pad = 6
      return box.y + box.height >= info.box.y - pad
        && box.y <= info.box.y + info.box.height + pad
        && box.x <= info.box.x + 900
    })
    if (!withinTab && (box.width > 6 || box.height > 6)) {
      node.style.display = 'none'
    }
  })
}

/** Remove systems that only reserve space for empty tab staves or stray barlines. */
function hideEmptyTabSystems(svg) {
  collectLineNumbers(svg).forEach(function(lineNum) {
    if (lineHasVisibleTabNumbers(svg, lineNum)) return
    hideLineElements(svg, lineNum)
    collectTabInstrumentLabels(svg).forEach(function(label) {
      const line = lineIndexFromElement(label, svg)
      if (line === lineNum) {
        label.style.display = 'none'
        delete label.dataset.tabOnlyLabel
      }
    })
  })
  svg.querySelectorAll('g.abcjs-bar').forEach(function(bar) {
    const line = lineIndexFromElement(bar, svg)
    if (line === null || !lineHasVisibleTabNumbers(svg, line)) {
      bar.style.display = 'none'
    }
  })
}

function elementHasLineClass(el, lineNum) {
  if (!el || !el.classList) return false
  const want = 'abcjs-l' + lineNum
  for (let i = 0; i < el.classList.length; i++) {
    if (el.classList[i] === want) return true
  }
  return false
}

function topLevelLineElements(svg, lineNum) {
  const matches = []
  svg.querySelectorAll('*').forEach(function(el) {
    if (!elementHasLineClass(el, lineNum)) return
    let parent = el.parentNode
    while (parent && parent !== svg) {
      if (elementHasLineClass(parent, lineNum)) return
      parent = parent.parentNode
    }
    matches.push(el)
  })
  return matches
}

function applyTranslateY(el, dy) {
  if (!el || !dy) return
  const existing = el.getAttribute('transform') || ''
  const match = /translate\(\s*([^,\s)]+)(?:[,\s]+([^)]+))?\s*\)/.exec(existing)
  const x = match ? parseFloat(match[1]) || 0 : 0
  const y = (match ? parseFloat(match[2]) || 0 : 0) + dy
  const rest = existing.replace(/translate\([^)]*\)/, '').trim()
  el.setAttribute('transform', (rest ? rest + ' ' : '') + 'translate(' + x + ' ' + y + ')')
}

/**
 * Measure vertical gap between hidden notation staves and tab staves per system.
 * Must run before staffs are hidden so getBBox reflects layout.
 */
export function measureTabOnlyLineShifts(svg, tabStaffVoices) {
  const shifts = {}
  if (!svg || !tabStaffVoices || !tabStaffVoices.size) return shifts

  const perLine = {}
  svg.querySelectorAll('g.abcjs-staff').forEach(function(staff) {
    const line = lineIndexFromClassList(staff.classList)
    const voice = voiceIndexFromClassList(staff.classList)
    if (line === null || voice === null) return
    if (!perLine[line]) {
      perLine[line] = { minTabTop: Infinity, minHiddenTop: Infinity }
    }
    const box = readStaffBox(staff)
    if (!box) return
    if (tabStaffVoices.has(voice)) {
      perLine[line].minTabTop = Math.min(perLine[line].minTabTop, box.y)
    } else {
      perLine[line].minHiddenTop = Math.min(perLine[line].minHiddenTop, box.y)
    }
  })

  Object.keys(perLine).forEach(function(lineKey) {
    const info = perLine[lineKey]
    if (!Number.isFinite(info.minTabTop)) return
    if (!Number.isFinite(info.minHiddenTop)) return
    const shift = info.minTabTop - info.minHiddenTop
    if (shift > 2) shifts[lineKey] = shift
  })
  return shifts
}

function getVisibleTabStaffPairs(svg, lineNum, tabStaffVoices) {
  const notationVoices = notationVoicesOnLine(svg, lineNum)
  const pairs = []
  tabStaffsOnLine(svg, lineNum, tabStaffVoices).forEach(function(staffInfo, index) {
    const notationVoice = notationVoices[index]
    if (!voiceHasTabNumbersOnLine(svg, lineNum, notationVoice)) return
    pairs.push({
      notationVoice: notationVoice,
      tabVoice: staffInfo.voice,
      staff: staffInfo.staff,
      box: staffInfo.box,
    })
  })
  return pairs
}

/** Close the gap between tab staves for different voices on the same system. */
export function measureTabOnlyVoiceGaps(svg, lineNum, tabStaffVoices) {
  const shifts = {}
  const pairs = getVisibleTabStaffPairs(svg, lineNum, tabStaffVoices)
  if (pairs.length < 2) return shifts
  const voiceBand = TAB_LABEL_LINE + TAB_VOICE_GAP
  let prevBottom = null
  pairs.forEach(function(pair, index) {
    if (index === 0) {
      prevBottom = pair.box.y + pair.box.height
      return
    }
    const shift = pair.box.y - prevBottom - voiceBand
    if (shift > 2) shifts[String(pair.notationVoice)] = shift
    prevBottom = pair.box.y + pair.box.height - (shift > 2 ? shift : 0)
  })
  return shifts
}

function applyTabOnlyVoiceShifts(svg, lineNum, voiceShifts, tabStaffVoices) {
  const notationVoices = notationVoicesOnLine(svg, lineNum)
  const tabStaffs = tabStaffsOnLine(svg, lineNum, tabStaffVoices)
  Object.keys(voiceShifts).forEach(function(voiceKey) {
    const shift = voiceShifts[voiceKey]
    const notationVoice = parseInt(voiceKey, 10)
    const idx = notationVoices.indexOf(notationVoice)
    const tabVoice = idx >= 0 && tabStaffs[idx] ? tabStaffs[idx].voice : null
    const voicesToShift = new Set([notationVoice])
    if (tabVoice !== null) voicesToShift.add(tabVoice)
    svg.querySelectorAll('*').forEach(function(el) {
      if (el.style.display === 'none') return
      if (isInstrumentLabelEl(el)) return
      if (lineIndexFromElement(el, svg) !== lineNum) return
      const voice = voiceIndexFromClassList(el.classList)
      if (voice !== null && voicesToShift.has(voice)) {
        applyTranslateY(el, -shift)
      }
    })
  })
}

function compactTabOnlyVerticalSpacing(svg, tabStaffVoices) {
  hideAllInstrumentLabels(svg)
  applyTabOnlyLineShifts(svg, measureTabOnlyLineShifts(svg, tabStaffVoices))
  collectLineNumbers(svg).forEach(function(lineNum) {
    if (!lineHasVisibleTabNumbers(svg, lineNum)) return
    applyTabOnlyVoiceShifts(svg, lineNum, measureTabOnlyVoiceGaps(svg, lineNum, tabStaffVoices), tabStaffVoices)
  })
  applyTabOnlyLineShifts(svg, measureTabOnlySystemStacking(svg, tabStaffVoices))
}

/** Close vertical gaps between tab systems after notation has been removed. */
export function measureTabOnlySystemStacking(svg, tabStaffVoices, systemGap) {
  const shifts = {}
  if (!svg || !tabStaffVoices || !tabStaffVoices.size) return shifts
  const gap = systemGap == null ? TAB_SYSTEM_GAP : systemGap
  const lineNumbers = collectLineNumbers(svg)
  if (lineNumbers.length < 2) return shifts

  let nextTop = null
  lineNumbers.forEach(function(lineNum) {
    if (!lineHasVisibleTabNumbers(svg, lineNum)) return
    const extent = measureTabLineContentExtent(svg, lineNum, tabStaffVoices)
    if (!extent) return
    if (nextTop === null) {
      nextTop = extent.maxY + gap
      return
    }
    const shift = extent.minY - nextTop
    if (Math.abs(shift) > 2) shifts[String(lineNum)] = shift
    nextTop = extent.maxY - shift + gap
  })
  return shifts
}

function applyTabOnlyLineShifts(svg, shifts) {
  if (!svg || !shifts) return
  Object.keys(shifts).forEach(function(lineKey) {
    const shift = shifts[lineKey]
    if (!(Math.abs(shift) > 2)) return
    const lineNum = parseInt(lineKey, 10)
    const shifted = new Set()

    function shiftEl(el) {
      if (!el || shifted.has(el) || el.style.display === 'none') return
      if (isInstrumentLabelEl(el)) return
      shifted.add(el)
      applyTranslateY(el, -shift)
    }

    function shiftUnlessDescendantOfShifted(el) {
      if (!el) return
      let node = el.parentNode
      while (node && node !== svg) {
        if (shifted.has(node)) return
        node = node.parentNode
      }
      shiftEl(el)
    }

    topLevelLineElements(svg, lineNum).forEach(shiftEl)
    svg.querySelectorAll('g.abcjs-bar, g.abcjs-tabNumber, .tab-number, g.abcjs-staff').forEach(function(el) {
      if (lineIndexFromElement(el, svg) !== lineNum) return
      shiftUnlessDescendantOfShifted(el)
    })
  })
}
function mergeBBox(bounds, el) {
  if (!isVisible(el)) return bounds
  const box = readElementBox(el)
  if (!box) return bounds
  return {
    minX: Math.min(bounds.minX, box.x),
    minY: Math.min(bounds.minY, box.y),
    maxX: Math.max(bounds.maxX, box.x + box.width),
    maxY: Math.max(bounds.maxY, box.y + box.height),
  }
}

function walkVisibleBounds(el, bounds) {
  if (!el || el.style.display === 'none') return bounds
  let next = bounds
  next = mergeBBox(next, el)
  const stack = Array.prototype.slice.call(el.children || [])
  while (stack.length) {
    const child = stack.pop()
    if (!child) continue
    if (child.style && child.style.display === 'none') continue
    next = mergeBBox(next, child)
    if (child.children && child.children.length) {
      for (let i = child.children.length - 1; i >= 0; i--) {
        stack.push(child.children[i])
      }
    }
  }
  return next
}

export function cropSvgToVisibleContent(svg, padding, tabStaffVoices) {
  if (!svg) return
  const pad = padding == null ? TAB_CROP_PAD : padding
  const padTop = padding == null ? TAB_LABEL_LINE + TAB_CROP_PAD : pad
  let bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }

  function addBox(box, includeInMinY) {
    if (!box) return
    bounds.minX = Math.min(bounds.minX, box.x)
    if (includeInMinY !== false) {
      bounds.minY = Math.min(bounds.minY, box.y)
    }
    bounds.maxX = Math.max(bounds.maxX, box.x + box.width)
    bounds.maxY = Math.max(bounds.maxY, box.y + box.height)
  }

  if (tabStaffVoices && tabStaffVoices.size) {
    collectLineNumbers(svg).forEach(function(lineNum) {
      if (!lineHasVisibleTabNumbers(svg, lineNum)) return
      const notationVoices = notationVoicesOnLine(svg, lineNum)
      tabStaffsOnLine(svg, lineNum, tabStaffVoices).forEach(function(staffInfo, index) {
        if (!voiceHasTabNumbersOnLine(svg, lineNum, notationVoices[index])) return
        addBox(readStaffBox(staffInfo.staff) || staffInfo.box)
      })
      svg.querySelectorAll('g.abcjs-tabNumber, .tab-number').forEach(function(el) {
        if (el.style.display === 'none') return
        if (lineIndexFromElement(el, svg) !== lineNum) return
        addBox(readElementBox(el))
      })
      svg.querySelectorAll('g.abcjs-bar').forEach(function(el) {
        if (el.style.display === 'none') return
        if (lineIndexFromElement(el, svg) !== lineNum) return
        addBox(readElementBox(el), false)
      })
    })
    collectTabInstrumentLabels(svg).forEach(function(label) {
      if (label.style.display === 'none') return
      addBox(readElementBox(label))
    })
    svg.querySelectorAll('.abcjs-title, .abcjs-subtitle, .abcjs-composer').forEach(function(el) {
      if (el.style.display === 'none') return
      addBox(readElementBox(el))
    })
  }

  if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.minX)) {
    bounds = walkVisibleBounds(svg, {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    })
  }
  if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.minX)) return

  const width = bounds.maxX - bounds.minX + pad * 2
  const height = bounds.maxY - bounds.minY + padTop + pad
  svg.setAttribute('viewBox', [
    bounds.minX - pad,
    bounds.minY - padTop,
    width,
    height,
  ].join(' '))
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.height = height + 'px'
}

export function clearTabOnlyNotationDisplay(rootEl) {
  if (!rootEl) return
  const hadTabOnly = rootEl.classList.contains('notation-display-tab-only')
  rootEl.classList.remove('notation-display-tab-only')
  delete rootEl.dataset.tabOnlyApplied
  const svg = rootEl.querySelector('svg')
  if (!svg) return
  delete svg.dataset.tabOnlyApplied
  if (!hadTabOnly) return
  svg.querySelectorAll('[style*="display"]').forEach(function(el) {
    el.style.display = ''
  })
  svg.style.height = ''
  svg.removeAttribute('width')
  svg.removeAttribute('height')
}

/**
 * Re-align labels and crop after fit-to-height adjusts the SVG viewBox.
 * @param {HTMLElement} rootEl
 * @param {number} activeTabVoiceCount
 */
export function touchUpTabOnlyDisplay(rootEl, activeTabVoiceCount) {
  if (!rootEl || !activeTabVoiceCount) return
  const svg = rootEl.querySelector('svg')
  if (svg) delete svg.dataset.tabOnlyApplied
  applyTabOnlyNotationDisplay(rootEl, activeTabVoiceCount)
}

/**
 * @param {HTMLElement} rootEl notation container
 * @param {number} activeTabVoiceCount voices with tablature enabled
 */
export function applyTabOnlyNotationDisplay(rootEl, activeTabVoiceCount) {
  if (!rootEl || !activeTabVoiceCount) return
  const svg = rootEl.querySelector('svg')
  if (!svg) return
  if (svg.dataset.tabOnlyApplied === '1') return

  const tabStaffVoices = getTabStaffVoiceIndices(svg)
  if (!tabStaffVoices.size) return

  svg.dataset.tabOnlyApplied = '1'
  rootEl.classList.add('notation-display-tab-only')

  hideNonTabVoiceLayers(svg, tabStaffVoices)
  hideNonTabStaffs(svg, tabStaffVoices)
  hideNotationElements(svg)
  hideEmptyTabStaffs(svg, tabStaffVoices)
  compactTabOnlyVerticalSpacing(svg, tabStaffVoices)
  hideEmptyTabStaffs(svg, tabStaffVoices)
  trimBarlinesToTabStaff(svg, tabStaffVoices)
  hideOrphanBarlines(svg, tabStaffVoices)
  hideStaffBraceConnectors(svg, tabStaffVoices)
  hideStrayNotationGraphics(svg, tabStaffVoices)
  hideEmptyTabSystems(svg)
  hideOrphanBarlines(svg, tabStaffVoices)
  layoutTabInstrumentLabels(svg, tabStaffVoices)
  hideStrayNotationGraphics(svg, tabStaffVoices)
  cropSvgToVisibleContent(svg, null, tabStaffVoices)
}
