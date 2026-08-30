/**
 * @jest-environment jsdom
 */
import fs from 'fs'
import abcjs from 'abcjs'
import {
  cursorPositionFromNoteTimings,
} from './notationPlaybackCursor'

function dumpTune(abc) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const visual = abcjs.renderAbc(host, abc, { add_classes: true, staffwidth: 700 })[0]
  const timing = new abcjs.TimingCallbacks(visual, { qpm: visual.getBpm(visual.metaText && visual.metaText.tempo) })
  const rows = (timing.noteTimings || []).map(function(ev, i) {
    return {
      i: i,
      type: ev.type,
      ms: ev.milliseconds,
      left: ev.left,
      top: ev.top,
      height: ev.height,
      measureNumber: ev.measureNumber,
      measureStart: !!ev.measureStart,
      line: ev.line,
    }
  })
  host.remove()
  return { lastMoment: timing.lastMoment, rows: rows, timings: timing.noteTimings }
}

describe('cursor vs abcjs anacrusis timings', function() {
  test('3/4 pickup tune keeps a visible cursor after the anacrusis', function() {
    const abc = [
      'X:1',
      'T:Pickup',
      'M:3/4',
      'L:1/8',
      'Q:1/4=120',
      'K:G',
      'D2 | G2 A2 B2 | c2 B2 A2 | G2 A2 B2 | c2 B2 A2 | G6 |',
    ].join('\n')
    const dumped = dumpTune(abc)
    const last = dumped.rows[dumped.rows.length - 1]
    const pickupMs = dumped.rows.find(function(r) { return r.left != null }).ms
    const firstFull = dumped.rows.find(function(r) {
      return r.left != null && r.measureNumber === 1
    })
    expect(dumped.lastMoment).toBeGreaterThan(2000)
    expect(last.ms).toBe(dumped.lastMoment)

    const duringPickup = cursorPositionFromNoteTimings(dumped.timings, pickupMs + 10)
    const duringFirstBar = cursorPositionFromNoteTimings(
      dumped.timings,
      (firstFull ? firstFull.ms : 1000) + 50
    )
    const midTune = cursorPositionFromNoteTimings(dumped.timings, dumped.lastMoment * 0.4)
    const lastBar = cursorPositionFromNoteTimings(dumped.timings, dumped.lastMoment)
    expect(duringPickup.atEnd).not.toBe(true)
    expect(duringPickup.left).toEqual(expect.any(Number))
    expect(duringFirstBar.atEnd).not.toBe(true)
    expect(duringFirstBar.left).toEqual(expect.any(Number))
    expect(firstFull && duringFirstBar.left).not.toBe(duringPickup.left)
    expect(midTune.atEnd).not.toBe(true)
    expect(lastBar.atEnd).not.toBe(true)
    expect(lastBar.left).toEqual(expect.any(Number))
  })

  test('Misirlou keeps cursor on repeat bar starts despite timing gaps', function() {
    const abc = fs.readFileSync('/home/stever/Downloads/Misirlou.abc', 'utf8')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const visual = abcjs.renderAbc(host, abc, { add_classes: true, staffwidth: 700 })[0]
    const audibleMpm = visual.millisecondsPerMeasure()
    host.remove()
    const dumped = dumpTune(abc)
    const audioDurationSec = dumped.lastMoment / 1000
    const pos = cursorPositionFromNoteTimings(dumped.timings, 9.6 * 1000, {
      musicSec: 9.6,
      audibleMsPerMeasure: audibleMpm,
      audioDurationSec: audioDurationSec,
      lastMomentMs: dumped.lastMoment,
    })
    expect(pos.left).toBe(dumped.rows.find(function(r) {
      return r.ms === 9600 && r.left != null
    }).left)
    const repeatPos = cursorPositionFromNoteTimings(dumped.timings, 38.4 * 1000, {
      musicSec: 38.4,
      audibleMsPerMeasure: audibleMpm,
      audioDurationSec: audioDurationSec,
      lastMomentMs: dumped.lastMoment,
    })
    expect(repeatPos.left).toBe(dumped.rows.find(function(r) {
      return r.ms === 38400 && r.left != null
    }).left)
  })
})
