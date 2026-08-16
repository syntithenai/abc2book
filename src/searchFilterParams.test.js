import {
  buildSearchFilterParams,
  buildTunesListPath,
  filterStateHasAnyFilters,
  hasAnySearchFilterParams,
  isSearchListHash,
  LAST_SEARCH_FILTERS_STORAGE_KEY,
  loadLastSearchFilters,
  clearLastSearchFilters,
  normalizeFilterList,
  onlyTextFilterDiffers,
  parseSearchFilterParams,
  readSearchFilterParamsFromHash,
  resolveSearchFilterState,
  resolveTunesListPath,
  saveLastSearchFilters,
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
      albumFilter: [],
      filter: '',
      groupBy: '',
    })).toEqual({ book: null, tags: null, genres: null, artists: null, albums: null, q: null, group: null })
  })

  test('buildSearchFilterParams encodes active filters', function() {
    expect(buildSearchFilterParams({
      currentTuneBook: 'Begged Borrowed and Stolen',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: ['Jazz'],
      artistFilter: ['Trad Band'],
      albumFilter: [],
      filter: 'kesh',
      groupBy: 'rhythm',
    })).toEqual({
      book: 'Begged Borrowed and Stolen',
      tags: 'fiddle,jig',
      genres: 'Jazz',
      artists: 'Trad Band',
      albums: null,
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
      albumFilter: [],
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
      albums: [],
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
      albums: [],
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
      albums: [],
      q: '',
      group: '',
    })
  })

  test('buildTunesListPath encodes filters on /tunes', function() {
    expect(buildTunesListPath({
      currentTuneBook: 'Session',
      filter: 'kesh',
      tagFilter: ['fiddle'],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })).toBe('/tunes?book=Session&tags=fiddle&q=kesh')
    expect(buildTunesListPath({})).toBe('/tunes')
  })

  test('save/load last search filters round-trip', function() {
    localStorage.removeItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
    expect(loadLastSearchFilters()).toBeNull()
    saveLastSearchFilters({
      currentTuneBook: 'Session',
      filter: 'kesh',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: ['Jazz'],
      artistFilter: [],
      albumFilter: [],
      groupBy: 'rhythm',
    })
    expect(loadLastSearchFilters()).toEqual({
      currentTuneBook: 'Session',
      filter: 'kesh',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: ['Jazz'],
      artistFilter: [],
      albumFilter: [],
      groupBy: 'rhythm',
    })
    // Empty saves must not wipe the last real search (cleared React state / bare /tunes).
    saveLastSearchFilters({
      currentTuneBook: '',
      filter: '',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
    expect(loadLastSearchFilters()).toEqual({
      currentTuneBook: 'Session',
      filter: 'kesh',
      tagFilter: ['fiddle', 'jig'],
      genreFilter: ['Jazz'],
      artistFilter: [],
      albumFilter: [],
      groupBy: 'rhythm',
    })
  })

  test('clearLastSearchFilters drops the restorable snapshot', function() {
    localStorage.removeItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
    saveLastSearchFilters({
      currentTuneBook: 'Session',
      filter: 'kesh',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
    expect(resolveTunesListPath({})).toBe('/tunes?book=Session&q=kesh')
    clearLastSearchFilters()
    expect(loadLastSearchFilters()).toBeNull()
    expect(resolveTunesListPath({})).toBe('/tunes')
  })

  test('resolveSearchFilterState prefers live filters then last snapshot', function() {
    localStorage.removeItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
    expect(resolveSearchFilterState({})).toEqual({
      currentTuneBook: '',
      filter: '',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })

    saveLastSearchFilters({
      currentTuneBook: 'SavedBook',
      filter: 'saved',
      tagFilter: ['jig'],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
    expect(resolveSearchFilterState({})).toEqual({
      currentTuneBook: 'SavedBook',
      filter: 'saved',
      tagFilter: ['jig'],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
    expect(resolveSearchFilterState({
      currentTuneBook: 'Live',
      filter: '',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })).toEqual({
      currentTuneBook: 'Live',
      filter: '',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
  })

  test('resolveTunesListPath prefers current filters then last snapshot', function() {
    localStorage.removeItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
    expect(resolveTunesListPath({})).toBe('/tunes')

    saveLastSearchFilters({
      currentTuneBook: 'SavedBook',
      filter: 'saved',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })
    expect(resolveTunesListPath({})).toBe('/tunes?book=SavedBook&q=saved')
    expect(resolveTunesListPath({
      currentTuneBook: 'Live',
      filter: '',
      tagFilter: [],
      genreFilter: [],
      artistFilter: [],
      albumFilter: [],
      groupBy: '',
    })).toBe('/tunes?book=Live')
  })

  test('filterStateHasAnyFilters', function() {
    expect(filterStateHasAnyFilters({})).toBe(false)
    expect(filterStateHasAnyFilters({ filter: 'a' })).toBe(true)
    expect(filterStateHasAnyFilters({ currentTuneBook: 'Book' })).toBe(true)
  })
})
