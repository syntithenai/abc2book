import { curatedScrapeUrl, getResourceBase, resourceUrl } from './resourceBase'

describe('resourceBase', function() {
  const originalEnv = process.env

  beforeEach(function() {
    process.env = Object.assign({}, originalEnv)
    delete process.env.REACT_APP_RESOURCE_BASE
  })

  afterEach(function() {
    process.env = originalEnv
  })

  test('uses same-origin paths in development by default', function() {
    process.env.NODE_ENV = 'development'
    expect(getResourceBase()).toBe('')
    expect(resourceUrl('scrape/tunes.abc')).toBe('/scrape/tunes.abc')
  })

  test('curatedScrapeUrl prefixes bare filenames', function() {
    process.env.NODE_ENV = 'development'
    expect(curatedScrapeUrl('tunes.abc')).toBe('/scrape/tunes.abc')
    expect(curatedScrapeUrl('/scrape/tunes.abc')).toBe('/scrape/tunes.abc')
    expect(curatedScrapeUrl('https://tunebook.net/scrape/tunes.abc')).toBe('https://tunebook.net/scrape/tunes.abc')
  })
})
