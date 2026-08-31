import {
  TARGET_BOOKS,
  BOOK_RENAMES,
  classifyBookLabel,
  isPublishableBook,
  PUBLISHABLE_SCRAPE_FILES,
  scrapeFileForBook,
} from './bookTaxonomy.js'
import {
  migrateTuneMembership,
  migrateTunesMap,
  inventoryFromTunes,
  auditInventories,
  resolvePageKey,
  applyMembershipMigration,
} from './bookTaxonomyMigrate.js'

describe('bookTaxonomy', function() {
  test('publishable scrape files cover all non-mymedia targets', function() {
    expect(PUBLISHABLE_SCRAPE_FILES.length).toBeGreaterThan(5)
    expect(scrapeFileForBook('celtic')).toBe('celtic.abc')
    expect(isPublishableBook('mymedia')).toBe(false)
    expect(isPublishableBook('celtic')).toBe(true)
  })

  test('classifyBookLabel renames and demotes', function() {
    expect(classifyBookLabel('celtic tunes')).toEqual({
      book: 'celtic',
      tag: 'celtic tunes',
      renamedFrom: 'celtic tunes',
    })
    expect(classifyBookLabel('good tune book')).toEqual({
      book: null,
      tag: 'good tune book',
      renamedFrom: null,
    })
    expect(classifyBookLabel('australian bush traditions').book).toBe('australian bush dance')
    expect(classifyBookLabel('nff book 2009')).toEqual({
      book: null,
      tag: 'nff book 2009',
      renamedFrom: null,
    })
    expect(classifyBookLabel('unknown folio').tag).toBe('unknown folio')
  })

  test('TARGET_BOOKS includes residuals and specialty', function() {
    expect(TARGET_BOOKS).toEqual(expect.arrayContaining([
      'tunes', 'songs', 'celtic', 'old time american', 'mymedia',
    ]))
    expect(BOOK_RENAMES['old time']).toBe('old time american')
  })
})

describe('bookTaxonomyMigrate', function() {
  test('demotes good tune book and renames celtic tunes', function() {
    const result = migrateTuneMembership({
      books: ['tunes', 'celtic tunes', 'good tune book'],
      tags: ['steve ryan'],
      bookPages: {
        'celtic tunes': { page: 2, tuneIndex: 1 },
        'good tune book': { page: 3, tuneIndex: 2 },
      },
    })
    expect(result.books).toContain('celtic')
    expect(result.books).not.toContain('tunes')
    expect(result.books).not.toContain('good tune book')
    expect(result.tags).toEqual(expect.arrayContaining([
      'steve ryan', 'celtic tunes', 'good tune book',
    ]))
    expect(result.bookPages.celtic).toEqual({ page: 2, tuneIndex: 1 })
    expect(result.bookPages['good tune book']).toEqual({ page: 3, tuneIndex: 2 })
  })

  test('tag implies old time american book', function() {
    const result = migrateTuneMembership({
      books: ['tunes'],
      tags: ['canberra pickers and fiddlers'],
    })
    expect(result.books).toContain('old time american')
    expect(result.tags).toContain('canberra pickers and fiddlers')
  })

  test('audit passes for migrated map', function() {
    const tunes = {
      a: {
        id: 'a',
        name: 'A',
        books: ['australian bush traditions', 'nff book 2009'],
        tags: ['kameruka bush dance'],
        bookPages: {
          'australian bush traditions': { page: 1, tuneIndex: 1 },
          'nff book 2009': { page: 1, tuneIndex: 2 },
        },
      },
    }
    const pre = inventoryFromTunes(tunes)
    const { tunes: next } = migrateTunesMap(tunes)
    const post = inventoryFromTunes(next)
    const audit = auditInventories(pre, post)
    expect(audit.ok).toBe(true)
    expect(next.a.books).toContain('australian bush dance')
    expect(next.a.tags).toEqual(expect.arrayContaining([
      'australian bush traditions', 'nff book 2009', 'kameruka bush dance',
    ]))
  })

  test('applyMembershipMigration copies tune fields', function() {
    const tune = applyMembershipMigration({
      id: 'x',
      name: 'X',
      books: ['traditional songs', 'songs'],
      tags: [],
      abc: 'X:1\n',
    })
    expect(tune.id).toBe('x')
    expect(tune.abc).toBe('X:1\n')
    expect(tune.books).toContain('songs')
    expect(tune.tags).toContain('traditional songs')
  })

  test('resolvePageKey prefers book then single tag', function() {
    expect(resolvePageKey('eurosession', ['a'])).toBe('eurosession')
    expect(resolvePageKey('', ['kameruka bush dance'])).toBe('kameruka bush dance')
    expect(resolvePageKey('', ['a', 'b'])).toBe('')
    expect(resolvePageKey('', [])).toBe('')
  })
})
