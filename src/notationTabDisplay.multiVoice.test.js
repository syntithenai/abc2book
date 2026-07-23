import abcjs from 'abcjs'
import { buildTablatureRenderOptions } from './tablatureConfig'
import {
  applyTabOnlyNotationDisplay,
  getTabStaffVoiceIndices,
  measureTabOnlyVoiceGaps,
} from './notationTabDisplay'

function staffBoxFromPaths(staff) {
  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  staff.querySelectorAll('path, line').forEach(function(node) {
    ;['y1', 'y2', 'y'].forEach(function(attr) {
      const value = parseFloat(node.getAttribute(attr))
      if (Number.isFinite(value)) {
        minY = Math.min(minY, value)
        maxY = Math.max(maxY, value)
      }
    })
    ;['x1', 'x'].forEach(function(attr) {
      const value = parseFloat(node.getAttribute(attr))
      if (Number.isFinite(value)) minX = Math.min(minX, value)
    })
  })
  return { x: minX, y: minY, height: maxY - minY }
}

function renderRaw(tune, abc) {
  const opts = buildTablatureRenderOptions(tune, {
    sourceTune: tune,
    voiceKeys: Object.keys(tune.voices || {}).sort(),
  })
  const root = document.createElement('div')
  abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true, staffwidth: 700 })
  return { root, svg: root.querySelector('svg'), opts }
}

function renderTabOnly(tune, abc) {
  const { root, svg, opts } = renderRaw(tune, abc)
  applyTabOnlyNotationDisplay(root, opts.filter(function(o) { return o && o.instrument }).length)
  return { root, svg, opts }
}

function staffSummary(svg) {
  return Array.from(svg.querySelectorAll('g.abcjs-staff')).map(function(s) {
    const cls = s.getAttribute('class') || ''
    return {
      voice: (cls.match(/abcjs-v(\d+)/) || [])[1],
      line: (cls.match(/abcjs-l(\d+)/) || [])[1],
      lines: s.querySelectorAll('path,line').length,
      display: s.style.display,
    }
  })
}

function labelSummary(svg) {
  return Array.from(svg.querySelectorAll('.abcjs-instrument-name, .instrument-name')).map(function(el) {
    const cls = el.getAttribute('class') || ''
    return {
      text: el.textContent.trim(),
      voice: (cls.match(/abcjs-v(\d+)/) || [])[1],
      line: (cls.match(/abcjs-l(\d+)/) || [])[1],
      display: el.style.display,
    }
  })
}

describe('notationTabDisplay multi-voice guitar + violin', () => {
  const tune = {
    tablatureVoices: {
      '1': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' },
      '2': { instrumentId: 'violin', presetId: 'standard', tuning: 'Standard' },
    },
    tabDisplay: 'tab',
    voices: {
      '1': { notes: ['A2A2^F2BE| GGFE |'] },
      '2': { notes: ['d2d2 f2a2| b2a2 f2d2 |'] },
    },
  }
  const abc = [
    'X:1',
    'T:Copper Kettle',
    'M:4/4',
    'L:1/8',
    'K:D',
    'V:1',
    'A2A2^F2BE| GGFE |',
    'V:2',
    'd2d2 f2a2| b2a2 f2d2 |',
  ].join('\n')

  it('keeps only tab staves visible', () => {
    const { svg } = renderTabOnly(tune, abc)
    const visible = staffSummary(svg).filter(function(s) { return s.display !== 'none' })
    visible.forEach(function(staff) {
      expect(staff.lines).not.toBe(5)
      expect(staff.lines).toBeGreaterThanOrEqual(4)
    })
    expect(visible.length).toBe(2)
  })

  it('places labels above the left edge of each tab staff', () => {
    const { svg } = renderTabOnly(tune, abc)
    const tabStaffVoices = getTabStaffVoiceIndices(svg)
    const visibleLabels = Array.from(svg.querySelectorAll('.abcjs-instrument-name, .instrument-name'))
      .filter(function(el) { return el.style.display !== 'none' })
    expect(visibleLabels.length).toBe(2)
    visibleLabels.forEach(function(label) {
      const text = label.textContent.trim()
      const lineCount = /violin/i.test(text) ? 4 : 6
      const staff = Array.from(svg.querySelectorAll('g.abcjs-staff')).find(function(s) {
        if (s.style.display === 'none') return false
        const voice = parseInt((s.getAttribute('class') || '').match(/abcjs-v(\d+)/)[1], 10)
        if (!tabStaffVoices.has(voice)) return false
        return s.querySelectorAll('path,line').length === lineCount
      })
      expect(staff).toBeTruthy()
      const staffBox = staffBoxFromPaths(staff)
      expect(label.getAttribute('text-anchor')).toBe('start')
      expect(parseFloat(label.getAttribute('x'))).toBeGreaterThanOrEqual(0)
      expect(parseFloat(label.getAttribute('y'))).toBeLessThan(staffBox.y)
    })
  })

  it('measures and closes the gap between tab voices on the same system', () => {
    const { root, svg } = renderRaw(tune, abc)
    const tabStaffVoices = getTabStaffVoiceIndices(svg)
    const before = measureTabOnlyVoiceGaps(svg, 0, tabStaffVoices)
    expect(Object.keys(before).length).toBeGreaterThan(0)
    expect(before['1'] || before['0']).toBeGreaterThan(20)
    const rawHeight = parseFloat(svg.getAttribute('height') || '0')
    applyTabOnlyNotationDisplay(root, 2)
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
    expect(vb[3]).toBeGreaterThan(0)
    expect(vb[3]).toBeLessThan(rawHeight * 0.75)
  })

  it('shows an instrument label per tab voice', () => {
    const { svg } = renderTabOnly(tune, abc)
    const visible = labelSummary(svg).filter(function(l) { return l.display !== 'none' })
    const texts = visible.map(function(l) { return l.text })
    expect(texts.some(function(t) { return /guitar/i.test(t) })).toBe(true)
    expect(texts.some(function(t) { return /violin/i.test(t) })).toBe(true)
    expect(visible.length).toBe(2)
  })

  it('hides instrument labels that are not placed on a visible tab staff', () => {
    const longAbc = [
      'X:1', 'T:t', 'M:4/4', 'L:1/8', 'K:D', 'V:1',
      'A2A2^F2BE| GGFE | A2A2^F2BE| GGFE |',
      'A2A2^F2BE| GGFE | A2A2^F2BE| GGFE |',
      'V:2',
      'd2d2 f2a2| b2a2 f2d2 | d2d2 f2a2| b2a2 f2d2 |',
      'd2d2 f2a2| b2a2 f2d2 | d2d2 f2a2| b2a2 f2d2 |',
    ].join('\n')
    const { svg } = renderTabOnly(tune, longAbc)
    const visibleLabels = labelSummary(svg).filter(function(l) { return l.display !== 'none' })
    const visibleStaffs = staffSummary(svg).filter(function(s) { return s.display !== 'none' })
    expect(visibleLabels.length).toBe(visibleStaffs.length)
    svg.querySelectorAll('.abcjs-instrument-name, .instrument-name').forEach(function(label) {
      if (label.style.display === 'none') return
      expect(label.dataset.tabOnlyLabel).toBe('1')
      expect(label.getAttribute('transform')).toBeNull()
    })
  })

  it('identifies both tab staff voices', () => {
    const root = document.createElement('div')
    const opts = buildTablatureRenderOptions(tune, { sourceTune: tune, voiceKeys: ['1', '2'] })
    abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
    const tabStaffVoices = getTabStaffVoiceIndices(root.querySelector('svg'))
    expect([...tabStaffVoices].sort()).toEqual([2, 3])
  })

  it('stacks multi-system layouts without orphan notation staves', () => {
    const longAbc = [
      'X:1',
      'T:Copper Kettle',
      'M:4/4',
      'L:1/8',
      'K:D',
      'V:1',
      'A2A2^F2BE| GGFE | A2A2^F2BE| GGFE |',
      'A2A2^F2BE| GGFE | A2A2^F2BE| GGFE |',
      'V:2',
      'd2d2 f2a2| b2a2 f2d2 | d2d2 f2a2| b2a2 f2d2 |',
      'd2d2 f2a2| b2a2 f2d2 | d2d2 f2a2| b2a2 f2d2 |',
    ].join('\n')
    const opts = buildTablatureRenderOptions(tune, { sourceTune: tune, voiceKeys: ['1', '2'] })
    const { svg } = renderTabOnly(tune, longAbc)
    const visibleStaffs = staffSummary(svg).filter(function(s) { return s.display !== 'none' })
    expect(visibleStaffs.every(function(s) { return s.lines !== 5 })).toBe(true)
    expect(visibleStaffs.length).toBeGreaterThanOrEqual(4)
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
    expect(vb.length).toBe(4)
    expect(vb[3]).toBeGreaterThan(0)
    expect(svg.querySelectorAll('.tab-number').length).toBeGreaterThan(0)
  })
})
