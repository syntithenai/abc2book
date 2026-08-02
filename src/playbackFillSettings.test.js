import {
  DEFAULT_FILL_STYLE,
  FILL_STYLE_OFF,
  FILL_STYLE_BOOM_CHICK,
  getPlaybackFillSettings,
  applyPlaybackFillSettings,
  normalizeFillStyle,
  normalizeFillLevel,
  fillUsesAbcjsChords,
  fillNeedsCustomTrack,
  resolveFillPlaybackOptions,
  listFillStyleGroups,
  hasStoredDrumRhythm,
} from './playbackFillSettings'
import { applyRhythmPreset } from './drumPatternPresets'
import { serializePlaybackMetronomeRhythmStore } from './playbackMetronomeSettings'
import { ENGINE_MODE_DRUMS } from './rhythmEngineTypes'

describe('playbackFillSettings', function() {
  test('defaults to boom-chick', function() {
    expect(getPlaybackFillSettings(null)).toEqual({
      style: DEFAULT_FILL_STYLE,
      level: 100,
      followDrumGroove: false,
    })
    expect(getPlaybackFillSettings({})).toEqual({
      style: FILL_STYLE_BOOM_CHICK,
      level: 100,
      followDrumGroove: false,
    })
  })

  test('reads and applies tune fields including followDrumGroove', function() {
    const applied = applyPlaybackFillSettings({ id: 't1' }, {
      style: 'guitar-strum',
      level: 80,
      followDrumGroove: true,
    })
    expect(applied.playbackFillStyle).toBe('guitar-strum')
    expect(applied.playbackFillLevel).toBe(80)
    expect(applied.playbackFillFollowDrumGroove).toBe(true)
    expect(getPlaybackFillSettings(applied)).toEqual({
      style: 'guitar-strum',
      level: 80,
      followDrumGroove: true,
    })
  })

  test('normalizeFillStyle falls back for unknown values', function() {
    expect(normalizeFillStyle('not-a-style')).toBe(FILL_STYLE_BOOM_CHICK)
    expect(normalizeFillStyle('strings-pad')).toBe('strings-pad')
  })

  test('normalizeFillLevel clamps range', function() {
    expect(normalizeFillLevel(-5)).toBe(100)
    expect(normalizeFillLevel(200)).toBe(150)
    expect(normalizeFillLevel(50)).toBe(50)
  })

  test('resolveFillPlaybackOptions maps styles to playback mode', function() {
    expect(resolveFillPlaybackOptions({ playbackFillStyle: FILL_STYLE_OFF }).chordsOff).toBe(true)
    expect(resolveFillPlaybackOptions({ playbackFillStyle: FILL_STYLE_BOOM_CHICK }).chordsOff).toBe(false)
    expect(resolveFillPlaybackOptions({ playbackFillStyle: 'fingerpick' }).injectCustomFill).toBe(true)
    expect(resolveFillPlaybackOptions({ playbackFillStyle: 'fingerpick' }).chordsOff).toBe(true)
  })

  test('resolveFillPlaybackOptions includes rhythmContext when followDrumGroove is enabled', function() {
    const drumRhythm = applyRhythmPreset('rock-basic')
    const tune = {
      playbackFillStyle: 'fingerpick',
      playbackFillFollowDrumGroove: true,
      playbackMetronomeDrumRhythm: serializePlaybackMetronomeRhythmStore(drumRhythm, ENGINE_MODE_DRUMS),
    }
    const options = resolveFillPlaybackOptions(tune, null)
    expect(options.rhythmContext).not.toBeNull()
    expect(options.rhythmContext.slotsPerBar).toBe(16)
  })

  test('hasStoredDrumRhythm detects saved drum pattern', function() {
    const drumRhythm = applyRhythmPreset('rock-basic')
    expect(hasStoredDrumRhythm({
      playbackMetronomeDrumRhythm: serializePlaybackMetronomeRhythmStore(drumRhythm, ENGINE_MODE_DRUMS),
    })).toBe(true)
    expect(hasStoredDrumRhythm({})).toBe(false)
  })

  test('catalog includes classic guitar orchestral rhythmic and ensemble groups', function() {
    const groups = listFillStyleGroups()
    expect(groups.map(function(g) { return g.id })).toEqual([
      'classic', 'guitar', 'orchestral', 'rhythmic', 'combo',
    ])
    expect(fillUsesAbcjsChords(FILL_STYLE_BOOM_CHICK)).toBe(true)
    expect(fillNeedsCustomTrack('orchestra')).toBe(true)
    expect(fillNeedsCustomTrack('jig-bass')).toBe(true)
    expect(fillNeedsCustomTrack('fiddle-bass')).toBe(true)
  })
})
