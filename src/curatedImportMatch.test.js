import { buildCuratedImportPath, findCuratedImportTitle } from './curatedImportMatch'

describe('findCuratedImportTitle', function() {
  const curated = {
    'all the tunes': { link: 'tunes.abc', book: 'tunes' },
    'begged borrowed and stolen': {
      link: 'tunes.abc',
      book: 'tunes',
      tag: 'begged borrowed and stolen',
    },
    'kids songs': { link: 'kids songs.abc', book: 'kids songs' },
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
})
