import { applyRhythmPreset } from './drumPatternPresets'
import { drumGuideOptionsFromTune } from './practiceTrackDrumGuide'

describe('practiceTrackDrumGuide', function() {
  test('drumGuideOptionsFromTune uses customPattern for user preset ids', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const tune = {
      playbackMetronomeEngine: 'drums',
      playbackMetronomeDrumRhythm: Object.assign({}, rhythm, {
        presetId: 'user-saved-1',
      }),
    }
    const opts = drumGuideOptionsFromTune(tune, {}, {})
    expect(opts.customPattern).toBe(tune.playbackMetronomeDrumRhythm.drumPattern)
    expect(opts.rhythm).toBe(tune.playbackMetronomeDrumRhythm)
  })

  test('drumGuideOptionsFromTune ignores built-in preset id', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const tune = {
      playbackMetronomeEngine: 'drums',
      playbackMetronomeDrumRhythm: rhythm,
    }
    const opts = drumGuideOptionsFromTune(tune, {}, { styleId: 'reel' })
    expect(opts.customPattern).toBeUndefined()
  })
})
