/**
 * @jest-environment jsdom
 */
import axios from 'axios'
import {
  handleGenreSearchStreamEvent,
  normalizeGenreSearch,
  searchGenreLight,
  searchGenreLocal,
  textContainsGenreLabel,
} from './genreSearchClient'

jest.mock('axios')

describe('genreSearchClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
  })

  test('textContainsGenreLabel uses word boundaries', function() {
    expect(textContainsGenreLabel('probable folk origin', 'Folk')).toBe(true)
    expect(textContainsGenreLabel('southwestern Ontario', 'Western')).toBe(false)
    expect(textContainsGenreLabel('made popular by', 'Pop')).toBe(false)
    expect(textContainsGenreLabel('a popular folk song', 'Folk')).toBe(true)
  })

  test('searchGenreLocal returns empty when nothing matches', function() {
    const result = searchGenreLocal({
      title: 'Copper Kettle',
      artist: 'Joan Baez',
    })
    expect(result.empty).toBe(true)
    expect(result.candidates).toEqual([])
  })

  test('searchGenreLocal infers from rhythm', function() {
    const result = searchGenreLocal({
      title: 'The Musical Priest',
      rhythm: 'reel',
    })
    expect(result.empty).toBe(false)
    expect(result.genre || (result.candidates && result.candidates[0].genre))
      .toBe('Irish Traditional')
  })

  test('searchGenreLight uses Wikipedia and MusicBrainz', async function() {
    axios.get.mockImplementation(function(url) {
      if (String(url).indexOf('wikipedia.org/api/rest_v1/page/summary') >= 0) {
        return Promise.resolve({
          status: 200,
          data: {
            title: 'Copper Kettle',
            extract: 'A folk song made popular by Joan Baez with Americana roots.',
          },
        })
      }
      if (String(url).indexOf('/artist') >= 0 && String(url).indexOf('/artist/') < 0) {
        return Promise.resolve({
          data: { artists: [{ id: 'abc', name: 'Joan Baez' }] },
        })
      }
      if (String(url).indexOf('/artist/') >= 0) {
        return Promise.resolve({
          data: {
            genres: [{ name: 'folk', count: 4 }, { name: 'singer-songwriter', count: 2 }],
            tags: [{ name: 'americana', count: 2 }],
          },
        })
      }
      return Promise.resolve({ status: 404, data: {} })
    })

    const result = await searchGenreLight({
      title: 'Copper Kettle',
      artist: 'Joan Baez',
    })
    expect(result.empty).toBe(false)
    const genres = result.candidates
      ? result.candidates.map(function(c) { return c.genre })
      : [result.genre]
    expect(genres).toEqual(expect.arrayContaining(['Folk', 'Americana', 'Singer-Songwriter']))
    expect(genres).not.toEqual(expect.arrayContaining(['Pop', 'Western']))
  })

  test('searchGenreLight skips unrelated Wikipedia place pages', async function() {
    axios.get.mockImplementation(function(url) {
      const href = String(url)
      if (href.indexOf('wikipedia.org/api/rest_v1/page/summary/Copper_Kettle_(song)') >= 0) {
        return Promise.resolve({ status: 404, data: {} })
      }
      if (href.indexOf('wikipedia.org/api/rest_v1/page/summary/Copper_Kettle') >= 0) {
        return Promise.resolve({
          status: 200,
          data: {
            title: 'Copper Kettle',
            extract: 'A song with probable folk origin made popular by Joan Baez.',
          },
        })
      }
      if (href.indexOf('action=opensearch') >= 0) {
        return Promise.resolve({
          data: ['Copper Kettle (song)', ['Copperkettle, Ontario'], [''], ['https://en.wikipedia.org/wiki/Copperkettle,_Ontario']],
        })
      }
      if (href.indexOf('Copperkettle') >= 0) {
        return Promise.resolve({
          status: 200,
          data: {
            title: 'Georgian Bluffs',
            extract: 'A township in southwestern Ontario, Canada.',
          },
        })
      }
      if (href.indexOf('/artist') >= 0) {
        return Promise.resolve({ data: { artists: [] } })
      }
      return Promise.resolve({ status: 404, data: {} })
    })

    const result = await searchGenreLight({
      title: 'Copper Kettle',
      artist: 'Joan Baez',
    })
    const genres = result.candidates
      ? result.candidates.map(function(c) { return c.genre })
      : (result.genre ? [result.genre] : [])
    expect(genres).toEqual(expect.arrayContaining(['Folk']))
    expect(genres).not.toContain('Western')
  })

  test('normalizeGenreSearch accepts multiple candidates', function() {
    const result = normalizeGenreSearch({
      multiple: true,
      candidates: [
        { genre: 'Folk', source: 'LLM', reason: 'trad' },
        { genre: 'Sea Shanty', source: 'web search' },
      ],
    })
    expect(result.multiple).toBe(true)
    expect(result.candidates.map(function(c) { return c.genre })).toEqual([
      'Folk',
      'Sea Shanty',
    ])
  })

  test('handleGenreSearchStreamEvent forwards progress', function() {
    const progress = jest.fn()
    expect(handleGenreSearchStreamEvent({
      type: 'progress',
      message: 'Searching…',
      progress: 0.4,
      stage: 'web',
    }, progress)).toBe(null)
    expect(progress).toHaveBeenCalledWith('Searching…', 0.4, 'web')
  })

  test('handleGenreSearchStreamEvent returns result body', function() {
    const result = handleGenreSearchStreamEvent({
      type: 'result',
      body: { genre: 'Bluegrass', source: 'LLM' },
    })
    expect(result.genre).toBe('Bluegrass')
    expect(result.multiple).toBe(false)
  })
})
