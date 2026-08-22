import {
  buildMediaAnalysisNotationAbc,
  persistMediaAnalysisFieldSuggestions,
  mediaAnalysisJobHasMelodySourceNotes,
} from './mediaAnalysisSuggestions'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import {
  __resetFieldSearchResultCacheForTests,
  getFieldSearchResults,
} from './fieldSearchResultCache'
import { getPlainLyricLines } from './wLinesUtils'

jest.mock('react-toastify', function() {
  return {
    toast: Object.assign(jest.fn(), {
      info: jest.fn(),
      warn: jest.fn(),
      dismiss: jest.fn(),
    }),
  }
})

describe('mediaAnalysisSuggestions', function() {
  beforeEach(function() {
    tuneFieldLookupQueue.__resetForTests()
    __resetFieldSearchResultCacheForTests()
  })

  test('applies empty lyrics/notation; caches empty chords for caret', function() {
    const tune = { id: 't1', name: 'Song', composer: 'Artist', voices: {} }
    const saveTune = jest.fn()
    const cached = persistMediaAnalysisFieldSuggestions('t1', {
      lyricsText: 'Line one\nLine two',
      chordsText: 'C | G |',
      melodyText: 'CDEF',
    }, tune, {
      saveTune: saveTune,
      abcTools: {
        abc2json: function(abc) {
          return { notes: String(abc).split('\n'), voices: { '1': { notes: ['CDEF'] } } }
        },
      },
    })
    expect(cached.map(function(item) { return item.kind })).toEqual(['chords'])
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'chords')).toBeFalsy()
    const chordHits = getFieldSearchResults('tune:t1', 'chords')
    expect(chordHits.length).toBeGreaterThan(0)
    expect(getPlainLyricLines(tune).join('\n')).toContain('Line one')
    expect(saveTune).toHaveBeenCalled()
  })

  test('merges analysis chords into notation ABC when abcjsParser provided', function() {
    const abc = buildMediaAnalysisNotationAbc({
      melodyText: 'C D E F |',
      chordsText: 'C | G |',
      meter: '4/4',
      key: 'C',
    }, { name: 'Song', meter: '4/4', key: 'C' }, {
      abcjsParser: {
        mergeMelody: function(melody, base) {
          return String(base || '') + 'MELODY:' + String(melody || '')
        },
        mergeChords: function(chords, base) {
          return String(base || '') + 'CHORDS:' + String(chords || '')
        },
      },
    })
    expect(abc).toContain('MELODY:C D E F |')
    expect(abc).toContain('CHORDS:C | G |')
  })

  test('notation candidate from persist is cached when field non-empty', function() {
    const tune = {
      id: 't1',
      name: 'Song',
      voices: { '1': { notes: ['G A B c |'] } },
    }
    persistMediaAnalysisFieldSuggestions('t1', {
      melodyText: 'C D E F |',
      chordsText: 'Am | F |',
      meter: '4/4',
      key: 'C',
    }, tune, {
      saveTune: jest.fn(),
      abcjsParser: {
        mergeMelody: function(melody, base) {
          return String(base || '') + melody
        },
        mergeChords: function(chords, base) {
          return String(base || '') + ' "C" '
        },
      },
    })
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'notation')).toBeFalsy()
    const hits = getFieldSearchResults('tune:t1', 'notation')
    const analysis = hits.find(function(c) {
      return c.source === 'media-analysis'
    })
    expect(analysis).toBeTruthy()
    expect(String(analysis.abc)).toContain('"C"')
  })

  test('caches tempo/meter/key when fields already filled', function() {
    const filledTune = {
      id: 't2',
      name: 'Song',
      tempo: 120,
      meter: '4/4',
      key: 'G',
      voices: {},
    }
    const cached = persistMediaAnalysisFieldSuggestions('t2', {
      tempo: 90,
      meter: '3/4',
      key: 'D',
    }, filledTune, { saveTune: jest.fn() })
    expect(cached.map(function(item) { return item.kind }).sort()).toEqual(['key', 'meter', 'tempo'])
    expect(getFieldSearchResults('tune:t2', 'tempo').length).toBeGreaterThan(0)
    expect(getFieldSearchResults('tune:t2', 'meter').length).toBeGreaterThan(0)
    expect(getFieldSearchResults('tune:t2', 'key').length).toBeGreaterThan(0)
    expect(filledTune.tempo).toBe(120)
    expect(filledTune.meter).toBe('4/4')
    expect(filledTune.key).toBe('G')
  })

  test('does not seed title or artist suggestions', function() {
    const tune = { id: 't1', name: 'Old', composer: 'Old Artist', voices: {} }
    persistMediaAnalysisFieldSuggestions('t1', {
      title: 'Detected Title',
      artist: 'Detected Artist',
      name: 'Detected Title',
      composer: 'Detected Artist',
      tempo: 100,
    }, tune, { saveTune: jest.fn() })
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'title')).toBeFalsy()
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'composer')).toBeFalsy()
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'artists')).toBeFalsy()
    expect(tune.name).toBe('Old')
    expect(tune.composer).toBe('Old Artist')
  })

  test('caches lyrics when field already has lyrics', function() {
    const tune = {
      id: 't1',
      name: 'Song',
      voices: {},
    }
    const { setPlainLyricLines } = require('./wLinesUtils')
    setPlainLyricLines(tune, ['Existing line'])
    persistMediaAnalysisFieldSuggestions('t1', {
      lyricsText: 'Analysis line',
    }, tune, { saveTune: jest.fn() })
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'lyrics')).toBeFalsy()
    const hits = getFieldSearchResults('tune:t1', 'lyrics')
    expect(hits.length).toBeGreaterThan(0)
    expect(getPlainLyricLines(tune).join('\n')).toContain('Existing line')
  })

  test('caches chords when field already has chord content', function() {
    const tune = {
      id: 't-chords',
      name: 'Song',
      voices: { '1': { notes: ['"C" z | "G" z |'] } },
    }
    const saveTune = jest.fn()
    const cached = persistMediaAnalysisFieldSuggestions('t-chords', {
      chordsText: 'Am | F |',
    }, tune, { saveTune: saveTune })
    expect(cached.map(function(item) { return item.kind })).toEqual(['chords'])
    expect(saveTune).not.toHaveBeenCalled()
    expect(tune.voices['1'].notes.join('\n')).toContain('"C"')
    const hits = getFieldSearchResults('tune:t-chords', 'chords')
    expect(hits.length).toBeGreaterThan(0)
  })

  test('kinds option persists only selected analysis fields', function() {
    const tune = { id: 't-kinds', name: 'Song', composer: 'Artist', voices: {} }
    const saveTune = jest.fn()
    persistMediaAnalysisFieldSuggestions('t-kinds', {
      lyricsText: 'Line one',
      chordsText: 'C | G |',
      key: 'G',
      melodyText: 'CDEF',
    }, tune, {
      saveTune: saveTune,
      kinds: ['key'],
    })
    expect(tune.key).toBe('G')
    expect(getPlainLyricLines(tune).join('\n')).not.toContain('Line one')
    expect(getFieldSearchResults('tune:t-kinds', 'chords').length).toBe(0)
  })

  test('mediaAnalysisJobHasMelodySourceNotes gates fine-tune visibility', function() {
    expect(mediaAnalysisJobHasMelodySourceNotes(null)).toBe(false)
    expect(mediaAnalysisJobHasMelodySourceNotes({})).toBe(false)
    expect(mediaAnalysisJobHasMelodySourceNotes({ melodySourceNotes: [] })).toBe(false)
    expect(mediaAnalysisJobHasMelodySourceNotes({
      melodySourceNotes: [{ midi: 60, start: 0, end: 0.5 }],
    })).toBe(true)
  })

  test('completed analysis job can store refine inputs in memory', function() {
    const {
      patchMediaAnalysisJob,
      getMediaAnalysisJob,
      resetMediaAnalysisJob,
    } = require('./mediaAnalysisJobs')
    patchMediaAnalysisJob('t-refine', {
      melodySourceNotes: [{ midi: 60, start: 0, end: 0.4, confidence: 0.9 }],
      timedMelody: { beatTimes: [0, 0.5], detectedKey: 'G' },
      chordsText: 'G | D |',
    })
    const job = getMediaAnalysisJob('t-refine')
    expect(mediaAnalysisJobHasMelodySourceNotes(job)).toBe(true)
    expect(job.chordsText).toBe('G | D |')
    expect(job.timedMelody.detectedKey).toBe('G')
    resetMediaAnalysisJob('t-refine')
  })
})
