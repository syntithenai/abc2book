jest.mock('./chordsSearchClient', function() {
  return { searchChords: jest.fn() }
})
jest.mock('./lyricsSearchClient', function() {
  return { searchLyrics: jest.fn() }
})
jest.mock('./notationSearchClient', function() {
  return { searchNotation: jest.fn() }
})
jest.mock('./commitChordSearchResultToTune', function() {
  return {
    commitChordSearchResultToTune: jest.fn(function() {
      return { ok: true, lyricLines: ['Line one'] }
    }),
  }
})
jest.mock('./tuneMetadataEnhance', function() {
  return { enrichTuneMetadataFromMusicBrainz: jest.fn().mockResolvedValue({ applied: {} }) }
})

import { searchChords } from './chordsSearchClient'
import { searchLyrics } from './lyricsSearchClient'
import { searchNotation } from './notationSearchClient'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import { enrichBulkImportCandidates, enrichBulkImportTune } from './bulkImportEnhance'
import { applyCandidateToTune } from './fieldLookupApplyUtils'
import { enrichTuneMetadataFromMusicBrainz } from './tuneMetadataEnhance'

jest.mock('./fieldLookupApplyUtils', function() {
  const actual = jest.requireActual('./fieldLookupApplyUtils')
  return Object.assign({}, actual, {
    applyCandidateToTune: jest.fn(actual.applyCandidateToTune),
  })
})

describe('bulkImportEnhance', function() {
  const tunebook = {
    abcTools: {
      abc2json: jest.fn(function(abc) {
        return {
          voices: { '1': { meta: '', notes: String(abc || '').split('\n') } },
        }
      }),
    },
  }

  beforeEach(function() {
    searchChords.mockReset()
    searchLyrics.mockReset()
    searchNotation.mockReset()
    commitChordSearchResultToTune.mockClear()
    applyCandidateToTune.mockClear()
  })

  test('enrichBulkImportTune skips chord search when title or artist missing but runs metadata', async function() {
    const tune = await enrichBulkImportTune({ name: 'Song', composer: '' }, { tunebook: tunebook })
    expect(searchChords).not.toHaveBeenCalled()
    expect(enrichTuneMetadataFromMusicBrainz).toHaveBeenCalled()
    expect(tune.name).toBe('Song')
  })

  test('enrichBulkImportTune searches chords, lyrics, and notation', async function() {
    searchChords.mockResolvedValue({ chordText: 'C G Am F' })
    searchLyrics.mockResolvedValue({ text: 'Hello world' })
    searchNotation.mockResolvedValue({
      candidates: [{ abc: 'X:1\nT:Song\nM:4/4\nK:C\nC D E F |' }],
    })

    await enrichBulkImportTune(
      { name: 'Song', composer: 'Artist', voices: { '1': { meta: '', notes: ['z4'] } } },
      { tunebook: tunebook, accessToken: 'token' }
    )

    expect(searchChords).toHaveBeenCalled()
    expect(searchLyrics).toHaveBeenCalled()
    expect(searchChords.mock.calls[0][0]).toEqual(expect.objectContaining({
      preferRemoteChords: true,
      skipLocalChords: true,
    }))
    expect(searchNotation).toHaveBeenCalled()
    expect(commitChordSearchResultToTune).toHaveBeenCalled()
    expect(commitChordSearchResultToTune.mock.calls[0][0].skipSave).toBe(true)
    expect(applyCandidateToTune).toHaveBeenCalled()
  })

  test('enrichBulkImportCandidates reports progress and returns enriched candidates', async function() {
    searchChords.mockResolvedValue({ empty: true })
    searchLyrics.mockResolvedValue({ empty: true })
    searchNotation.mockResolvedValue({ empty: true })

    const progress = []
    const result = await enrichBulkImportCandidates([
      { id: 'c1', tune: { name: 'One', composer: 'A' } },
      { id: 'c2', tune: { name: 'Two', composer: 'B' } },
    ], {
      tunebook: tunebook,
      onProgress: function(info) { progress.push(info) },
    })

    expect(result).toHaveLength(2)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[0].message).toMatch(/Enhancing 1 of 2: One/)
    expect(progress.some(function(item) { return item.step === 'chords' })).toBe(true)
    expect(progress.some(function(item) { return item.step === 'lyrics' })).toBe(true)
    expect(progress.some(function(item) { return item.step === 'notation' })).toBe(true)
  })
})
