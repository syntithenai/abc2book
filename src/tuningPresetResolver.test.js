import {
  resolvePresetFromText,
  resolvePresetFromTuneName,
  resolvePresetForTune,
  canonicalTuningLabel
} from './tuningPresetResolver'
import { getPreset } from './instrumentTuningPresets'

describe('tuningPresetResolver', () => {
  it('matches GDAD text', () => {
    const r = resolvePresetFromText('GDAD')
    expect(r).not.toBeNull()
    expect(r.presetId).toBe('gdad')
  })

  it('matches Calico alias case-insensitively', () => {
    const r = resolvePresetFromText('calico')
    expect(r).not.toBeNull()
    expect(r.instrument).toBe('violin')
    expect(r.presetId).toBe('aeacSharp')
  })

  it('matches AEAC# pitch', () => {
    const r = resolvePresetFromText('AEAC#')
    expect(r).not.toBeNull()
    expect(r.presetId).toBe('aeacSharp')
  })

  it('matches cross A alias', () => {
    const r = resolvePresetFromText('cross A')
    expect(r).not.toBeNull()
    expect(r.presetId).toBe('aeae')
  })

  it('matches DADGAD for guitar', () => {
    const r = resolvePresetFromText('DADGAD')
    expect(r).not.toBeNull()
    expect(r.instrument).toBe('guitar')
    expect(r.presetId).toBe('dadgad')
  })

  it('resolves Black Mountain Rag from tune name', () => {
    const r = resolvePresetFromTuneName('Black Mountain Rag')
    expect(r.presetId).toBe('aeacSharp')
  })

  it('resolves Bonaparte Retreat from tune name', () => {
    const r = resolvePresetFromTuneName("Bonaparte's Retreat")
    expect(r.presetId).toBe('ddad')
  })

  it('resolvePresetForTune prefers tuning field', () => {
    const r = resolvePresetForTune({ name: 'Random Tune', tuning: 'DADGAD' })
    expect(r.presetId).toBe('dadgad')
  })

  it('canonicalTuningLabel returns primary label', () => {
    const p = getPreset('mandolin', 'aeacSharp')
    expect(canonicalTuningLabel(p)).toBe('Calico (AEAC#)')
  })
})
