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
})
