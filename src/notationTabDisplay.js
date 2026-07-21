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
]

function hideElements(root, selector) {
  root.querySelectorAll(selector).forEach(function(el) {
    el.style.display = 'none'
  })
}

function isVisible(el) {
  return el && el.style.display !== 'none'
}

function mergeBBox(bounds, el) {
  if (!isVisible(el)) return bounds
  try {
    const box = el.getBBox()
    if (!(box.width > 0) || !(box.height > 0)) return bounds
    return {
      minX: Math.min(bounds.minX, box.x),
      minY: Math.min(bounds.minY, box.y),
      maxX: Math.max(bounds.maxX, box.x + box.width),
      maxY: Math.max(bounds.maxY, box.y + box.height),
    }
  } catch (e) {
    return bounds
  }
}

function walkVisibleBounds(el, bounds) {
  if (!el || el.style.display === 'none') return bounds
  let next = bounds
  if (typeof el.getBBox === 'function') {
    next = mergeBBox(next, el)
  }
  for (let i = 0; i < el.children.length; i++) {
    next = walkVisibleBounds(el.children[i], next)
  }
  return next
}

export function cropSvgToVisibleContent(svg, padding) {
  if (!svg) return
  const pad = padding == null ? 6 : padding
  const bounds = walkVisibleBounds(svg, {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  })
  if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.minX)) return

  const width = bounds.maxX - bounds.minX + pad * 2
  const height = bounds.maxY - bounds.minY + pad * 2
  svg.setAttribute('viewBox', [
    bounds.minX - pad,
    bounds.minY - pad,
    width,
    height,
  ].join(' '))
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.height = height + 'px'
}

/**
 * @param {HTMLElement} rootEl notation container
 * @param {number} melodyVoiceCount voices with tab under them (notation staff index count)
 */
export function applyTabOnlyNotationDisplay(rootEl, melodyVoiceCount) {
  if (!rootEl || !melodyVoiceCount) return
  const svg = rootEl.querySelector('svg')
  if (!svg) return

  rootEl.classList.add('notation-display-tab-only')

  for (let voice = 0; voice < melodyVoiceCount; voice++) {
    hideElements(svg, 'g.abcjs-staff.abcjs-v' + voice)
    hideElements(svg, 'g.abcjs-staff-extra.abcjs-v' + voice)
  }

  NOTATION_HIDE_SELECTORS.forEach(function(selector) {
    hideElements(svg, selector)
  })

  cropSvgToVisibleContent(svg)
}
