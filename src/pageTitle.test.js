import {
  DEFAULT_APP_TITLE,
  PRACTICE_PAGE_TITLE_BASE,
  buildSearchPageTitle,
  buildSetsPageTitle,
  buildSingleTuneTitle,
  getActiveBookFilter,
  getFirstGenreFilter,
  getFirstTagFilter,
} from './pageTitle'

describe('pageTitle', function() {
  test('buildSingleTuneTitle uses tune name', function() {
    expect(buildSingleTuneTitle('The Kesh')).toBe('The Kesh')
    expect(buildSingleTuneTitle('  ')).toBe(DEFAULT_APP_TITLE)
  })

  test('buildSearchPageTitle prefers book over tag over genre over artist', function() {
    expect(buildSearchPageTitle('Session Tunes', ['fiddle'], ['Jazz'], ['Trad'])).toBe('Tunebook Search – Session Tunes')
    expect(buildSearchPageTitle('', ['fiddle'], ['Jazz'], ['Trad'])).toBe('Tunebook Search – fiddle')
    expect(buildSearchPageTitle(0, ['fiddle', 'jig'])).toBe('Tunebook Search – fiddle')
    expect(buildSearchPageTitle('', '', ['Jazz'], ['Trad'])).toBe('Tunebook Search – Jazz')
    expect(buildSearchPageTitle('', '', '', ['Trad'])).toBe('Tunebook Search – Trad')
    expect(buildSearchPageTitle('', '')).toBe('Tunebook Search')
  })

  test('buildSearchPageTitle accepts a custom base', function() {
    expect(buildSearchPageTitle('Session', [], [], [], PRACTICE_PAGE_TITLE_BASE)).toBe('Practice – Session')
    expect(buildSearchPageTitle('', ['jig'], [], [], PRACTICE_PAGE_TITLE_BASE)).toBe('Practice – jig')
    expect(buildSearchPageTitle('', '', '', '', PRACTICE_PAGE_TITLE_BASE)).toBe('Practice')
  })

  test('buildSetsPageTitle covers sets and gig modes', function() {
    expect(buildSetsPageTitle({})).toBe('Performance sets')
    expect(buildSetsPageTitle({ setName: 'Friday Night' })).toBe('Friday Night')
    expect(buildSetsPageTitle({ gigPickerMode: true })).toBe('Gig')
    expect(buildSetsPageTitle({ gigMode: true })).toBe('Gig')
    expect(buildSetsPageTitle({ gigMode: true, setName: 'Friday Night' })).toBe('Gig – Friday Night')
    expect(buildSetsPageTitle({
      gigMode: true,
      setName: 'Friday Night',
      tuneName: 'The Kesh',
    })).toBe('Gig – Friday Night – The Kesh')
  })

  test('filter helpers ignore empty values', function() {
    expect(getActiveBookFilter(0)).toBeNull()
    expect(getActiveBookFilter('  ')).toBeNull()
    expect(getFirstTagFilter('')).toBeNull()
    expect(getFirstTagFilter([])).toBeNull()
    expect(getFirstGenreFilter('')).toBeNull()
    expect(getFirstGenreFilter([])).toBeNull()
  })
})
