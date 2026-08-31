import {
  buildCuratedImportPath,
  findCuratedImportMeta,
  findCuratedImportTitle,
  resolveCuratedScrapeLinks,
} from './curatedImportMatch'

describe('findCuratedImportTitle', function() {
  const curated = {
    'all the tunes': { link: 'tunes.abc', book: 'tunes' },
    'begged borrowed and stolen': {
      link: 'tunes.abc',
      book: 'tunes',
      tag: 'begged borrowed and stolen',
    },
    'kids songs': { link: 'kids songs.abc', book: 'kids songs' },
    'old time': {
      link: 'oldtimefiddletunes.abc',
      book: 'old time',
      allowDuplicateTitles: true,
    },
  }

  test('matches a unique scrape file', function() {
    expect(findCuratedImportTitle(curated, 'kids songs.abc', 'kids songs', null))
      .toBe('kids songs')
  })

  test('prefers book+tag match when scrape file is shared', function() {
    expect(findCuratedImportTitle(
      curated,
      'tunes.abc',
      'tunes',
      'begged borrowed and stolen'
    )).toBe('begged borrowed and stolen')
  })

  test('falls back to book-only match when tag absent', function() {
    expect(findCuratedImportTitle(curated, 'tunes.abc', 'tunes', null))
      .toBe('all the tunes')
  })

  test('returns null when nothing matches', function() {
    expect(findCuratedImportTitle(curated, 'missing.abc', null, null)).toBe(null)
  })

  test('buildCuratedImportPath includes book and tag segments', function() {
    expect(buildCuratedImportPath({
      link: 'tunes.abc',
      book: 'tunes',
      tag: 'begged borrowed and stolen',
    })).toBe('/importlink/%2Fscrape%2Ftunes.abc/book/tunes/tag/begged%20borrowed%20and%20stolen')

    expect(buildCuratedImportPath({
      link: 'kids songs.abc',
      book: 'kids songs',
    })).toBe('/importlink/%2Fscrape%2Fkids%20songs.abc/book/kids%20songs')

    expect(buildCuratedImportPath({})).toBe(null)
  })

  test('buildCuratedImportPath uses catalog route for multi-file and all', function() {
    expect(buildCuratedImportPath({ all: true, image: 'tunes.jpeg' }, 'import all'))
      .toBe('/importcurated/import%20all')
    expect(buildCuratedImportPath({
      all: true,
      tag: 'steve ryan',
    }, 'steve ryan')).toBe('/importcurated/steve%20ryan/tag/steve%20ryan')
    expect(resolveCuratedScrapeLinks({ all: true }).length).toBeGreaterThan(5)
  })

  test('buildCuratedImportPath for australian bush dance', function() {
    expect(buildCuratedImportPath({
      link: 'australian bush dance.abc',
      book: 'australian bush dance',
    })).toBe(
      '/importlink/%2Fscrape%2Faustralian%20bush%20dance.abc/book/australian%20bush%20dance'
    )
  })

  test('findCuratedImportMeta exposes allowDuplicateTitles for old time', function() {
    const meta = findCuratedImportMeta(curated, 'oldtimefiddletunes.abc', 'old time', null)
    expect(meta).toBeTruthy()
    expect(meta.title).toBe('old time')
    expect(meta.allowDuplicateTitles).toBe(true)
  })
})
