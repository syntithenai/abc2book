import {
  DEFAULT_APP_TITLE,
  buildSearchPageTitle,
  buildSingleTuneTitle,
  getActiveBookFilter,
  getFirstTagFilter,
} from './pageTitle'

describe('pageTitle', function() {
  test('buildSingleTuneTitle uses tune name', function() {
    expect(buildSingleTuneTitle('The Kesh')).toBe('The Kesh')
    expect(buildSingleTuneTitle('  ')).toBe(DEFAULT_APP_TITLE)
  })

  test('buildSearchPageTitle prefers book over tag', function() {
    expect(buildSearchPageTitle('Session Tunes', ['fiddle'])).toBe('Tunebook Search – Session Tunes')
    expect(buildSearchPageTitle('', ['fiddle'])).toBe('Tunebook Search – fiddle')
    expect(buildSearchPageTitle(0, ['fiddle', 'jig'])).toBe('Tunebook Search – fiddle')
    expect(buildSearchPageTitle('', '')).toBe('Tunebook Search')
  })

  test('filter helpers ignore empty values', function() {
    expect(getActiveBookFilter(0)).toBeNull()
    expect(getActiveBookFilter('  ')).toBeNull()
    expect(getFirstTagFilter('')).toBeNull()
    expect(getFirstTagFilter([])).toBeNull()
  })
})
