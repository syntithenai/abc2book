import {
  buildIndexesFromTunes,
} from './tuneIndexRebuilder'
import {
  resolveCandidateTuneIds,
  intersectIds,
} from './tuneCandidateFilter'

function makeTune(id, extra) {
  return Object.assign({
    id: id,
    name: 'Tune ' + id,
    books: [],
    tags: [],
    voices: { V: { notes: ['CDEF|'] } },
  }, extra || {})
}

describe('tuneCandidateFilter', function() {
  test('resolveCandidateTuneIds returns book members', function() {
    const indexes = {
      bookIndex: { Folk: ['a', 'b'], Jazz: ['c'] },
      tagIndex: {},
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ currentTuneBook: 'Folk' }, indexes, ['a', 'b', 'c'])
    expect(ids).toEqual(['a', 'b'])
  })

  test('resolveCandidateTuneIds matches book names case-insensitively', function() {
    const indexes = {
      bookIndex: { Songs: ['a', 'b'] },
      tagIndex: {},
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ currentTuneBook: 'songs' }, indexes, ['a', 'b', 'c'])
    expect(ids).toEqual(['a', 'b'])
  })

  test('intersects tag filters', function() {
    const indexes = {
      bookIndex: {},
      tagIndex: { reel: ['a', 'b'], jig: ['b', 'c'] },
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ tagFilter: ['reel', 'jig'] }, indexes, ['a', 'b', 'c', 'd'])
    expect(ids).toEqual(['b'])
  })

  test('returns null without structural filters', function() {
    const ids = resolveCandidateTuneIds({}, { bookIndex: {} }, ['a'])
    expect(ids).toBeNull()
  })

  test('intersectIds', function() {
    expect(intersectIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c'])
  })
})

describe('tuneIndexRebuilder', function() {
  test('buildIndexesFromTunes groups by book and tag', function() {
    const built = buildIndexesFromTunes({
      a: makeTune('a', { books: ['Book1'], tags: ['irish'] }),
      b: makeTune('b', { books: ['Book1', 'Book2'], tags: ['irish', 'reel'] }),
    })
    expect(built.books.Book1).toEqual(expect.arrayContaining(['a', 'b']))
    expect(built.tags.irish).toEqual(expect.arrayContaining(['a', 'b']))
  })
})
