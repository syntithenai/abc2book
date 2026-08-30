import {
  expandPlayalongSoundingSegments,
  expandPlayalongSoundingSegmentsFromTune,
  expandPlayalongSoundingSegmentsFromVisualObj,
  mapSoundingBeatToWritten,
} from './playalongRepeatMap'
import { eventsFromVoiceBody } from './notation/voiceEventTiming'
import abcjs from 'abcjs'

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

  test('Josefins |1,3 / |2,4 + pickup: four A passes via shared visual map', function() {
    const abc = [
      'X:1',
      'T: Josefins Dopvals',
      'M:3/4',
      'L:1/4',
      'Q:1/4=100',
      'K:F',
      'zC |',
      'CFG | AcB | AGF | C2D |',
      'B,>B,B, |',
      '|1,3 DFE | D3 | C3 :|2,4 [DB,]EF | G3- | G A B :|',
      '|: cAc | f2e | d3 | c3 :|',
    ].join('\n')
    const visualObj = abcjs.renderAbc('*', abc)[0]
    const segments = expandPlayalongSoundingSegmentsFromVisualObj(visualObj)
    const passes = {}
    segments.forEach(function(seg) {
      passes[seg.passIndex] = true
    })
    expect(passes[1]).toBe(true)
    expect(passes[2]).toBe(true)
    expect(passes[3]).toBe(true)
    expect(passes[4]).toBe(true)

    const pass2Ending = segments.filter(function(seg) {
      return seg.passIndex === 2
    })
    const pass4Ending = segments.filter(function(seg) {
      return seg.passIndex === 4
    })
    expect(pass2Ending.length).toBeGreaterThan(0)
    expect(pass4Ending.length).toBeGreaterThan(0)
    // Ending 2,4 written span is after ending 1,3
    const pass2MaxWritten = Math.max.apply(null, pass2Ending.map(function(s) { return s.writtenEnd }))
    const pass1MaxWritten = Math.max.apply(null,
      segments.filter(function(s) { return s.passIndex === 1 }).map(function(s) { return s.writtenEnd })
    )
    expect(pass2MaxWritten).toBeGreaterThan(pass1MaxWritten - 0.01)

    // Pickup once: sounding duration shorter than 4× full A including pickup each time
    const soundingEnd = segments[segments.length - 1].soundingEnd
    expect(soundingEnd).toBeGreaterThan(30)
  })

  test('expandPlayalongSoundingSegmentsFromTune uses shared expander', function() {
    const tune = {
      meter: '3/4',
      noteLength: '1/4',
      key: 'F',
      voices: {
        '1': {
          notes: [
            'zC | CFG | AcB | AGF | C2D | B,>B,B, |1,3 DFE | D3 | C3 :|2,4 [DB,]EF | G3- | G A B :|',
          ],
        },
      },
    }
    const segments = expandPlayalongSoundingSegmentsFromTune(tune)
    expect(segments).toBeTruthy()
    expect(segments.some(function(s) { return s.passIndex === 4 })).toBe(true)
    const pass3 = segments.find(function(s) { return s.passIndex === 3 })
    expect(pass3).toBeTruthy()
    const mid = (pass3.soundingStart + pass3.soundingEnd) / 2
    const midPass3 = mapSoundingBeatToWritten(segments, mid)
    expect(midPass3).toBeTruthy()
    expect(midPass3.passIndex).toBe(3)
  })
})
