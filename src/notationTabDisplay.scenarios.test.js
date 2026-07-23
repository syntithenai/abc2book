import abcjs from 'abcjs'
import { buildTablatureRenderOptions } from './tablatureConfig'
import {
  applyTabOnlyNotationDisplay,
  getTabStaffVoiceIndices,
} from './notationTabDisplay'

function renderTabOnly(tune, abc) {
  const opts = buildTablatureRenderOptions(tune)
  const root = document.createElement('div')
  abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
  applyTabOnlyNotationDisplay(root, opts.filter(function(o) { return o && o.instrument }).length)
  return { root: root, svg: root.querySelector('svg'), opts: opts }
}

function visibleStaffs(svg) {
  return Array.from(svg.querySelectorAll('g.abcjs-staff')).filter(function(s) {
    return s.style.display !== 'none'
  }).map(function(s) {
    const m = (s.getAttribute('class') || '').match(/abcjs-v(\d+)/)
    return { voice: m ? parseInt(m[1], 10) : -1, lines: s.querySelectorAll('path,line').length }
  })
}

describe('notationTabDisplay scenarios', () => {
  it('multi-voice tab on voice 2 only', () => {
    const tune = {
      tablatureVoices: { '2': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' } },
      voices: { '1': { notes: ['| "C" z2 "G" z |'] }, '2': { notes: ['CDEF GABc |'] } },
    }
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1\n| "C" z2 "G" z |\nV:2\nCDEF GABc |\n'
    const { svg } = renderTabOnly(tune, abc)
    const visible = visibleStaffs(svg)
    expect(visible).toHaveLength(1)
    expect(visible[0].lines).toBeGreaterThanOrEqual(6)
  })

  it('single voice with guitar tab', () => {
    const tune = {
      tablature: 'guitar',
      tabDisplay: 'tab',
      voices: { '1': { notes: ['CDEF GABc |'] } },
    }
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nCDEF GABc |\n'
    const { svg } = renderTabOnly(tune, abc)
    const visible = visibleStaffs(svg)
    expect(visible).toHaveLength(1)
    expect(visible[0].lines).toBeGreaterThanOrEqual(6)
    expect(svg.querySelectorAll('.tab-number').length).toBeGreaterThan(0)
  })

  it('both voices with guitar tab', () => {
    const tune = {
      tablatureVoices: {
        '1': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' },
        '2': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' },
      },
      voices: {
        '1': { notes: ['CDEF G2 |'] },
        '2': { notes: ['GABc d2 |'] },
      },
    }
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1\nCDEF G2 |\nV:2\nGABc d2 |\n'
    const { svg } = renderTabOnly(tune, abc)
    const tabStaffVoices = getTabStaffVoiceIndices(svg)
    expect([...tabStaffVoices].sort()).toEqual([2, 3])
    const visible = visibleStaffs(svg)
    expect(visible.length).toBe(2)
    visible.forEach(function(staff) {
      expect(staff.lines).toBeGreaterThanOrEqual(6)
    })
    expect(svg.querySelectorAll('.tab-number').length).toBeGreaterThan(0)
  })
})
