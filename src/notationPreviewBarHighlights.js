/** Map 1-based global bar number to abcjs line/measure classes (wrap layout). */
export function barNumberToAbcjsLayout(barNumber, measuresPerLine) {
  const perLine = Math.max(1, parseInt(measuresPerLine, 10) || 4)
  const bar = Math.max(1, parseInt(barNumber, 10) || 1)
  const index = bar - 1
  return {
    lineIndex: Math.floor(index / perLine),
    measureIndex: index % perLine,
  }
}

export function sortedTuneVoiceKeys(tune) {
  if (!tune || !tune.voices) return []
  return Object.keys(tune.voices).sort()
}

const HIGHLIGHT_COLORS = {
  source: '#198754',
  unpairedSource: '#dc3545',
}

function isDrawableNoteGroup(el) {
  if (!el || !el.classList) return false
  const classes = Array.from(el.classList)
  return classes.some(function(c) { return c.indexOf('abcjs-note') >= 0 })
    || classes.some(function(c) { return c.indexOf('abcjs-rest') >= 0 })
}

function isNoteheadNode(node) {
  const cls = String(node.getAttribute('class') || '')
  if (cls.indexOf('stem') >= 0
    || cls.indexOf('flag') >= 0
    || cls.indexOf('ledger') >= 0
    || cls.indexOf('dot') >= 0) {
    return false
  }
  const tag = node.tagName ? node.tagName.toLowerCase() : ''
  return tag === 'path' || tag === 'ellipse' || tag === 'circle' || tag === 'use'
}

function noteheadCenterY(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return 0
  const rect = node.getBoundingClientRect()
  return rect.top + rect.height / 2
}

function collectNoteheads(slotEl) {
  if (!slotEl) return []
  const heads = []
  slotEl.querySelectorAll('path, ellipse, circle, use').forEach(function(node) {
    if (!isNoteheadNode(node)) return
    const rect = node.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2 || rect.height > 24 || rect.width > 30) return
    if (rect.height > rect.width * 2.4) return
    heads.push(node)
  })
  return heads.sort(function(a, b) {
    return noteheadCenterY(b) - noteheadCenterY(a)
  })
}

function paintNode(node, color) {
  if (!node || !color) return
  node.style.fill = color
  if (node.tagName === 'line' || node.getAttribute('stroke')) {
    node.style.stroke = color
  }
}

function paintSlotSourcePitches(slotEl, slot, color) {
  if (!slotEl || !slot || !(slot.sourcePitchCount > 0)) return
  const heads = collectNoteheads(slotEl)
  if (!heads.length) {
    paintNode(slotEl.querySelector('path, ellipse, circle, use'), color)
    return
  }
  const targetCount = Math.max(0, parseInt(slot.targetPitchCount, 10) || 0)
  const sourceCount = Math.max(0, parseInt(slot.sourcePitchCount, 10) || 0)
  for (let i = targetCount; i < targetCount + sourceCount && i < heads.length; i += 1) {
    paintNode(heads[i], color)
  }
}

function findBarSlotElement(svg, voiceKeys, slot, measuresPerLine) {
  const voiceIndex = voiceKeys.indexOf(String(slot.voiceKey))
  if (voiceIndex < 0) return null
  const layout = barNumberToAbcjsLayout(slot.barNumber, measuresPerLine)
  const lineClass = 'abcjs-l' + layout.lineIndex
  const measureClass = 'abcjs-mm' + layout.measureIndex
  const voiceClass = 'abcjs-v' + voiceIndex
  const candidates = Array.from(svg.querySelectorAll('g')).filter(function(g) {
    if (!isDrawableNoteGroup(g)) return false
    const classes = Array.from(g.classList)
    return classes.indexOf(voiceClass) >= 0
      && classes.indexOf(lineClass) >= 0
      && classes.indexOf(measureClass) >= 0
  })
  return candidates[slot.slotIndex] || null
}

/**
 * Highlight scratchpad pitches in an abcjs preview SVG.
 * highlights: { source?: Slot[], unpairedSource?: Slot[] }
 * Each slot includes targetPitchCount and sourcePitchCount for chords.
 */
export function applyBarSlotHighlights(previewHost, highlights, tune, options) {
  if (!previewHost || !highlights || !tune) return
  const svg = previewHost.querySelector('svg')
  if (!svg) return

  const measuresPerLine = (options && options.measuresPerLine) || 4
  const voiceKeys = sortedTuneVoiceKeys(tune)
  const source = Array.isArray(highlights.source) ? highlights.source : []
  const unpairedSource = Array.isArray(highlights.unpairedSource) ? highlights.unpairedSource : []

  source.forEach(function(slot) {
    paintSlotSourcePitches(
      findBarSlotElement(svg, voiceKeys, slot, measuresPerLine),
      slot,
      HIGHLIGHT_COLORS.source
    )
  })
  unpairedSource.forEach(function(slot) {
    const slotEl = findBarSlotElement(svg, voiceKeys, slot, measuresPerLine)
    const heads = collectNoteheads(slotEl)
    if (heads.length) {
      heads.forEach(function(head) { paintNode(head, HIGHLIGHT_COLORS.unpairedSource) })
    } else {
      paintNode(slotEl && slotEl.querySelector('path, ellipse, circle, use'), HIGHLIGHT_COLORS.unpairedSource)
    }
  })
}
