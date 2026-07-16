import {
  persistMediaAnalysisFieldSuggestions,
} from './mediaAnalysisSuggestions'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
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
  })

  test('applies empty lyrics/chords/notation without attaching suggestions', function() {
    const tune = { id: 't1', name: 'Song', composer: 'Artist', voices: {} }
    const saveTune = jest.fn()
    const seeded = persistMediaAnalysisFieldSuggestions('t1', {
      lyricsText: 'Line one\nLine two',
      chordsText: '"C" "G"',
      melodyText: 'X:1\nK:C\nCDEF',
    }, tune, {
      saveTune: saveTune,
      abcTools: {
        abc2json: function(abc) {
          return { notes: String(abc).split('\n'), voices: { '1': { notes: ['CDEF'] } } }
        },
      },
    })
    expect(seeded.length).toBe(0)
    const jobs = tuneFieldLookupQueue.getState().jobs.filter(function(job) {
      return job.status === 'awaiting'
    })
    expect(jobs.length).toBe(0)
    expect(getPlainLyricLines(tune).join('\n')).toContain('Line one')
    expect(saveTune).toHaveBeenCalled()
  })

  test('keeps Current when field already has lyrics', function() {
    const tune = {
      id: 't1',
      name: 'Song',
      voices: {},
    }
    // seed existing lyrics via apply path
    const { setPlainLyricLines } = require('./wLinesUtils')
    setPlainLyricLines(tune, ['Existing line'])
    persistMediaAnalysisFieldSuggestions('t1', {
      lyricsText: 'Analysis line',
    }, tune, { saveTune: jest.fn() })
    const job = tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'lyrics')
    expect(job).toBeTruthy()
    expect(job.candidates.some(function(c) { return c.isCurrent || c.id === 'current' })).toBe(true)
    expect(getPlainLyricLines(tune).join('\n')).toContain('Existing line')
  })
})
