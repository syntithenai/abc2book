import {
  dismissAddTuneAutoEnrichFailure,
  getAddTuneAutoEnrichState,
  isAddTuneAutoEnrichPending,
  pickFirstSearchCandidate,
  runAddTuneAutoEnrich,
  subscribeAddTuneAutoEnrich,
} from './addTuneAutoEnrich'

jest.mock('./chordsSearchClient', function() {
  return {
    searchChords: jest.fn(),
  }
})

jest.mock('./lyricsSearchClient', function() {
  return {
    searchLyrics: jest.fn(),
  }
})

jest.mock('./notationSearchClient', function() {
  return {
    searchNotation: jest.fn(),
  }
})

jest.mock('./commitChordSearchResultToTune', function() {
  return {
    commitChordSearchResultToTune: jest.fn(),
  }
})

jest.mock('./fieldLookupApplyUtils', function() {
  return {
    applyCandidateToTune: jest.fn(),
    historyLabelForKind: function(kind) { return 'Search ' + kind },
    isTuneFieldEmptyForKind: jest.fn(),
  }
})

const { searchChords } = require('./chordsSearchClient')
const { searchLyrics } = require('./lyricsSearchClient')
const { searchNotation } = require('./notationSearchClient')
const { commitChordSearchResultToTune } = require('./commitChordSearchResultToTune')
const { applyCandidateToTune, isTuneFieldEmptyForKind } = require('./fieldLookupApplyUtils')

describe('addTuneAutoEnrich', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    dismissAddTuneAutoEnrichFailure('t1')
    dismissAddTuneAutoEnrichFailure('t2')
    dismissAddTuneAutoEnrichFailure('t3')
    dismissAddTuneAutoEnrichFailure('t4')
    dismissAddTuneAutoEnrichFailure('t5')
    dismissAddTuneAutoEnrichFailure('t6')
  })

  test('pickFirstSearchCandidate prefers first candidate from multi results', function() {
    expect(pickFirstSearchCandidate({
      candidates: [{ title: 'A' }, { title: 'B' }],
    })).toEqual({ title: 'A' })
  })

  test('runs chords and lyrics search, skipping notation when lyrics were found', async function() {
    const tune = { id: 't1', name: 'Song', composer: 'Writer' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockImplementation(function(opts) {
      if (opts && typeof opts.onProgress === 'function') {
        opts.onProgress('Checking chord sources...', 0.4, 'chords')
      }
      return Promise.resolve({ chordText: 'C | G |', lyricLines: ['line'] })
    })
    searchLyrics.mockResolvedValue({ text: 'lyrics text' })
    searchNotation.mockResolvedValue({ empty: true })
    commitChordSearchResultToTune.mockReturnValue({
      ok: true,
      lyricLines: ['line'],
    })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics'
    })
    applyCandidateToTune.mockReturnValue(true)

    const seen = []
    const unsubscribe = subscribeAddTuneAutoEnrich(function() {
      seen.push(getAddTuneAutoEnrichState('t1'))
    })

    const promise = runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    expect(isAddTuneAutoEnrichPending('t1')).toBe(true)
    await promise
    unsubscribe()

    expect(commitChordSearchResultToTune).toHaveBeenCalled()
    expect(searchLyrics).toHaveBeenCalled()
    expect(searchNotation).toHaveBeenCalled()
    expect(applyCandidateToTune).not.toHaveBeenCalledWith(
      expect.anything(),
      'notation',
      expect.anything(),
      expect.anything()
    )
    expect(isAddTuneAutoEnrichPending('t1')).toBe(false)
    expect(getAddTuneAutoEnrichState('t1').failure).toBe('')
    expect(seen.some(function(state) {
      return state.pending && state.message === 'Checking chord sources...'
    })).toBe(true)
  })

  test('falls back to notation when no lyrics were found', async function() {
    const tune = {
      id: 't2',
      name: 'Song',
      composer: 'Writer',
      voices: { '1': { notes: ['"C" z4 |'] } },
    }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockImplementation(function(opts) {
      if (opts && typeof opts.onProgress === 'function') {
        opts.onProgress('Fetching MuseScore score...', 0.5, 'musescore')
      }
      return Promise.resolve({ abc: 'X:1\nK:C\nC D E F|' })
    })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics'
    })
    applyCandidateToTune.mockReturnValue(true)

    const seen = []
    const unsubscribe = subscribeAddTuneAutoEnrich(function() {
      seen.push(getAddTuneAutoEnrichState('t2'))
    })

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })
    unsubscribe()

    expect(searchNotation).toHaveBeenCalled()
    expect(applyCandidateToTune).toHaveBeenCalledWith(
      tune,
      'notation',
      { abc: 'X:1\nK:C\nC D E F|' },
      tunebook.abcTools
    )
    expect(tunebook.saveTune).toHaveBeenCalledWith(
      tune,
      false,
      expect.objectContaining({ historyLabel: 'Search notation' })
    )
    expect(getAddTuneAutoEnrichState('t2').failure).toBe('')
    expect(seen.some(function(state) {
      return state.pending && /MuseScore|notation/i.test(state.message || '')
    })).toBe(true)
  })

  test('records failure when lyrics and notation both fail', async function() {
    const tune = { id: 't3', name: 'Song', composer: 'Writer' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({ empty: true })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics'
    })
    applyCandidateToTune.mockReturnValue(false)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    expect(isAddTuneAutoEnrichPending('t3')).toBe(false)
    expect(getAddTuneAutoEnrichState('t3').failure).toBe(
      'Could not find lyrics or notation for this tune.'
    )

    dismissAddTuneAutoEnrichFailure('t3')
    expect(getAddTuneAutoEnrichState('t3').failure).toBe('')
  })

  test('prompts for Ultimate Guitar paste when lyrics succeed but chords do not', async function() {
    const tune = { id: 't5', name: 'Wonderwall', composer: 'Oasis' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }
    let lyricsEmpty = true

    searchChords.mockResolvedValue({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-123',
        title: 'Wonderwall',
        source: 'ultimate-guitar.com',
        host: 'tabs.ultimate-guitar.com',
        contentType: 'chords',
      }],
    })
    searchLyrics.mockResolvedValue({ text: 'Today is gonna be the day' })
    searchNotation.mockResolvedValue({ empty: true })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      if (kind === 'lyrics') return lyricsEmpty
      if (kind === 'chords') return true
      return false
    })
    applyCandidateToTune.mockImplementation(function() {
      lyricsEmpty = false
      return true
    })

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t5')
    expect(state.pending).toBe(false)
    expect(state.needsChordPaste).toBe(true)
    expect(state.chordPasteCandidate.url).toBe(
      'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-123'
    )
    expect(state.message).toMatch(/Ultimate Guitar/i)
  })

  test('prompts for MuseScore paste when notation finds only gated scores', async function() {
    const tune = { id: 't6', name: 'Song', composer: 'Writer' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://musescore.com/user/1/scores/42',
        title: 'Song',
        source: 'musescore.com',
        contentType: 'notation',
      }],
    })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'notation' || kind === 'chords'
    })
    applyCandidateToTune.mockReturnValue(false)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t6')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.url).toContain('musescore.com')
    expect(state.failure).toBe('')
  })

  test('handles early notation rejection without unhandled rejection', async function() {
    const tune = { id: 't4', name: 'Song', composer: 'Writer' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }
    const unhandled = []
    function onUnhandled(event) {
      unhandled.push(event.reason)
    }
    process.on('unhandledRejection', onUnhandled)

    let resolveChords
    let resolveLyrics
    searchChords.mockImplementation(function() {
      return new Promise(function(resolve) { resolveChords = resolve })
    })
    searchLyrics.mockImplementation(function() {
      return new Promise(function(resolve) { resolveLyrics = resolve })
    })
    searchNotation.mockRejectedValue(new Error('No ABC notation found for this tune'))
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'notation'
    })

    const promise = runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(unhandled).toEqual([])

    resolveChords({ empty: true })
    resolveLyrics({ empty: true })
    await promise

    process.removeListener('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
    expect(getAddTuneAutoEnrichState('t4').failure).toBe(
      'Could not find lyrics or notation for this tune.'
    )
  })
})
