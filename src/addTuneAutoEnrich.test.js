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
    dismissAddTuneAutoEnrichFailure('t7')
    dismissAddTuneAutoEnrichFailure('t8')
    dismissAddTuneAutoEnrichFailure('t11')
    dismissAddTuneAutoEnrichFailure('t12')
  })

  test('pickFirstSearchCandidate prefers first candidate from multi results', function() {
    expect(pickFirstSearchCandidate({
      candidates: [{ title: 'A' }, { title: 'B' }],
    })).toEqual({ title: 'A' })
  })

  test('applies notation even when lyrics were found', async function() {
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
    searchNotation.mockResolvedValue({
      abc: 'X:1\nK:C\nC D E F|',
      title: 'Song',
      artist: 'Writer',
      source: 'musescore.com',
    })
    commitChordSearchResultToTune.mockReturnValue({
      ok: true,
      lyricLines: ['line'],
    })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'chords' || kind === 'notation'
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
    expect(applyCandidateToTune).toHaveBeenCalledWith(
      tune,
      'lyrics',
      { text: 'lyrics text' },
      tunebook.abcTools
    )
    expect(applyCandidateToTune).toHaveBeenCalledWith(
      tune,
      'notation',
      expect.objectContaining({ abc: 'X:1\nK:C\nC D E F|' }),
      tunebook.abcTools
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
      return Promise.resolve({
        abc: 'X:1\nK:C\nC D E F|',
        title: 'Song',
        artist: 'Writer',
        source: 'musescore.com',
      })
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
      expect.objectContaining({ abc: 'X:1\nK:C\nC D E F|' }),
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

  test('offers MuseScore search when lyrics and auto notation both miss', async function() {
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
    const state = getAddTuneAutoEnrichState('t3')
    expect(state.failure).toBe('')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.searchFallback).toBe(true)

    dismissAddTuneAutoEnrichFailure('t3')
    expect(getAddTuneAutoEnrichState('t3').failure).toBe('')
  })

  test('offers Ultimate Guitar paste before MuseScore when chord manual exists', async function() {
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
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.url).toContain('musescore.com')
    expect(state.needsChordPaste).toBe(true)
    expect(state.chordPasteCandidate.url).toBe(
      'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-123'
    )
  })

  test('offers Ultimate Guitar paste without lyrics when chord manual exists', async function() {
    const tune = { id: 't12', name: 'Hells Bells', composer: 'AC/DC' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://tabs.ultimate-guitar.com/tab/ac-dc/hells-bells-chords-123',
        title: 'Hells Bells',
        source: 'ultimate-guitar.com',
        host: 'tabs.ultimate-guitar.com',
        contentType: 'chords',
      }],
    })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({ empty: true })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'chords' || kind === 'notation'
    })

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t12')
    expect(state.needsChordPaste).toBe(true)
    expect(state.needsNotationPaste).toBe(true)
    expect(state.chordPasteCandidate.url).toContain('ultimate-guitar.com')
  })

  test('prompts for MuseScore paste when lyrics succeed but notation is gated', async function() {
    const tune = { id: 't7', name: 'Apres un reve', composer: 'Faure' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }
    let lyricsEmpty = true

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ text: 'Dans un sommeil' })
    searchNotation.mockResolvedValue({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://musescore.com/user/1/scores/42',
        title: 'Apres un reve',
        source: 'musescore.com',
        contentType: 'notation',
      }],
    })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      if (kind === 'lyrics') return lyricsEmpty
      if (kind === 'chords') return true
      if (kind === 'notation') return true
      return false
    })
    applyCandidateToTune.mockImplementation(function(_tune, kind) {
      if (kind === 'lyrics') lyricsEmpty = false
      return kind === 'lyrics'
    })

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t7')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.url).toContain('musescore.com')
    expect(state.needsChordPaste).toBe(false)
    expect(state.failure).toBe('')
    expect(state.message).toMatch(/MuseScore/i)
  })

  test('prompts MuseScore search when notation search returns nothing', async function() {
    const tune = { id: 't8', name: 'Apres un reve', composer: 'Gabriel Faure' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ text: 'Dans un sommeil' })
    searchNotation.mockResolvedValue({ empty: true })
    commitChordSearchResultToTune.mockReturnValue({ ok: false })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'notation' || kind === 'chords'
    })
    applyCandidateToTune.mockReturnValue(true)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t8')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.searchFallback).toBe(true)
    expect(state.notationPasteCandidate.url).toContain('musescore.com')
    expect(state.needsChordPaste).toBe(false)
  })

  test('shouldSkipAbcMergeForChordPaste when real melody and lyrics exist', function() {
    const { shouldSkipAbcMergeForChordPaste } = require('./addTuneAutoEnrich')
    expect(shouldSkipAbcMergeForChordPaste({
      voices: { '1': { notes: ['C D E F |'] } },
      words: ['Dans un sommeil'],
    })).toBe(true)
    expect(shouldSkipAbcMergeForChordPaste({
      voices: { '1': { notes: ['z4 |'] } },
      words: ['Dans un sommeil'],
    })).toBe(false)
    expect(shouldSkipAbcMergeForChordPaste({
      voices: { '1': { notes: ['C D E F |'] } },
      words: [],
    })).toBe(false)
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

  test('does not prompt MuseScore paste when notation is paywalled only', async function() {
    const tune = { id: 't9', name: 'Bach Suite', composer: 'Bach' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({
      empty: true,
      found: false,
      musescorePaywalled: true,
      manualCandidates: [],
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

    const state = getAddTuneAutoEnrichState('t9')
    expect(state.needsNotationPaste).toBe(false)
    expect(state.musescorePaywalled).toBe(true)
    expect(state.message).toMatch(/PRO or purchase/i)
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
    // Notation search failed but MuseScore search fallback still offered.
    const state = getAddTuneAutoEnrichState('t4')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.notationPasteCandidate.searchFallback).toBe(true)
    expect(state.failure).toBe('')
  })

  test('skips weak Session notation for named-artist songs', async function() {
    const tune = { id: 't9', name: 'Back in Black', composer: 'AC/DC' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({
      source: 'thesession.org',
      title: 'Black Joke (jig)',
      abc: 'X:1\nK:D\n|:A2|',
    })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'chords' || kind === 'notation'
    })
    applyCandidateToTune.mockReturnValue(true)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    expect(applyCandidateToTune).not.toHaveBeenCalledWith(
      tune,
      'notation',
      expect.anything(),
      tunebook.abcTools
    )
  })

  test('shows enrichment source summary after successful lookup', async function() {
    const tune = { id: 't10', name: 'Song', composer: 'Writer' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({
      chordText: 'C | G |',
      source: 'ultimate-guitar.com',
    })
    searchLyrics.mockResolvedValue({ text: 'lyrics text', source: 'lyrics.ovh' })
    searchNotation.mockResolvedValue({
      abc: 'X:1\nK:C\nC D E F|',
      title: 'Song',
      artist: 'Writer',
      source: 'musescore.com',
    })
    commitChordSearchResultToTune.mockReturnValue({ ok: true, lyricLines: [] })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'lyrics' || kind === 'chords' || kind === 'notation'
    })
    applyCandidateToTune.mockReturnValue(true)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t10')
    expect(state.summary).toContain('Chords from ultimate-guitar.com')
    expect(state.summary).toContain('Lyrics from lyrics.ovh')
    expect(state.summary).toContain('Notation from musescore.com')
  })

  test('shows enrichment source summary when notation still needs paste', async function() {
    const tune = { id: 't11', name: 'Hells Bells', composer: 'AC/DC' }
    const tunebook = {
      abcTools: {},
      saveTune: jest.fn(),
    }

    searchChords.mockResolvedValue({
      chordText: 'A | D |',
      source: 'ultimate-guitar.com',
    })
    searchLyrics.mockResolvedValue({ text: 'lyrics text', source: 'lyrics.ovh' })
    searchNotation.mockResolvedValue({ empty: true, found: false, manualCandidates: [] })
    commitChordSearchResultToTune.mockReturnValue({ ok: true, lyricLines: ['line'] })
    isTuneFieldEmptyForKind.mockImplementation(function(_tune, kind) {
      return kind === 'notation' || kind === 'chords' || kind === 'lyrics'
    })
    applyCandidateToTune.mockReturnValue(true)

    await runAddTuneAutoEnrich({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: jest.fn() },
      accessToken: 'token',
      resolverAvailable: true,
      forceRefresh: jest.fn(),
    })

    const state = getAddTuneAutoEnrichState('t11')
    expect(state.needsNotationPaste).toBe(true)
    expect(state.summary).toContain('Chords from ultimate-guitar.com')
    expect(state.summary).toContain('Lyrics from lyrics.ovh')
    expect(state.summary).toContain('Not found: notation')
  })
})
