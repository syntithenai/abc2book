import {
  buildPlaybackTimingMap,
  timingAtMusicSeconds,
} from './playbackTimingMap'
import { visualFromAbc } from './testFixtures/rhythmTimingFixtures'
import { rhythmFromPreset, slotsPerBar } from './metronomeRhythmPresets'

function abcWithSections(lines) {
  return [
    'X:1',
    'T:Timing map test',
    'M:4/4',
    'L:1/4',
    'Q:1/4=120',
    'K:C',
  ].concat(lines).join('\n')
}

describe('playbackTimingMap', function() {
  test('header-only tune exposes opening meter and tempo', function() {
    const visual = visualFromAbc(abcWithSections(['CDEF | GABc |']))
    const map = buildPlaybackTimingMap(visual)
    expect(map).not.toBeNull()
    expect(map.startingMeter).toBe('4/4')
    // Prefer measure-duration QPM (matches synth) over abcjs getBpm(), which can
    // disagree with Q:1/4=120 in the header (observed getBpm=180 vs ms→120).
    expect(map.startingQpm).toBeCloseTo(120, 1)
    expect(map.meterBreaks.length).toBeGreaterThanOrEqual(1)
    expect(map.tempoBreaks.length).toBeGreaterThanOrEqual(1)

    const atStart = timingAtMusicSeconds(map, 0)
    expect(atStart.meterText).toBe('4/4')
    expect(atStart.qpm).toBeCloseTo(120, 1)
    expect(atStart.rhythm).toEqual(rhythmFromPreset('4-4'))
  })

  test('mid-tune Q: change updates sampled tempo', function() {
    const visual = visualFromAbc(abcWithSections([
      'CDEF |',
      'Q:1/4=60',
      'GABc |',
    ]))
    const map = buildPlaybackTimingMap(visual)
    const breaks = map.tempoBreaks.filter(function(item) { return item.abcTime > 0 })
    expect(breaks.length).toBeGreaterThanOrEqual(1)

    const before = timingAtMusicSeconds(map, breaks[0].musicSeconds - 0.001)
    const after = timingAtMusicSeconds(map, breaks[0].musicSeconds + 0.001)
    expect(before.qpm).toBeGreaterThan(after.qpm)
    expect(after.qpm).toBeCloseTo(60, 1)
  })

  test('mid-tune M: change updates sampled meter and rhythm', function() {
    const visual = visualFromAbc(abcWithSections([
      'CDEF |',
      '[M:3/4]',
      'GAB |',
    ]))
    const map = buildPlaybackTimingMap(visual)
    const meterChange = map.meterBreaks.find(function(item) { return item.abcTime > 0 })
    expect(meterChange).toBeTruthy()
    expect(meterChange.meterText).toBe('3/4')

    const before = timingAtMusicSeconds(map, meterChange.musicSeconds - 0.001)
    const after = timingAtMusicSeconds(map, meterChange.musicSeconds + 0.001)
    expect(before.meterText).toBe('4/4')
    expect(after.meterText).toBe('3/4')
    expect(after.rhythm).toEqual(rhythmFromPreset('3-4'))
  })

  test('additive mid-tune M:2+2+3 uses grouped rhythm grid', function() {
    const visual = visualFromAbc(abcWithSections([
      'CDEF |',
      '[M:2+2+3/8]',
      'CDEFGA |',
    ]))
    const map = buildPlaybackTimingMap(visual)
    const meterChange = map.meterBreaks.find(function(item) {
      return item.meterText.indexOf('2+2+3') >= 0
    })
    expect(meterChange).toBeTruthy()
    expect(slotsPerBar(meterChange.rhythm)).toBe(7)

    const after = timingAtMusicSeconds(map, meterChange.musicSeconds + 0.001)
    expect(after.meterText).toMatch(/2\+2\+3/)
    expect(slotsPerBar(after.rhythm)).toBe(7)
  })

  test('scales section times to buffer duration when provided', function() {
    const visual = visualFromAbc(abcWithSections(['CDEF | GABc |']))
    const map = buildPlaybackTimingMap(visual, { bufferDuration: 10 })
    expect(map.scale).toBeGreaterThan(1)
    expect(map.totalMusicSeconds).toBeCloseTo(10, 3)
  })

  test('prefers millisecondsPerMeasure over drifted getBpm', function() {
    const visual = visualFromAbc(abcWithSections(['CDEF | GABc |']))
    const ms = visual.millisecondsPerMeasure()
    expect(ms).toBeGreaterThan(0)
    // Freeze measure duration, then drift getBpm — mirrors production where
    // count-in/synth use ms while the timing map used to trust getBpm().
    visual.millisecondsPerMeasure = function() { return ms }
    visual.getBpm = function() { return 180 }
    const map = buildPlaybackTimingMap(visual)
    expect(map.startingQpm).toBeCloseTo(120, 1)
    const atStart = timingAtMusicSeconds(map, 0)
    expect(atStart.rhythmBeatBpm).toBeCloseTo(120, 1)
  })
})
