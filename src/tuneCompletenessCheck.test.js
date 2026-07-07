import {
  checkTunesCompleteness,
  checkTuneCompleteness,
} from './tuneCompletenessCheck'

describe('tuneCompletenessCheck', function() {
  test('passes path B tune with melody, meter, key, and embedded chords', function() {
    const tune = {
      id: 't1',
      name: 'Melody Tune',
      meter: '4/4',
      key: 'C',
      voices: {
        '1': {
          notes: [
            '"C" C D E G | "F" F E D C | "G" G A B c | "C" c B A G |',
          ],
        },
      },
    }
    expect(checkTuneCompleteness(tune, { hasChords: function(t) { return t.indexOf('"') !== -1 } })).toBeNull()
  })

  test('passes path A tune with lyrics, meter, and chord scaffold', function() {
    const tune = {
      id: 't2',
      name: 'Lyric Tune',
      meter: '4/4',
      timingScaffold: true,
      words: ['Line one', 'Line two'],
      voices: {
        '1': { notes: ['z z z z | z z z z || z z z z | z z z z |'] },
      },
    }
    expect(checkTuneCompleteness(tune, { hasChords: function() { return false } })).toBeNull()
  })

  test('fails incomplete tune on suggested path', function() {
    const tune = {
      id: 't3',
      name: 'Broken',
      voices: { '1': { notes: ['C D E F |'] } },
    }
    const result = checkTuneCompleteness(tune, { hasChords: function() { return false } })
    expect(result).not.toBeNull()
    expect(result.suggestedPath).toBe('B')
    expect(result.issues.some(function(i) { return i.code === 'missing_meter' })).toBe(true)
  })

  test('checkTunesCompleteness returns only incomplete tunes', function() {
    const issues = checkTunesCompleteness([
      { id: 'ok', name: 'Ok', meter: '4/4', timingScaffold: true, words: ['a'], voices: { '1': { notes: ['"C" z z z |'] } } },
      { id: 'bad', name: 'Bad', voices: { '1': { notes: [] } } },
    ], { hasChords: function(t) { return t.indexOf('"') !== -1 } })
    expect(issues).toHaveLength(1)
    expect(issues[0].tuneId).toBe('bad')
  })
})
