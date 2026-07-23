import abcjs from 'abcjs'
import { buildTablatureRenderOptions } from './tablatureConfig'
import {
  applyTabOnlyNotationDisplay,
  measureTabOnlyLineShifts,
  getTabStaffVoiceIndices,
} from './notationTabDisplay'

function parseViewBox(svg) {
  const parts = (svg.getAttribute('viewBox') || svg.getAttribute('height') || '').split(/\s+/).map(Number)
  if (parts.length === 4) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
  }
  const height = parseFloat(svg.getAttribute('height') || '0')
  const width = parseFloat(svg.getAttribute('width') || '0')
  return { x: 0, y: 0, width: width, height: height }
}

describe('notationTabDisplayCompaction', () => {
  it('collapses notation whitespace above tab staves', () => {
    const tune = {
      tablature: 'guitar',
      tabDisplay: 'tab',
      voices: { '1': { notes: ['CDEF GABc |'] } },
    }
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nCDEF GABc |\n'
    const opts = buildTablatureRenderOptions(tune)
    const root = document.createElement('div')
    abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
    const svg = root.querySelector('svg')
    const shifts = measureTabOnlyLineShifts(svg, getTabStaffVoiceIndices(svg))
    expect(Object.keys(shifts).length).toBeGreaterThan(0)
    applyTabOnlyNotationDisplay(root, 1)
    const after = parseViewBox(svg)
    expect(after.height).toBeGreaterThan(0)
    expect(shifts['0']).toBeGreaterThan(20)
  })
})
