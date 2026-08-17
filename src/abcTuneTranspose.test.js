/**
 * @jest-environment jsdom
 */
import abcjs from 'abcjs'
import useAbcTools from './useAbcTools'
import { transposeTuneAbcNotes } from './abcTuneTranspose'
import { firstPlaybackCueMidiFromVisual } from './countInPitchCue'

describe('transposeTuneAbcNotes', function() {
  const abcTools = useAbcTools()

  function tuneFromVoices(voices, extras) {
    return Object.assign({
      name: 'Test',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      tempo: 100,
      transpose: 2,
      words: ['keep these lyrics'],
      voices: voices,
    }, extras || {})
  }

  function firstMidi(tune) {
    const abc = abcTools.json2abc(Object.assign({}, tune, { transpose: 0, words: [] }))
    const el = document.createElement('div')
    document.body.appendChild(el)
    const visual = abcjs.renderAbc(el, abc)[0]
    const midi = firstPlaybackCueMidiFromVisual(visual)
    el.remove()
    return midi
  }

  test('returns null when semitones is 0', function() {
    const tune = tuneFromVoices({
      1: { meta: 'melody', notes: ['CDEF|'] },
    })
    expect(transposeTuneAbcNotes(tune, abcTools, 0)).toBeNull()
  })

  test('transposes every voice and the key without changing tune.transpose or lyrics', function() {
    const tune = tuneFromVoices({
      1: { meta: 'melody clef=treble', notes: ['%%MIDI program 0', 'C2 D2 E2 F2 |'] },
      2: { meta: 'bass clef=bass', notes: ['C,2 G,2 |'] },
    })
    const beforeMidi = firstMidi(tune)
    const next = transposeTuneAbcNotes(tune, abcTools, 2)
    expect(next).toBeTruthy()
    expect(next).not.toBe(tune)
    expect(next.transpose).toBe(2)
    expect(next.words).toEqual(['keep these lyrics'])
    expect(String(next.key)).toMatch(/^D/)
    expect(next.voices[1].notes.join('\n')).toMatch(/D2/)
    expect(next.voices[1].notes.join('\n')).not.toMatch(/\bC2\b/)
    expect(next.voices[1].notes.join('\n')).toMatch(/%%MIDI program 0/)
    expect(next.voices[2].notes.join('\n')).toMatch(/D,2/)
    expect(tune.voices[1].notes.join('\n')).toMatch(/C2 D2/)
    expect(firstMidi(next)).toBe(beforeMidi + 2)
  })

  test('transposes down a semitone by rewriting key and sounding pitch', function() {
    const tune = tuneFromVoices({
      1: { meta: '', notes: ['D2 E2 |'] },
    }, { key: 'D' })
    const beforeMidi = firstMidi(tune)
    const next = transposeTuneAbcNotes(tune, abcTools, -1)
    expect(String(next.key)).toMatch(/^Db|^C#/)
    expect(firstMidi(next)).toBe(beforeMidi - 1)
  })

  test('transposes quoted chord symbols in ABC note text', function() {
    const tune = tuneFromVoices({
      1: { meta: '', notes: ['"C"C2 "G"G2 |'] },
    })
    const next = transposeTuneAbcNotes(tune, abcTools, 2)
    expect(next.voices[1].notes.join('\n')).toMatch(/"D"/)
    expect(next.voices[1].notes.join('\n')).toMatch(/"A"/)
    expect(next.voices[1].notes.join('\n')).not.toMatch(/"C"/)
  })

  test('uses abcjs.strTranspose', function() {
    expect(typeof abcjs.strTranspose).toBe('function')
  })
})
