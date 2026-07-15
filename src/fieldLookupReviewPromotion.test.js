import {
  buildImportedTuneFromFieldLookup,
  buildFieldLookupReviewCandidate,
  getUnpromotedAwaitingFieldLookups,
  promoteAwaitingFieldLookups,
} from './fieldLookupReviewPromotion'
import {
  __resetForTests,
  seedAwaitingLookup,
  getState,
} from './tuneFieldLookupQueue'

describe('fieldLookupReviewPromotion', function() {
  beforeEach(function() {
    __resetForTests()
  })

  test('buildImportedTuneFromFieldLookup applies composer candidate', function() {
    const job = {
      kind: 'composer',
      title: 'Song',
      candidates: [{ artist: 'New Artist', source: 'test' }],
    }
    const imported = buildImportedTuneFromFieldLookup(job, { name: 'Song', composer: 'Old' }, null)
    expect(imported.name).toBe('Song')
    expect(imported.composer).toBe('New Artist')
  })

  test('buildFieldLookupReviewCandidate sets merge target and metadata', function() {
    const job = {
      id: 'job-1',
      kind: 'composer',
      tuneId: 'tune-1',
      title: 'Song',
      candidates: [{ artist: 'A', source: 'test' }],
    }
    const candidate = buildFieldLookupReviewCandidate(job, { name: 'Song', composer: 'Old' }, null)
    expect(candidate.mergeTargetId).toBe('tune-1')
    expect(candidate.sourceKind).toBe('search-composer')
    expect(candidate.skipEnrich).toBe(true)
    expect(candidate.fieldLookupJobId).toBe('job-1')
    expect(candidate.fieldLookupKind).toBe('composer')
    expect(candidate.tune.composer).toBe('A')
  })

  test('promoteAwaitingFieldLookups links jobs and returns candidates', function() {
    const id = seedAwaitingLookup({
      tuneId: 'tune-9',
      kind: 'composer',
      title: 'Hello',
      candidates: [
        { artist: 'One', source: 'a' },
        { artist: 'Two', source: 'b' },
      ],
    })
    expect(id).toBeTruthy()
    expect(getUnpromotedAwaitingFieldLookups().length).toBe(1)

    const result = promoteAwaitingFieldLookups({
      getTune: function() {
        return { id: 'tune-9', name: 'Hello', composer: 'Existing' }
      },
    })
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0].mergeTargetId).toBe('tune-9')
    expect(getUnpromotedAwaitingFieldLookups().length).toBe(0)

    const job = getState().jobs.find(function(item) { return item.id === id })
    expect(job.reviewCandidateId).toBe(result.candidates[0].id)
    expect(job.candidateId).toBe(result.candidates[0].id)
  })

  test('auto mode awaiting jobs are not promoted', function() {
    const id = seedAwaitingLookup({
      tuneId: 'tune-auto',
      kind: 'composer',
      title: 'Hello',
      candidates: [{ artist: 'One', source: 'a' }],
      options: { searchMode: 'auto' },
    })
    expect(id).toBeTruthy()
    expect(getUnpromotedAwaitingFieldLookups().length).toBe(0)
    const result = promoteAwaitingFieldLookups({
      getTune: function() {
        return { id: 'tune-auto', name: 'Hello', composer: '' }
      },
    })
    expect(result.candidates.length).toBe(0)
  })

  test('review mode awaiting jobs are promoted', function() {
    const id = seedAwaitingLookup({
      tuneId: 'tune-rev',
      kind: 'aliases',
      title: 'Hello',
      candidates: [{ alias: 'Other', source: 'The Session' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    expect(id).toBeTruthy()
    expect(getUnpromotedAwaitingFieldLookups().length).toBe(1)
    const result = promoteAwaitingFieldLookups({
      getTune: function() {
        return { id: 'tune-rev', name: 'Hello', aliases: [] }
      },
    })
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0].sourceKind).toBe('search-aliases')
    expect(result.candidates[0].tune.aliases).toEqual(['Other'])
  })

  test('promoteAwaitingFieldLookups coalesces multiple kinds for one tune', function() {
    const composerId = seedAwaitingLookup({
      tuneId: 'tune-coalesce',
      kind: 'composer',
      title: 'Hello',
      candidates: [{ artist: 'Composer A', source: 'mb' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    const lyricsId = seedAwaitingLookup({
      tuneId: 'tune-coalesce',
      kind: 'lyrics',
      title: 'Hello',
      candidates: [{ text: 'line one', source: 'web' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    const otherTune = seedAwaitingLookup({
      tuneId: 'tune-other',
      kind: 'composer',
      title: 'Other',
      candidates: [{ artist: 'Other Artist', source: 'mb' }],
      options: { searchMode: 'review', alwaysPick: true },
    })
    expect(composerId && lyricsId && otherTune).toBeTruthy()

    const result = promoteAwaitingFieldLookups({
      getTune: function(id) {
        if (id === 'tune-coalesce') return { id: 'tune-coalesce', name: 'Hello', composer: '' }
        return { id: 'tune-other', name: 'Other', composer: '' }
      },
    })
    expect(result.candidates.length).toBe(2)
    const coalesced = result.candidates.find(function(item) {
      return item.mergeTargetId === 'tune-coalesce'
    })
    expect(coalesced).toBeTruthy()
    expect(coalesced.sourceKind).toBe('search-multi')
    expect(coalesced.fieldLookupJobIds.sort()).toEqual([composerId, lyricsId].sort())
    expect(coalesced.fieldLookupKinds.sort()).toEqual(['composer', 'lyrics'].sort())
    expect(coalesced.tune.composer).toBe('Composer A')
    expect(Array.isArray(coalesced.tune.words) || Array.isArray(coalesced.tune.wLines) || coalesced.tune.words || coalesced.fieldChoices).toBeTruthy()

    const composerJob = getState().jobs.find(function(item) { return item.id === composerId })
    const lyricsJob = getState().jobs.find(function(item) { return item.id === lyricsId })
    expect(composerJob.reviewCandidateId).toBe(coalesced.id)
    expect(lyricsJob.reviewCandidateId).toBe(coalesced.id)
  })
})
