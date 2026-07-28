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
} from './playbackFillSettings'

describe('playbackFillSettings', function() {
  test('defaults to boom-chick', function() {
    expect(getPlaybackFillSettings(null)).toEqual({
      style: DEFAULT_FILL_STYLE,
      level: 100,
    })
    expect(getPlaybackFillSettings({})).toEqual({
      style: FILL_STYLE_BOOM_CHICK,
      level: 100,
    })
  })

  test('reads and applies tune fields', function() {
    const applied = applyPlaybackFillSettings({ id: 't1' }, {
      style: 'guitar-strum',
      level: 80,
    })
    expect(applied.playbackFillStyle).toBe('guitar-strum')
    expect(applied.playbackFillLevel).toBe(80)
    expect(getPlaybackFillSettings(applied)).toEqual({
      style: 'guitar-strum',
      level: 80,
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

  test('catalog includes classic guitar and orchestral groups', function() {
    const groups = listFillStyleGroups()
    expect(groups.map(function(g) { return g.id })).toEqual(['classic', 'guitar', 'orchestral'])
    expect(fillUsesAbcjsChords(FILL_STYLE_BOOM_CHICK)).toBe(true)
    expect(fillNeedsCustomTrack('orchestra')).toBe(true)
  })
})
