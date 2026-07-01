import {
  noteNameToMidi,
  midiToFrequency,
  targetFrequenciesForPreset,
  nearestStringForFrequency,
  centsForActiveString,
  harmonicTargetForOpenString,
  wrongStringWarning,
  centsBetween
} from './tunerTuningUtils'
import { getPreset } from './instrumentTuningPresets'

describe('tunerTuningUtils', () => {
  it('converts G3 to correct MIDI and frequency at A4=440', () => {
    expect(noteNameToMidi('G3')).toBe(55)
    expect(midiToFrequency(69, 440)).toBeCloseTo(440, 1)
    expect(midiToFrequency(55, 440)).toBeCloseTo(196, 0)
  })

  it('uses custom A4 reference', () => {
    expect(midiToFrequency(69, 442)).toBeCloseTo(442, 1)
  })

  it('builds calico AEAC# targets', () => {
    const preset = getPreset('mandolin', 'aeacSharp')
    const targets = targetFrequenciesForPreset(preset, 440)
    expect(targets.map((t) => t.note)).toEqual(['A3', 'E4', 'A4', 'C#5'])
    expect(targets[3].frequency).toBeCloseTo(midiToFrequency(noteNameToMidi('C#5'), 440), 1)
  })

  it('matches nearest string for bouzouki GDAD', () => {
    const preset = getPreset('bouzouki', 'gdad')
    const d3 = midiToFrequency(noteNameToMidi('D3'), 440)
    const match = nearestStringForFrequency(d3, preset, 440)
    expect(match.stringIndex).toBe(1)
    expect(Math.abs(match.cents)).toBeLessThan(5)
  })

  it('harmonic target is double open frequency', () => {
    const open = 196
    expect(harmonicTargetForOpenString(open)).toBe(392)
  })

  it('detects wrong string warning', () => {
    const preset = getPreset('mandolin', 'gdae')
    const d4 = midiToFrequency(noteNameToMidi('D4'), 440)
    const warn = wrongStringWarning(0, d4, preset, 440)
    expect(warn).not.toBeNull()
    expect(warn.detectedNote).toMatch(/D4/)
    expect(warn.message).toMatch(/are you on/)
  })

  it('suppresses wrong string when on correct string', () => {
    const preset = getPreset('mandolin', 'gdae')
    const g3 = midiToFrequency(noteNameToMidi('G3'), 440)
    const warn = wrongStringWarning(0, g3, preset, 440)
    expect(warn).toBeNull()
  })

  it('centsBetween is symmetric around target', () => {
    const target = 440
    expect(centsBetween(target * 1.01, target)).toBeGreaterThan(0)
    expect(centsBetween(target * 0.99, target)).toBeLessThan(0)
  })
})
