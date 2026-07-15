import abcjs from 'abcjs'
import { noteEventsFromWarmupAbc } from './practiceExpectedTimeline'
import { generateScaleWarmup, generateWarmupsForKey } from './practiceWarmupGenerator'
import { pitchToMidi } from './notation/voiceEventModel'
import {
  firstWarmupCueMidi,
  firstPlaybackCueMidiFromVisual,
  scheduleCountInCueNote,
  scheduleCountInCueFromAudioBuffer,
  preloadCountInCueInstrument,
  __resetCountInCueInstrumentForTests,
} from './countInPitchCue'

describe('count-in cue pitch vs melody', function() {
  const keys = ['C', 'D', 'G', 'A', 'F', 'Bb', 'Em']

  keys.forEach(function(key) {
    it('scale warmup cue midi matches first sounding note for ' + key, function() {
      const warmup = generateScaleWarmup({ key: key, instrument: 'violin' })
      const timeline = noteEventsFromWarmupAbc(warmup.abc)
      expect(timeline.notes.length).toBeGreaterThan(0)
      expect(firstWarmupCueMidi(warmup.abc)).toBe(timeline.notes[0].midi)
    })
  })

  it('uppercase C and lowercase c are an octave apart', function() {
    const low = noteEventsFromWarmupAbc('X:1\nT:t\nM:4/4\nL:1/4\nK:C\nC |]\n')
    const high = noteEventsFromWarmupAbc('X:1\nT:t\nM:4/4\nL:1/4\nK:C\nc |]\n')
    expect(low.notes[0].midi).toBe(60)
    expect(high.notes[0].midi).toBe(72)
  })

  it('uses the melody (highest) pitch of a first-beat dyad for the cue', function() {
    const abc = 'X:1\nT:t\nM:4/4\nL:1/4\nK:G\n[G,D]EFG |]\n'
    const timeline = noteEventsFromWarmupAbc(abc)
    expect(timeline.notes[0].midi).toBe(62)
    expect(firstWarmupCueMidi(abc)).toBe(62)
  })

  it('uses generator firstMidi when provided', function() {
    expect(firstWarmupCueMidi('X:1\nK:C\nC|]', 67)).toBe(67)
  })

  it('scale warmup firstMidi matches cue and timeline', function() {
    const warmup = generateScaleWarmup({ key: 'C', instrument: 'violin' })
    expect(Number.isFinite(warmup.firstMidi)).toBe(true)
    expect(firstWarmupCueMidi(warmup.abc, warmup.firstMidi)).toBe(warmup.firstMidi)
    const timeline = noteEventsFromWarmupAbc(warmup.abc)
    expect(timeline.notes[0].midi).toBe(warmup.firstMidi)
  })

  it('firstWarmupCueMidi matches timeline first note across D warmups', function() {
    const list = generateWarmupsForKey('D', { skillLevel: 5, instrument: 'violin' })
    expect(list.length).toBeGreaterThan(0)
    list.forEach(function(warmup) {
      const timeline = noteEventsFromWarmupAbc(warmup.abc)
      if (!timeline.notes[0]) return
      expect(firstWarmupCueMidi(warmup.abc)).toBe(timeline.notes[0].midi)
    })
  })

  it('pitchToMidi matches explicit ABC accidentals', function() {
    expect(pitchToMidi({ step: 'F', octave: 4, accidental: 1 })).toBe(66)
    expect(pitchToMidi({ step: 'B', octave: 4, accidental: -1 })).toBe(70)
  })
})

describe('firstPlaybackCueMidiFromVisual', function() {
  it('matches first monophonic note from setUpAudio', function() {
    const abc = 'X:1\nT:t\nM:4/4\nL:1/4\nK:C\nCDEF |]\n'
    const visual = abcjs.renderAbc('*', abc, {})[0]
    expect(firstPlaybackCueMidiFromVisual(visual)).toBe(60)
  })

  it('takes the highest pitch of a first-attack dyad only', function() {
    const abc = 'X:1\nT:t\nM:4/4\nL:1/4\nK:G\n[G,D]EFG |]\n'
    const visual = abcjs.renderAbc('*', abc, {})[0]
    expect(firstPlaybackCueMidiFromVisual(visual)).toBe(62)
  })

  it('does not climb an arpeggio for the cue pitch', function() {
    const abc = 'X:1\nT:t\nM:4/4\nL:1/4\nK:D\nDFAd |]\n'
    const visual = abcjs.renderAbc('*', abc, {})[0]
    expect(firstPlaybackCueMidiFromVisual(visual)).toBe(62)
  })

  it('matches generator firstMidi for C violin scales', function() {
    const warmup = generateScaleWarmup({ key: 'C', instrument: 'violin' })
    const visual = abcjs.renderAbc('*', warmup.abc, {})[0]
    expect(firstPlaybackCueMidiFromVisual(visual)).toBe(warmup.firstMidi)
  })
})

describe('count-in cue scheduling', function() {
  afterEach(function() {
    __resetCountInCueInstrumentForTests()
  })

  it('scheduleCountInCueNote no-ops without audio context', function() {
    return scheduleCountInCueNote(null, 60, 0, 1, 0.4).then(function(result) {
      expect(result).toBeUndefined()
    })
  })

  it('preloadCountInCueInstrument resolves without context', function() {
    return preloadCountInCueInstrument(null).then(function(instrument) {
      expect(instrument).toBeNull()
    })
  })

  it('scheduleCountInCueFromAudioBuffer returns false without buffer', function() {
    expect(scheduleCountInCueFromAudioBuffer({}, null, 0, 0.5, 0.5)).toBe(false)
  })

  it('scheduleCountInCueNote prefers audio buffer over midi oscillator', function() {
    const calls = []
    const ctx = {
      currentTime: 1,
      createBufferSource: function() {
        return {
          buffer: null,
          connect: function() {},
          start: function(when, offset, dur) {
            calls.push({ when: when, offset: offset, dur: dur })
          },
        }
      },
      createGain: function() {
        return {
          gain: {
            setValueAtTime: function() {},
            exponentialRampToValueAtTime: function() {},
          },
          connect: function() {},
        }
      },
      createOscillator: function() {
        throw new Error('oscillator should not be used when buffer is present')
      },
      destination: {},
    }
    const fakeBuffer = { duration: 2 }
    return scheduleCountInCueNote(ctx, 60, 1.2, 0.5, 0.5, fakeBuffer).then(function() {
      expect(calls.length).toBe(1)
      expect(calls[0].offset).toBe(0)
      expect(calls[0].dur).toBeCloseTo(0.5, 5)
    })
  })
})
