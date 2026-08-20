import { expandPlayalongSoundingSegments, mapSoundingBeatToWritten } from './playalongRepeatMap'
import { eventsFromVoiceBody } from './notation/voiceEventTiming'

describe('playalongRepeatMap', function() {
  test('expands a simple :| repeat into two sounding passes', function() {
    const events = eventsFromVoiceBody('|: CDEF | GABc :|', {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
    })
    const segments = expandPlayalongSoundingSegments(events)
    expect(segments.length).toBeGreaterThan(1)
    const passes = {}
    segments.forEach(function(seg) {
      passes[seg.passIndex] = (passes[seg.passIndex] || 0) + 1
    })
    expect(passes[1]).toBeGreaterThan(0)
    expect(passes[2]).toBeGreaterThan(0)
    const writtenBeats = segments.map(function(seg) { return seg.writtenStart })
    expect(Math.max.apply(null, writtenBeats)).toBeLessThan(
      segments[segments.length - 1].soundingEnd
    )
  })

  test('first and second endings map to different written spans', function() {
    const events = eventsFromVoiceBody('|: CDEF |1 GABc :|2 fedc |', {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
    })
    const segments = expandPlayalongSoundingSegments(events)
    const pass1 = segments.filter(function(seg) { return seg.passIndex === 1 })
    const pass2 = segments.filter(function(seg) { return seg.passIndex === 2 })
    expect(pass1.length).toBeGreaterThan(0)
    expect(pass2.length).toBeGreaterThan(0)
    const pass1End = Math.max.apply(null, pass1.map(function(seg) { return seg.writtenEnd }))
    const pass2End = Math.max.apply(null, pass2.map(function(seg) { return seg.writtenEnd }))
    expect(pass2End).toBeGreaterThan(pass1End - 0.001)
  })

  test('mapSoundingBeatToWritten returns pass 2 on the repeated section', function() {
    const events = eventsFromVoiceBody('|: CDEF | GABc :|', {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
    })
    const segments = expandPlayalongSoundingSegments(events)
    const first = mapSoundingBeatToWritten(segments, 0.5)
    expect(first.passIndex).toBe(1)
    const later = mapSoundingBeatToWritten(segments, segments[segments.length - 1].soundingEnd - 0.5)
    expect(later.passIndex).toBe(2)
    expect(later.writtenBeat).toBeGreaterThanOrEqual(0)
  })
})
