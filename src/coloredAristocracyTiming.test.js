/**
 * @jest-environment jsdom
 */
import fs from 'fs'
import path from 'path'
import abcjs from 'abcjs'
import { musicDurationWholeFromVisualObj, buildPlaybackSequence } from './playbackFillPattern'
import { resolveFillPlaybackOptions } from './playbackFillSettings'

const abcPath = path.join(
  __dirname,
  '../abcresources/thesession/abc_tune_thesession_7750.abc'
)
const abc = fs.readFileSync(abcPath, 'utf8')

function analyzeTune(abcText) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const visual = abcjs.renderAbc(host, abcText, { add_classes: true, staffwidth: 700 })[0]
  const qpm = visual.getBpm(visual.metaText && visual.metaText.tempo)
  const timing = new abcjs.TimingCallbacks(visual, { qpm: qpm })
  const visualTotalBeats = parseFloat(visual.getTotalBeats())
  const musicWhole = musicDurationWholeFromVisualObj(visual)
  const synth = visual.setUpAudio ? visual : null
  let sequenceEndWhole = 0
  let fillSequenceEndWhole = 0
  if (synth && typeof synth.setUpAudio === 'function') {
    const seq = synth.setUpAudio({ chordsOff: true })
    if (seq && Array.isArray(seq.tracks)) {
      seq.tracks.forEach(function(track) {
        ;(track || []).forEach(function(ev) {
          if (ev && ev.cmd === 'note' && ev.start != null && ev.duration != null) {
            sequenceEndWhole = Math.max(sequenceEndWhole, ev.start + ev.duration)
          }
        })
      })
    }
    const fillPlayback = resolveFillPlaybackOptions({}, null)
    const withFill = buildPlaybackSequence(synth, {
      fillOptions: fillPlayback,
      millisecondsPerMeasure: synth.millisecondsPerMeasure(),
    })
    if (withFill && Array.isArray(withFill.tracks)) {
      withFill.tracks.forEach(function(track) {
        ;(track || []).forEach(function(ev) {
          if (ev && ev.cmd === 'note' && ev.start != null && ev.duration != null) {
            fillSequenceEndWhole = Math.max(fillSequenceEndWhole, ev.start + ev.duration)
          }
        })
      })
    }
  }
  host.remove()
  return {
    visualTotalBeats,
    timingTotalBeats: timing.totalBeats,
    lastMoment: timing.lastMoment,
    qpm,
    musicWhole,
    sequenceEndWhole,
    fillSequenceEndWhole,
    msPerBeat: qpm > 0 ? 60000 / qpm : 0,
    estimatedDurationSec: timing.lastMoment > 0 ? timing.lastMoment / 1000 : 0,
  }
}

describe('Colored Aristocracy timing', function() {
  test('TimingCallbacks span full two-part tune', function() {
    const info = analyzeTune(abc)
    expect(info.visualTotalBeats).toBeGreaterThan(60)
    expect(info.timingTotalBeats).toBeGreaterThan(60)
    expect(info.lastMoment).toBeGreaterThan(30000)
    expect(info.estimatedDurationSec).toBeGreaterThan(30)
    expect(info.visualTotalBeats).toBeGreaterThan(100)
    // TimingCallbacks totalBeats must match visual — early end causes restart loops.
    expect(info.timingTotalBeats).toBeCloseTo(info.visualTotalBeats, 0)
    // MIDI sequence must cover the same music span as the visual score.
    expect(info.sequenceEndWhole).toBeGreaterThan(info.musicWhole * 0.95)
    if (info.fillSequenceEndWhole > 0) {
      expect(info.fillSequenceEndWhole).toBeGreaterThan(info.musicWhole * 0.95)
    }
  })
})
