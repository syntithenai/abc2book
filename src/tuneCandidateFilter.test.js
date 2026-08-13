import {
  buildIndexesFromTunes,
} from './tuneIndexRebuilder'
import {
  resolveCandidateTuneIds,
  intersectIds,
  fallbackToFullScanIfEmpty,
  bookIndexNeedsRepair,
} from './tuneCandidateFilter'
import {
  runTuneListFilterSync,
} from './tuneListFilter'

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

  test('empty book index falls back to full scan instead of blanking', function() {
    const indexes = {
      bookIndex: {},
      tagIndex: {},
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ currentTuneBook: 'songs' }, indexes, ['a', 'b', 'c'])
    expect(ids).toBeNull()
  })

  test('missing book key falls back to full scan when tunes exist', function() {
    const indexes = {
      bookIndex: { Jazz: ['c'] },
      tagIndex: {},
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ currentTuneBook: 'songs' }, indexes, ['a', 'b', 'c'])
    expect(ids).toBeNull()
  })

  test('empty book index with no tunes still returns empty', function() {
    const indexes = {
      bookIndex: {},
      tagIndex: {},
      genreIndex: {},
      artistIndex: {},
    }
    const ids = resolveCandidateTuneIds({ currentTuneBook: 'songs' }, indexes, [])
    expect(ids).toEqual([])
  })

  test('fallbackToFullScanIfEmpty', function() {
    expect(fallbackToFullScanIfEmpty(['a'], ['a', 'b'])).toEqual(['a'])
    expect(fallbackToFullScanIfEmpty([], ['a', 'b'])).toBeNull()
    expect(fallbackToFullScanIfEmpty([], [])).toEqual([])
  })

  test('bookIndexNeedsRepair detects wiped index with booked tunes', function() {
    expect(bookIndexNeedsRepair({
      a: makeTune('a', { books: ['songs'] }),
    }, {})).toBe(true)
    expect(bookIndexNeedsRepair({
      a: makeTune('a', { books: ['songs'] }),
    }, { songs: ['a'] })).toBe(false)
    expect(bookIndexNeedsRepair({
      a: makeTune('a'),
    }, {})).toBe(false)
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

  test('list filter still finds book members when book index is empty', function() {
    const tunes = {
      a: makeTune('a', { name: 'Alpha', books: ['songs'] }),
      b: makeTune('b', { name: 'Beta', books: ['jazz'] }),
      c: makeTune('c', { name: 'Gamma', books: ['songs'] }),
    }
    const result = runTuneListFilterSync({
      tunes: tunes,
      filterSearchFn: function(tune) {
        return Array.isArray(tune.books) && tune.books.indexOf('songs') !== -1
      },
      indexes: { bookIndex: {}, tagIndex: {}, genreIndex: {}, artistIndex: {} },
      filterContext: { currentTuneBook: 'songs' },
    })
    expect(result.filtered.map(function(t) { return t.id })).toEqual(['a', 'c'])
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
