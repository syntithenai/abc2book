import {
  defaultPlaybackMetronomeSettings,
  getPlaybackMetronomeSettings,
  hasCustomPlaybackMetronomeRhythm,
  resolveTuneTimeSignature,
} from './playbackMetronomeSettings'
import { rhythmFromPreset } from './metronomeRhythmPresets'

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
    expect(settings.rhythm).toEqual(rhythmFromPreset('3-4'))
  })

  test('defaultPlaybackMetronomeSettings handles ABC common time', function() {
    const settings = defaultPlaybackMetronomeSettings({ meter: 'C' })
    expect(settings.rhythm).toEqual(rhythmFromPreset('4-4'))
  })

  test('getPlaybackMetronomeSettings uses meter until rhythm is customized', function() {
    const fromMeter = getPlaybackMetronomeSettings({ meter: '6/8' })
    expect(fromMeter.rhythm).toEqual(rhythmFromPreset('6-8'))

    const customized = getPlaybackMetronomeSettings({
      meter: '6/8',
      playbackMetronomeRhythm: { beatsPerBar: 4, accents: [1], pulsesPerBeat: [1, 1, 1, 1] },
    })
    expect(customized.rhythm.beatsPerBar).toBe(4)
  })

  test('hasCustomPlaybackMetronomeRhythm detects saved overrides only', function() {
    expect(hasCustomPlaybackMetronomeRhythm({ meter: '3/4' })).toBe(false)
    expect(hasCustomPlaybackMetronomeRhythm({
      playbackMetronomeRhythm: { beatsPerBar: 3, accents: [1, 0, 0], pulsesPerBeat: [1, 1, 1] },
    })).toBe(true)
  })
})
