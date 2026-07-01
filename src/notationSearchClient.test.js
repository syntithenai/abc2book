import { normalizeNotationSearch, handleNotationSearchStreamEvent } from './notationSearchClient'

describe('notationSearchClient', function() {
    test('normalizeNotationSearch builds abc candidate', function() {
    const result = normalizeNotationSearch({
      abc: 'X:1\nT:Drowsy Maggie\nM:4/4\nL:1/8\nK:Edor\n|:E2|',
      source: 'thesession.org',
      sourceUrl: 'https://thesession.org/tunes/123',
      title: 'Drowsy Maggie',
      tuneMeta: {
        composer: 'Traditional',
        srcUrl: 'https://thesession.org/tunes/123',
      },
    })

    expect(result.abc).toContain('K:Edor')
    expect(result.source).toBe('thesession.org')
    expect(result.artist).toBe('Traditional')
    expect(result.tuneMeta.composer).toBe('Traditional')
    expect(result.multiple).toBe(false)
  })

  test('normalizeNotationSearch handles multiple candidates', function() {
    const result = normalizeNotationSearch({
      multiple: true,
      candidates: [
        {
          abc: 'X:1\nK:G\nGAB|',
          source: 'thesession.org',
          title: 'Tune A',
        },
        {
          abc: 'X:2\nK:D\nDEF|',
          source: 'abcnotation.com',
          title: 'Tune B',
        },
      ],
    })

    expect(result.multiple).toBe(true)
    expect(result.candidates).toHaveLength(2)
  })

  test('normalizeNotationSearch rejects empty abc', function() {
    expect(function() {
      normalizeNotationSearch({ abc: '' })
    }).toThrow('Notation search returned no usable ABC')
  })

  test('handleNotationSearchStreamEvent forwards progress', function() {
    const updates = []
    handleNotationSearchStreamEvent({
      type: 'progress',
      message: 'Searching The Session...',
      progress: 0.2,
      stage: 'thesession',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage })
    })
    expect(updates).toEqual([{
      message: 'Searching The Session...',
      progress: 0.2,
      stage: 'thesession',
    }])
  })
})
