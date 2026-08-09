import {
  buildSearchFilterParams,
  hasAnySearchFilterParams,
  isSearchListHash,
  normalizeFilterList,
  onlyTextFilterDiffers,
  parseSearchFilterParams,
  readSearchFilterParamsFromHash,
  searchFilterParamsEqual,
} from './searchFilterParams'

describe('searchFilterParams', function() {
  test('normalizeFilterList handles arrays, strings and empty values', function() {
    expect(normalizeFilterList(['a', ' b ', ''])).toEqual(['a', 'b'])
    expect(normalizeFilterList('fiddle')).toEqual(['fiddle'])
    expect(normalizeFilterList('')).toEqual([])
    expect(normalizeFilterList(null)).toEqual([])
    expect(normalizeFilterList(undefined)).toEqual([])
  })

  test('buildSearchFilterParams omits defaults', function() {
    expect(buildSearchFilterParams({
      currentTuneBook: 0,
      tagFilter: '',
      genreFilter: [],
      artistFilter: [],
      filter: '',
      groupBy: '',
    })).toEqual({ book: null, tags: null, genres: null, artists: null, q: null, group: null })
  })

  test('buildSearchFilterParams encodes active filters', function() {
    expect(buildSearchFilterParams({
      currentTuneBook: 'Begged Borrowed and Stolen',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: ['Jazz'],
      artistFilter: ['Trad Band'],
      filter: 'kesh',
      groupBy: 'rhythm',
    })).toEqual({
      book: 'Begged Borrowed and Stolen',
      tags: 'fiddle,jig',
      genres: 'Jazz',
      artists: 'Trad Band',
      q: 'kesh',
      group: 'rhythm',
    })
  })

  test('parse and build round-trip', function() {
    const state = {
      currentTuneBook: 'Session Tunes',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: [],
      artistFilter: ['Trad Band'],
      filter: 'the kesh',
      groupBy: '',
    }
    const built = buildSearchFilterParams(state)
    const searchParams = new URLSearchParams()
    Object.keys(built).forEach(function(key) {
      if (built[key] != null) searchParams.set(key, built[key])
    })
    const parsed = parseSearchFilterParams(searchParams)
    expect(parsed).toEqual({
      book: 'Session Tunes',
      tags: ['fiddle', 'jig'],
      genres: [],
      artists: ['Trad Band'],
      q: 'the kesh',
      group: '',
    })
    expect(buildSearchFilterParams({
      currentTuneBook: parsed.book,
      tagFilter: parsed.tags,
      genreFilter: parsed.genres,
      artistFilter: parsed.artists,
      filter: parsed.q,
      groupBy: parsed.group,
    })).toEqual(built)
  })

  test('parseSearchFilterParams defaults on empty params', function() {
    expect(parseSearchFilterParams(new URLSearchParams(''))).toEqual({
      book: '',
      tags: [],
      genres: [],
      artists: [],
      q: '',
      group: '',
    })
  })

  test('hasAnySearchFilterParams detects filter params only', function() {
    expect(hasAnySearchFilterParams(new URLSearchParams(''))).toBe(false)
    expect(hasAnySearchFilterParams(new URLSearchParams('other=1'))).toBe(false)
    expect(hasAnySearchFilterParams(new URLSearchParams('book=Session'))).toBe(true)
    expect(hasAnySearchFilterParams(new URLSearchParams('q=kesh'))).toBe(true)
    expect(hasAnySearchFilterParams(new URLSearchParams('book='))).toBe(false)
  })

  test('searchFilterParamsEqual ignores null vs missing', function() {
    const a = buildSearchFilterParams({ currentTuneBook: 'Session' })
    const b = buildSearchFilterParams({ currentTuneBook: 'Session', filter: '' })
    expect(searchFilterParamsEqual(a, b)).toBe(true)
    const c = buildSearchFilterParams({ currentTuneBook: 'Other' })
    expect(searchFilterParamsEqual(a, c)).toBe(false)
  })

  test('onlyTextFilterDiffers requires everything else to match', function() {
    const base = buildSearchFilterParams({ currentTuneBook: 'Session', filter: 'a' })
    const textChanged = buildSearchFilterParams({ currentTuneBook: 'Session', filter: 'ab' })
    const bookChanged = buildSearchFilterParams({ currentTuneBook: 'Other', filter: 'ab' })
    const same = buildSearchFilterParams({ currentTuneBook: 'Session', filter: 'a' })
    expect(onlyTextFilterDiffers(base, textChanged)).toBe(true)
    expect(onlyTextFilterDiffers(base, bookChanged)).toBe(false)
    expect(onlyTextFilterDiffers(base, same)).toBe(false)
  })

  test('isSearchListHash distinguishes list route from tune detail', function() {
    expect(isSearchListHash('#/tunes')).toBe(true)
    expect(isSearchListHash('#/tunes?book=songs')).toBe(true)
    expect(isSearchListHash('#/tunes/abc-123')).toBe(false)
    expect(isSearchListHash('#/practice')).toBe(false)
  })

  test('readSearchFilterParamsFromHash parses tune list hash query', function() {
    const parsed = readSearchFilterParamsFromHash({ hash: '#/tunes?book=songs&tags=fiddle,jig' })
    expect(parsed).toEqual({
      book: 'songs',
      tags: ['fiddle', 'jig'],
      genres: [],
      artists: [],
      q: '',
      group: '',
    })
  })
})
