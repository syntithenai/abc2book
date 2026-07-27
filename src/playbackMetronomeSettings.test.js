import {
  defaultPlaybackMetronomeSettings,
  getPlaybackMetronomeSettings,
  applyPlaybackMetronomeCountInFields,
  applyPlaybackMetronomeSettings,
  hasCustomPlaybackMetronomeRhythm,
  resolveTuneTimeSignature,
  resolveMetronomeSettingsTune,
  readPlaybackMetronomeRhythmStores,
  alignPlaybackRhythmToMeter,
  meterDenominator,
} from './playbackMetronomeSettings'
import { rhythmFromPreset, slotsPerBar } from './metronomeRhythmPresets'
import { normalizeRhythmConfig, ENGINE_MODE_CLICK, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'
import { applyRhythmPreset } from './drumPatternPresets'

function expectRhythmPreset(actual, presetId) {
  expect(actual).toEqual(normalizeRhythmConfig(rhythmFromPreset(presetId)))
}

describe('playbackMetronomeSettings', function() {
  test('resolveTuneTimeSignature prefers tune meter', function() {
    expect(resolveTuneTimeSignature({ meter: '3/4' }, null)).toBe('3/4')
  })

  test('resolveTuneTimeSignature falls back to tune type via tunebook', function() {
    const tunebook = {
      abcTools: {
        getTuneMeter: function() { return '6/8' },
        timeSignatureFromTuneType: function() { return '4/4' },
      },
    }
    expect(resolveTuneTimeSignature({ rhythm: 'Jig' }, tunebook)).toBe('6/8')
  })

  test('defaultPlaybackMetronomeSettings derives rhythm from meter', function() {
    const settings = defaultPlaybackMetronomeSettings({ meter: '3/4' })
    expectRhythmPreset(settings.rhythm, '3-4')
  })

  test('defaultPlaybackMetronomeSettings handles ABC common time', function() {
    const settings = defaultPlaybackMetronomeSettings({ meter: 'C' })
    expectRhythmPreset(settings.rhythm, '4-4')
  })

  test('meterDenominator parses simple and common-time tokens', function() {
    expect(meterDenominator('3/4')).toBe(4)
    expect(meterDenominator('C')).toBe(4)
    expect(meterDenominator('6/8')).toBe(8)
  })

  test('alignPlaybackRhythmToMeter corrects compound pulses on simple meters', function() {
    const compound = normalizeRhythmConfig(rhythmFromPreset('9-8'))
    const aligned = alignPlaybackRhythmToMeter(compound, '3/4')
    expect(slotsPerBar(aligned)).toBe(3)
    expect(aligned.pulsesPerBeat).toEqual([1, 1, 1])
  })

  test('alignPlaybackRhythmToMeter preserves drum preset id when realigning grid', function() {
    const drumRhythm = applyRhythmPreset('rock-basic')
    const aligned = alignPlaybackRhythmToMeter(drumRhythm, '3/4')
    expect(aligned.presetId).toBe('rock-basic')
    expect(aligned.beatsPerBar).toBe(3)
    expect(slotsPerBar(aligned)).toBe(3)
  })

  test('alignPlaybackRhythmToMeter leaves compound meters unchanged', function() {
    const jig = normalizeRhythmConfig(rhythmFromPreset('6-8'))
    const aligned = alignPlaybackRhythmToMeter(jig, '6/8')
    expect(slotsPerBar(aligned)).toBe(6)
  })

  test('alignPlaybackRhythmToMeter corrects stale 4/4 rhythm on compound meter', function() {
    const wrong = normalizeRhythmConfig(rhythmFromPreset('4-4'))
    const aligned = alignPlaybackRhythmToMeter(wrong, '6/8')
    expect(slotsPerBar(aligned)).toBe(6)
    expect(aligned.beatsPerBar).toBe(2)
    expect(aligned.pulsesPerBeat).toEqual([3, 3])
  })

  test('getPlaybackMetronomeSettings aligns rhythm to meter', function() {
    const fromMeter = getPlaybackMetronomeSettings({ meter: '6/8' })
    expectRhythmPreset(fromMeter.rhythm, '6-8')

    const customized = getPlaybackMetronomeSettings({
      meter: '6/8',
      playbackMetronomeRhythm: { beatsPerBar: 4, accents: [1], pulsesPerBeat: [1, 1, 1, 1] },
    })
    expect(customized.rhythm.beatsPerBar).toBe(2)
    expect(slotsPerBar(customized.rhythm)).toBe(6)
    expect(customized.rhythm.pulsesPerBeat).toEqual([3, 3])
  })

  test('hasCustomPlaybackMetronomeRhythm detects saved overrides only', function() {
    expect(hasCustomPlaybackMetronomeRhythm({ meter: '3/4' })).toBe(false)
    expect(hasCustomPlaybackMetronomeRhythm({
      playbackMetronomeRhythm: { beatsPerBar: 3, accents: [1, 0, 0], pulsesPerBeat: [1, 1, 1] },
    })).toBe(true)
  })

  test('defaultPlaybackMetronomeSettings disables during playback by default', function() {
    const settings = defaultPlaybackMetronomeSettings({ meter: '4/4' })
    expect(settings.duringPlayback).toBe(false)
  })

  test('getPlaybackMetronomeSettings reads duringPlayback from tune', function() {
    expect(getPlaybackMetronomeSettings({ meter: '4/4' }).duringPlayback).toBe(false)
    expect(getPlaybackMetronomeSettings({
      meter: '4/4',
      playbackMetronomeDuringPlayback: true,
    }).duringPlayback).toBe(true)
  })

  test('applyPlaybackMetronomeCountInFields persists duringPlayback', function() {
    const updated = applyPlaybackMetronomeCountInFields(
      { id: 't1', meter: '4/4' },
      { countIn: true, countInBars: 2, duringPlayback: true }
    )
    expect(updated.playbackMetronomeDuringPlayback).toBe(true)
    expect(updated.playbackMetronomeCountInBars).toBe(2)
  })

  test('resolveMetronomeSettingsTune prefers tunes collection over stale candidate', function() {
    const canonical = {
      id: 't1',
      meter: '4/4',
      playbackMetronomeDuringPlayback: true,
    }
    const resolved = resolveMetronomeSettingsTune(
      { id: 't1', meter: '4/4' },
      { tunes: { t1: canonical } }
    )
    expect(resolved).toBe(canonical)
    expect(getPlaybackMetronomeSettings(resolved).duringPlayback).toBe(true)
  })

  test('resolveMetronomeSettingsTune reads duringPlayback from ABC comments', function() {
    const abcTools = {
      abc2json: function(abc) {
        if (abc.indexOf('during-playback true') >= 0) {
          return { id: 't1', meter: '4/4', playbackMetronomeDuringPlayback: true }
        }
        return { id: 't1', meter: '4/4' }
      },
    }
    const resolved = resolveMetronomeSettingsTune(
      { id: 't1', meter: '4/4' },
      {
        abc: '% abcbook-playback-metronome-during-playback true\nX:1',
        abcTools: abcTools,
      }
    )
    expect(getPlaybackMetronomeSettings(resolved).duringPlayback).toBe(true)
  })

  test('applyPlaybackMetronomeSettings keeps drum rhythm when switching to click', function() {
    const drumRhythm = applyRhythmPreset('rock-basic')
    const clickRhythm = normalizeRhythmConfig(rhythmFromPreset('3-4'))
    const tune = { id: 't1', meter: '3/4' }

    const withDrums = applyPlaybackMetronomeSettings(tune, {
      countIn: true,
      countInBars: 1,
      duringPlayback: false,
      rhythm: drumRhythm,
      clickRhythm: clickRhythm,
      drumRhythm: drumRhythm,
      engine: ENGINE_MODE_DRUMS,
    })

    const withClick = applyPlaybackMetronomeSettings(withDrums, {
      countIn: true,
      countInBars: 1,
      duringPlayback: false,
      rhythm: clickRhythm,
      clickRhythm: clickRhythm,
      drumRhythm: drumRhythm,
      engine: ENGINE_MODE_CLICK,
    })

    const restored = getPlaybackMetronomeSettings(withClick)
    expect(restored.engine).toBe(ENGINE_MODE_CLICK)
    expect(restored.rhythm.engineMode).toBe(ENGINE_MODE_CLICK)
    expect(restored.drumRhythm.presetId).toBe('rock-basic')
    expect(restored.drumRhythm.drumPattern).toBeTruthy()
    expect(restored.clickRhythm.beatsPerBar).toBe(3)
  })

  test('readPlaybackMetronomeRhythmStores migrates legacy drum rhythm field', function() {
    const drumRhythm = applyRhythmPreset('funk-16ths')
    const stores = readPlaybackMetronomeRhythmStores({
      meter: '4/4',
      playbackMetronomeRhythm: drumRhythm,
      playbackMetronomeEngine: ENGINE_MODE_DRUMS,
      playbackMetronomePresetId: 'funk-16ths',
    })
    expect(stores.activeEngine).toBe(ENGINE_MODE_DRUMS)
    expect(stores.drumRhythm.presetId).toBe('funk-16ths')
    expect(stores.clickRhythm.engineMode).toBe(ENGINE_MODE_CLICK)
  })
})
