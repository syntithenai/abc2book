import abcjs from 'abcjs'
import {
  buildSoundingWrittenMap,
  mapSoundingWholeToWritten,
} from './voltaRepeatExpand'
import {
  barStartTimingsFromNoteTimings,
  cursorPositionFromNoteTimings,
} from './notationPlaybackCursor'
import { barWholeNotesFromMeter } from './playbackFillPattern'

const JOSEFINS = [
  'X:1', 'T: Josefins Dopvals', 'M:3/4', 'L:1/4', 'Q: 1/4=100', 'K:F', 'V:1',
  'z"C7"C \\',
  '| "F"CFG | AcB | AGF | C2D \\',
  '| "Bb"B,>B,B, |',
  '|1,3 "C"DFE | "Gm"D3 | "C7"C3 \\',
  ':|2,4 "Bb"[DB,]EF | "C7"G3- | G  A B :|',
  '|: "F"cAc | f2e | "Bb"d3 | "F"c3 :|',
].join('\n')

describe('cursor volta sounding→written', function() {
  test('ending 1 and ending 2 land on different written bars across passes', function() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const v = abcjs.renderAbc(host, JOSEFINS, { add_classes: true, staffwidth: 700 })[0]
    const map = buildSoundingWrittenMap(v)
    const tc = new abcjs.TimingCallbacks(v, { qpm: 100 })
    const barStarts = barStartTimingsFromNoteTimings(tc.noteTimings)
    const barWhole = barWholeNotesFromMeter(v.getMeterFraction())
    const audioDur = map.soundingWhole * (v.millisecondsPerMeasure() / 1000) / barWhole

    function barIndexAt(soundingWhole) {
      const musicSec = soundingWhole / map.soundingWhole * audioDur
      const pos = cursorPositionFromNoteTimings(tc.noteTimings, musicSec * 1000, {
        musicSec: musicSec,
        audibleMsPerMeasure: v.millisecondsPerMeasure(),
        audioDurationSec: audioDur,
        lastMomentMs: tc.lastMoment,
        soundingWrittenMap: map,
        barWholeNotes: barWhole,
        pickupWhole: map.pickupWhole,
      })
      for (let i = 0; i < barStarts.length; i++) {
        if (pos
            && Math.abs(barStarts[i].left - pos.left) < 0.5
            && Math.abs((barStarts[i].top || 0) - (pos.top || 0)) < 0.5) {
          return i
        }
      }
      return -1
    }

    function mid(seg) {
      return (seg.soundingStartWhole + seg.soundingEndWhole) / 2
    }

    const end1p1 = map.segments.find(function(s) {
      return s.passIndex === 1 && s.writtenStartWhole >= 4.2
    })
    const end2p2 = map.segments.find(function(s) {
      return s.passIndex === 2 && s.writtenStartWhole >= 6.4
    })
    const end1p3 = map.segments.find(function(s) {
      return s.passIndex === 3 && s.writtenStartWhole >= 4.2
    })
    const end2p4 = map.segments.find(function(s) {
      return s.passIndex === 4 && s.writtenStartWhole >= 6.4
    })
    expect(end1p1 && end2p2 && end1p3 && end2p4).toBeTruthy()

    const b1 = barIndexAt(mid(end1p1))
    const b2 = barIndexAt(mid(end2p2))
    const b3 = barIndexAt(mid(end1p3))
    const b4 = barIndexAt(mid(end2p4))

    expect(b1).toBeGreaterThanOrEqual(0)
    expect(b2).toBeGreaterThan(b1)
    expect(b3).toBe(b1)
    expect(b4).toBe(b2)

    // Early in pass 1 must stay on the first written bars — not jump ahead
    // because abcjs lastMoment includes an expanded repeat (~2× written).
    const early = barIndexAt(1.0)
    expect(early).toBeGreaterThanOrEqual(0)
    expect(early).toBeLessThan(4)
    expect(early).toBeLessThan(b1)

    const m2 = mapSoundingWholeToWritten(map.segments, mid(end2p2))
    expect(m2.passIndex).toBe(2)
    expect(m2.writtenWhole).toBeGreaterThanOrEqual(6.5)

    host.remove()
  })
})
