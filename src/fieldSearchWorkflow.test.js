import { harvestAliasesFromNotationResult } from './aliasesSearchClient'
import { isTuneFieldEmptyForKind, applyCandidateToTune } from './fieldLookupApplyUtils'
import { buildSearchModeOptions } from './tuneFieldLookupQueue'
import { removeImportReviewCandidatesByFieldLookupJobId } from './importReviewSession'

describe('aliasesSearchClient harvest', function() {
  test('harvests Session aliases and alternate titles', function() {
    const candidates = harvestAliasesFromNotationResult({
      multiple: true,
      candidates: [
        {
          title: 'Snowy Path',
          source: 'The Session',
          sourceUrl: 'https://thesession.org/tunes/1',
          tuneMeta: {
            name: 'The Snowy Path',
            aliases: ['Snow Path', 'Snowy Path'],
          },
        },
        {
          title: 'Other Setting',
          source: 'abcnotation.com',
          tuneMeta: {
            aliases: ['Cold Path'],
          },
        },
      ],
    }, {
      title: 'The Snowy Path',
      existingAliases: ['Already Have'],
    })
    const names = candidates.map(function(c) { return c.alias })
    expect(names).toContain('Snow Path')
    expect(names).toContain('Other Setting')
    expect(names).toContain('Cold Path')
    expect(names).not.toContain('The Snowy Path')
    expect(names).not.toContain('Already Have')
    expect(candidates[0].source).toMatch(/session/i)
  })
})

describe('fieldLookupApplyUtils new kinds', function() {
  test('isTuneFieldEmptyForKind for genre artists aliases', function() {
    expect(isTuneFieldEmptyForKind({}, 'genre')).toBe(true)
    expect(isTuneFieldEmptyForKind({ genres: ['Folk'] }, 'genre')).toBe(false)
    expect(isTuneFieldEmptyForKind({ artists: [] }, 'artists')).toBe(true)
    expect(isTuneFieldEmptyForKind({ artists: ['A'] }, 'artists')).toBe(false)
    expect(isTuneFieldEmptyForKind({ aliases: ['X'] }, 'aliases')).toBe(false)
  })

  test('applyCandidateToTune appends artists and aliases', function() {
    const tune = { artists: ['A'], aliases: [] }
    expect(applyCandidateToTune(tune, 'artists', { artist: 'B' })).toBe(true)
    expect(tune.artists).toEqual(['A', 'B'])
    expect(applyCandidateToTune(tune, 'aliases', { alias: 'Alt' })).toBe(true)
    expect(tune.aliases).toEqual(['Alt'])
    expect(applyCandidateToTune(tune, 'genre', { genre: 'Jazz' })).toBe(true)
    expect(tune.genres).toEqual(['Jazz'])
  })
})

describe('buildSearchModeOptions', function() {
  test('maps auto and review', function() {
    expect(buildSearchModeOptions('auto')).toEqual({ searchMode: 'auto', alwaysPick: false })
    expect(buildSearchModeOptions('review', { updateLyrics: true })).toEqual({
      updateLyrics: true,
      searchMode: 'review',
      alwaysPick: true,
    })
  })
})

describe('removeImportReviewCandidatesByFieldLookupJobId', function() {
  test('removes linked candidate and completes empty session', function() {
    const session = {
      candidates: [
        { id: 'c1', fieldLookupJobId: 'job-1', tune: { name: 'A' } },
        { id: 'c2', fieldLookupJobId: 'job-2', tune: { name: 'B' } },
      ],
      index: 0,
      step: 'review',
    }
    const next = removeImportReviewCandidatesByFieldLookupJobId(session, 'job-1')
    expect(next.candidates.length).toBe(1)
    expect(next.candidates[0].id).toBe('c2')
    const empty = removeImportReviewCandidatesByFieldLookupJobId(next, 'job-2')
    expect(empty.candidates.length).toBe(0)
    expect(empty.step).toBe('done')
  })
})
