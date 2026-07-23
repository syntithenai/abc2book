import abcjs from 'abcjs'
import { buildTablatureRenderOptions } from './tablatureConfig'
import {
  applyTabOnlyNotationDisplay,
  getTabStaffVoiceIndices,
} from './notationTabDisplay'

function voiceFromClass(className) {
  const match = String(className || '').match(/\babcjs-v(\d+)\b/)
  return match ? parseInt(match[1], 10) : null
}

function lineFromClass(className) {
  const match = String(className || '').match(/\babcjs-l(\d+)\b/)
  return match ? parseInt(match[1], 10) : null
}

function staffLineCount(staff) {
  return staff.querySelectorAll('path, line, polyline').length
}

describe('notationTabDisplay integration', () => {
  it('identifies tab staff separately from notation staff on multi-voice tunes', () => {
    const opts = buildTablatureRenderOptions({
      tablatureVoices: { '2': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' } },
      voices: {
        '1': { notes: ['| "C" z2 "G" z |'] },
        '2': { notes: ['CDEF GABc |'] },
      },
    })
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1\n| "C" z2 "G" z |\nV:2\nCDEF GABc |\n'
    const root = document.createElement('div')
    abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
    const svg = root.querySelector('svg')
    expect(svg).toBeTruthy()

    const tabStaffVoices = getTabStaffVoiceIndices(svg)
    expect(tabStaffVoices.size).toBeGreaterThan(0)

    const staffs = Array.from(svg.querySelectorAll('g.abcjs-staff')).map(function(staff) {
      return {
        voice: voiceFromClass(staff.getAttribute('class')),
        line: lineFromClass(staff.getAttribute('class')),
        lines: staffLineCount(staff),
      }
    })
    const tabStaff = staffs.filter(function(s) { return tabStaffVoices.has(s.voice) })
    expect(tabStaff.every(function(s) { return s.lines >= 6 })).toBe(true)
  })

  it('keeps tab string lines visible after tab-only processing', () => {
    const opts = buildTablatureRenderOptions({
      tablatureVoices: { '2': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' } },
      voices: {
        '1': { notes: ['| "C" z2 "G" z |'] },
        '2': { notes: ['CDEF GABc |'] },
      },
    })
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1\n| "C" z2 "G" z |\nV:2\nCDEF GABc |\n'
    const root = document.createElement('div')
    abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
    applyTabOnlyNotationDisplay(root, 1)

    const svg = root.querySelector('svg')
    const tabStaffVoices = getTabStaffVoiceIndices(svg)
    tabStaffVoices.forEach(function(voiceIndex) {
      const staff = svg.querySelector('g.abcjs-staff[class*="abcjs-v' + voiceIndex + '"]')
      expect(staff).toBeTruthy()
      expect(staff.style.display).not.toBe('none')
      expect(staffLineCount(staff)).toBeGreaterThanOrEqual(6)
    })
    expect(svg.querySelectorAll('.tab-number, .abcjs-tabNumber').length).toBeGreaterThan(0)
  })
})
