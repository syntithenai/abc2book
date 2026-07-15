import {
  buildThesessionSettingAbc,
  extractThesessionTuneMeta,
  searchThesessionNotation,
  sortNotationCandidates,
} from './thesessionNotationClient'
import { scoreTitleArtistMatch } from './notationMatchUtils'
import { searchNotationLight } from './notationSearchLight'
import * as localAbcCollectionSearch from './localAbcCollectionSearch'
import * as textSearchIndexUtils from './textSearchIndexUtils'

jest.mock('./localAbcCollectionSearch', function() {
  return {
    loadTextSearchIndexFromResource: jest.fn(function() {
      return Promise.resolve({ tokens: {} })
    }),
    searchLocalCollection: jest.fn(function() { return [] }),
    searchLocalCollectionNotation: jest.fn(function() { return Promise.resolve([]) }),
  }
})

jest.mock('./thesessionNotationClient', function() {
  const actual = jest.requireActual('./thesessionNotationClient')
  return Object.assign({}, actual, {
    searchThesessionNotation: jest.fn(function() { return Promise.resolve([]) }),
  })
})

describe('thesessionNotationClient helpers', function() {
  test('buildThesessionSettingAbc wraps body-only notation', function() {
    const tune = { name: 'Snow On The Tracks', type: 'march', composer: 'Rachel Darling' }
    const setting = {
      id: 43446,
      key: 'Dmajor',
      abc: '|:d2 c2A2|B2AG F2A2-|AA,DE F2A2|E3E- EEDE|D2:|',
    }
    const abc = buildThesessionSettingAbc(tune, setting)
    expect(abc).toContain('T:Snow On The Tracks')
    expect(abc).toContain('C:Rachel Darling')
    expect(abc).toContain('R:march')
    expect(abc).toContain('K:Dmajor')
    expect(abc).toContain('|:d2 c2A2')
  })

  test('buildThesessionSettingAbc leaves full ABC unchanged', function() {
    const fullAbc = 'X:1\nT:Existing\nK:G\nGAB|'
    expect(buildThesessionSettingAbc({}, { abc: fullAbc })).toBe(fullAbc)
  })

  test('extractThesessionTuneMeta includes comments and links', function() {
    const tune = {
      id: 21706,
      name: 'Snow On The Tracks',
      type: 'march',
      composer: 'Rachel Darling',
      url: 'https://thesession.org/tunes/21706',
      aliases: ['Snow'],
      recordings: 1,
      tunebooks: 44,
      comments: [{
        content: 'Beautiful tune by Rachel Darling.',
        member: { name: 'bdh' },
        date: '2022-03-26 13:50:09',
      }],
    }
    const setting = {
      id: 43446,
      key: 'Dmajor',
      url: 'https://thesession.org/tunes/21706#setting43446',
      member: { name: 'bdh' },
      date: '2022-03-26 13:50:09',
    }
    const meta = extractThesessionTuneMeta(tune, setting)
    expect(meta.name).toBe('Snow On The Tracks')
    expect(meta.composer).toBe('Rachel Darling')
    expect(meta.rhythm).toBe('march')
    expect(meta.aliases).toEqual(['Snow'])
    expect(meta.srcUrl).toBe('https://thesession.org/tunes/21706')
    expect(meta.backgroundInfo).toContain('Beautiful tune')
    expect(meta.backgroundInfo).toContain('Setting contributed by bdh')
    expect(meta.links[0].link).toBe('https://thesession.org/tunes/21706')
    expect(meta.meta.thesession_tune_id).toEqual(['21706'])
    expect(meta.meta.thesession_setting_id).toEqual(['43446'])
  })

  test('sortNotationCandidates prefers exact title matches', function() {
    const candidates = [
      { title: 'Other Tune', artist: '', abc: 'X:1\nK:G\nGAB|' },
      { title: 'Drowsy Maggie', artist: 'Traditional', abc: 'X:1\nK:Edor\nE2|' },
    ]
    const sorted = sortNotationCandidates(candidates, 'Drowsy Maggie', '')
    expect(sorted[0].title).toBe('Drowsy Maggie')
  })

  test('scoreTitleArtistMatch ranks exact title and artist highest', function() {
    expect(scoreTitleArtistMatch('Wild Rover', 'Traditional', 'Wild Rover', 'Traditional')).toBe(140)
    expect(scoreTitleArtistMatch('Wild Rover Song', '', 'Wild Rover', '')).toBeGreaterThanOrEqual(45)
  })

  test('scoreTitleArtistMatch rejects short substring false positives', function() {
    expect(scoreTitleArtistMatch('Clare', '', 'Clare de Lune', '')).toBe(0)
    expect(scoreTitleArtistMatch('Clare de Lune', '', 'Clare de Lune', '')).toBe(80)
  })
})

describe('searchNotationLight', function() {
  beforeEach(function() {
    localAbcCollectionSearch.loadTextSearchIndexFromResource.mockClear()
    localAbcCollectionSearch.searchLocalCollection.mockReset()
    localAbcCollectionSearch.searchLocalCollection.mockReturnValue([])
    localAbcCollectionSearch.searchLocalCollectionNotation.mockReset()
    localAbcCollectionSearch.searchLocalCollectionNotation.mockResolvedValue([])
    searchThesessionNotation.mockReset()
    searchThesessionNotation.mockResolvedValue([])
    jest.spyOn(textSearchIndexUtils, 'isStrongLocalMatch').mockReturnValue(false)
  })

  afterEach(function() {
    textSearchIndexUtils.isStrongLocalMatch.mockRestore()
  })

  test('requires a title', async function() {
    await expect(searchNotationLight({ title: '' })).rejects.toThrow('Song title is required')
  })

  test('short-circuits on strong local match without querying The Session', async function() {
    const localCandidate = {
      abc: 'X:1\nT:Drowsy Maggie\nK:Edor\n|:E2|',
      title: 'Drowsy Maggie',
      artist: 'Traditional',
      source: 'Norbeck',
    }
    localAbcCollectionSearch.searchLocalCollection.mockReturnValue([{ name: 'Drowsy Maggie' }])
    localAbcCollectionSearch.searchLocalCollectionNotation.mockResolvedValue([localCandidate])
    textSearchIndexUtils.isStrongLocalMatch.mockReturnValue(true)

    const result = await searchNotationLight({
      title: 'Drowsy Maggie',
      abcTools: { json2abc: function() { return '' } },
    })

    expect(searchThesessionNotation).not.toHaveBeenCalled()
    expect(result.multiple).toBe(false)
    expect(result.abc).toContain('K:Edor')
    expect(result.source).toBe('Norbeck')
  })

  test('queries The Session when local match is not strong', async function() {
    const sessionCandidate = {
      abc: 'X:1\nT:Wild Rover\nK:G\nGAB|',
      title: 'Wild Rover',
      artist: 'Traditional',
      source: 'thesession.org',
      sourceUrl: 'https://thesession.org/tunes/123',
    }
    searchThesessionNotation.mockResolvedValue([sessionCandidate])

    const progress = []
    const result = await searchNotationLight({
      title: 'Wild Rover',
      abcTools: { json2abc: function() { return '' } },
      onProgress: function(message, percent, stage) {
        progress.push({ message: message, percent: percent, stage: stage })
      },
    })

    expect(searchThesessionNotation).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Wild Rover',
    }))
    expect(result.multiple).toBe(false)
    expect(result.abc).toContain('K:G')
    expect(progress.some(function(entry) { return entry.stage === 'thesession' })).toBe(true)
  })

  test('returns multiple candidates when several matches are found', async function() {
    searchThesessionNotation.mockResolvedValue([
      {
        abc: 'X:1\nT:Wild Rover\nK:G\nGAB|',
        title: 'Wild Rover',
        artist: 'Traditional',
        source: 'thesession.org',
      },
      {
        abc: 'X:2\nT:Wild Rover\nK:D\nDEF|',
        title: 'Wild Rover',
        artist: 'Traditional',
        source: 'thesession.org',
      },
    ])

    const result = await searchNotationLight({ title: 'Wild Rover' })

    expect(result.multiple).toBe(true)
    expect(result.candidates).toHaveLength(2)
  })

  test('throws when no notation is found', async function() {
    await expect(searchNotationLight({ title: 'Obscure Tune XYZ' }))
      .rejects.toThrow('No ABC notation found for this tune')
  })
})
