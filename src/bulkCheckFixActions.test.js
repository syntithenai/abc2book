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

import { searchChords } from './chordsSearchClient'
import { searchLyrics } from './lyricsSearchClient'
import { runBulkCheckFixAction } from './bulkCheckFixActions'
import { CHORDS_LIGHT_ERROR } from './chordsSearchLight'

describe('bulkCheckFixActions chords/lyrics fallback', function() {
  const tunebook = {
    abcTools: {},
    saveTune: jest.fn(),
    utils: {},
  }

  beforeEach(function() {
    searchChords.mockReset()
    searchLyrics.mockReset()
    tunebook.saveTune.mockReset()
  })

  test('searchChordsLyrics falls back to lyrics when chords light path fails', async function() {
    searchChords.mockRejectedValue(new Error(CHORDS_LIGHT_ERROR))
    searchLyrics.mockResolvedValue({
      multiple: false,
      text: 'Wild rover wild rover',
      lines: ['Wild rover wild rover'],
      artist: 'Traditional',
    })

    const tune = { id: 't1', name: 'Wild Rover', composer: 'Traditional', voices: { '1': { notes: [] } } }
    const next = await runBulkCheckFixAction('searchChordsLyrics', {
      tune: tune,
      tunebook: tunebook,
      token: 'token',
      resolverAvailable: false,
      getTuneById: function() { return tune },
    })

    expect(searchChords).toHaveBeenCalledWith(expect.objectContaining({
      resolverAvailable: false,
    }))
    expect(searchLyrics).toHaveBeenCalledWith(expect.objectContaining({
      resolverAvailable: false,
    }))
    expect(next.words || next.wLines).toBeTruthy()
  })
})
