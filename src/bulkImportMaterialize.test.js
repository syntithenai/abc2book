import { materializeBulkImportCandidates } from './bulkImportMaterialize'

describe('bulkImportMaterialize', function() {
  test('saves each candidate into the book and returns merge targets', function() {
    const saved = []
    const tunebook = {
      saveTune: jest.fn(function(tune) {
        if (!tune.id) tune.id = 'tune-' + saved.length
        saved.push(tune)
        return tune
      }),
    }

    const result = materializeBulkImportCandidates([
      {
        id: 'c1',
        sourceKind: 'bulk-text',
        youtubeUrl: 'https://youtu.be/abc',
        tune: { name: 'Breathe', composer: 'Pink Floyd', links: [{ link: 'https://youtu.be/abc' }] },
      },
      {
        id: 'c2',
        sourceKind: 'bulk-text',
        tune: { name: 'Time', composer: 'Pink Floyd', books: ['other'] },
      },
    ], {
      tunebook: tunebook,
      book: 'Dark Side',
      enhance: true,
    })

    expect(tunebook.saveTune).toHaveBeenCalledTimes(2)
    expect(result.savedTunes).toHaveLength(2)
    expect(result.firstTuneId).toBe('tune-0')
    expect(result.savedTunes[0].books).toEqual(['dark side'])
    expect(result.savedTunes[1].books).toEqual(['other', 'dark side'])
    expect(result.mergeCandidates[0].mergeTargetId).toBe('tune-0')
    expect(result.mergeCandidates[0].mergeStatus).toBe('exactId')
    expect(result.mergeCandidates[0].mergeMode).toBe('suggestOnly')
    expect(result.mergeCandidates[0].skipEnrich).toBe(false)
    expect(result.mergeCandidates[0].youtubeUrl).toBe('https://youtu.be/abc')
    expect(result.mergeCandidates[1].mergeTargetId).toBe('tune-1')
  })

  test('marks skipEnrich when enhance is off', function() {
    const tunebook = {
      saveTune: jest.fn(function(tune) {
        tune.id = 'saved'
        return tune
      }),
    }
    const result = materializeBulkImportCandidates([
      { tune: { name: 'Song', composer: 'A' } },
    ], { tunebook: tunebook, book: 'songs', enhance: false })
    expect(result.mergeCandidates[0].skipEnrich).toBe(true)
  })

  test('returns empty result without tunebook.saveTune', function() {
    const result = materializeBulkImportCandidates([{ tune: { name: 'A' } }], {})
    expect(result.savedTunes).toEqual([])
    expect(result.mergeCandidates).toEqual([])
    expect(result.firstTuneId).toBe('')
  })
})
