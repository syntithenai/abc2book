import {
  promoteAwaitingFieldLookups,
} from './fieldLookupReviewPromotion'
import {
  seedAwaitingLookup,
  __resetForTests,
  getState as getFieldLookupState,
} from './tuneFieldLookupQueue'

describe('fieldLookupReviewPromotion', function() {
  beforeEach(function() {
    __resetForTests()
  })

  test('promoteAwaitingFieldLookups never promotes into Import Review', function() {
    const id = seedAwaitingLookup({
      tuneId: 't1',
      kind: 'composer',
      title: 'Song',
      candidates: [{ artist: 'A', source: 'web' }],
    })
    expect(id).toBeTruthy()
    const result = promoteAwaitingFieldLookups({
      session: null,
      getTune: function() {
        return { id: 't1', name: 'Song', composer: '' }
      },
    })
    expect(result.candidates).toEqual([])
    expect(result.linkedJobIds || result.jobIds || []).toEqual([])
    const job = getFieldLookupState().jobs.find(function(item) { return item.id === id })
    expect(job.status).toBe('awaiting')
    expect(job.reviewCandidateId).toBeFalsy()
  })
})
