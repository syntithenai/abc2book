import {
  normalizeLyricsSearch,
  handleLyricsSearchStreamEvent,
  searchLyrics,
  searchLyricsViaResolver,
} from './lyricsSearchClient'
import { searchLyricsLight } from './lyricsSearchLight'
import * as mediaProxyClient from './mediaProxyClient'
import * as mediaResolverHealthStore from './mediaResolverHealthStore'

jest.mock('./lyricsSearchLight', function() {
  return {
    searchLyricsLight: jest.fn(function() {
      return Promise.resolve({
        text: 'Line one',
        lines: ['Line one'],
        multiple: false,
        source: 'local',
      })
    }),
  }
})

jest.mock('./mediaProxyClient', function() {
  const actual = jest.requireActual('./mediaProxyClient')
  return Object.assign({}, actual, {
    fetchViaMediaProxy: jest.fn(),
    isMediaProxyConfigured: jest.fn(function() { return true }),
  })
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: true }
    }),
  }
})

describe('lyricsSearchClient', function() {
  test('normalizeLyricsSearch maps stanza response', function() {
    const result = normalizeLyricsSearch({
      text: 'Line one\nLine two\n\nChorus',
      lines: ['Line one', 'Line two', '', 'Chorus'],
      stanzas: [['Line one', 'Line two'], ['Chorus']],
      source: 'lyrics.ovh',
      sourceUrl: 'https://api.lyrics.ovh/v1/Artist/Title',
      title: 'Title',
      artist: 'Artist',
    });

    expect(result.multiple).toBe(false);
    expect(result.text).toBe('Line one\nLine two\n\nChorus');
    expect(result.lines).toEqual(['Line one', 'Line two', '', 'Chorus']);
    expect(result.stanzas).toEqual([['Line one', 'Line two'], ['Chorus']]);
    expect(result.source).toBe('lyrics.ovh');
  });

  test('normalizeLyricsSearch rejects empty text', function() {
    expect(function() {
      normalizeLyricsSearch({ text: '   ' });
    }).toThrow('Lyrics search returned no text');
  });

  test('handleLyricsSearchStreamEvent forwards progress', function() {
    const updates = [];
    handleLyricsSearchStreamEvent({
      type: 'progress',
      message: 'Checking lyrics.ovh...',
      progress: 0.15,
      stage: 'search',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage });
    });
    expect(updates).toEqual([{
      message: 'Checking lyrics.ovh...',
      progress: 0.15,
      stage: 'search',
    }]);
  });

  test('handleLyricsSearchStreamEvent returns result events', function() {
    const result = handleLyricsSearchStreamEvent({
      type: 'result',
      body: {
        text: 'Line one\nLine two',
        lines: ['Line one', 'Line two'],
        source: 'lyrics.ovh',
      },
    }, function() {});
    expect(result.multiple).toBe(false);
    expect(result.text).toBe('Line one\nLine two');
    expect(result.source).toBe('lyrics.ovh');
  });

  test('normalizeLyricsSearch maps candidate responses', function() {
    const result = normalizeLyricsSearch({
      multiple: true,
      candidates: [{
        text: 'Get you a copper kettle',
        lines: ['Get you a copper kettle'],
        source: 'genius.com',
        sourceUrl: 'https://genius.com/example',
        title: 'Copper Kettle',
        artist: 'Joan Baez',
        preview: 'Get you a copper kettle',
        titleOnly: false,
      }, {
        text: 'Title-only version',
        lines: ['Title-only version'],
        source: 'lyrics.com',
        sourceUrl: 'https://lyrics.com/example',
        title: 'Copper Kettle',
        artist: '',
        preview: 'Title-only version',
        titleOnly: true,
      }],
    });

    expect(result.multiple).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[1].titleOnly).toBe(true);
  });

  describe('searchLyrics facade', function() {
    const lightResult = {
      text: 'Line one',
      lines: ['Line one'],
      source: 'local',
      multiple: false,
    }

    beforeEach(function() {
      mediaProxyClient.fetchViaMediaProxy.mockReset()
      searchLyricsLight.mockReset()
      searchLyricsLight.mockResolvedValue(lightResult)
      mediaProxyClient.isMediaProxyConfigured.mockReturnValue(true)
      mediaResolverHealthStore.getMediaResolverHealthState.mockReturnValue({
        checked: true,
        available: true,
      })
    })

    test('uses lightweight search when resolverAvailable is false', async function() {
      const result = await searchLyrics({
        title: 'Yesterday',
        resolverAvailable: false,
      })

      expect(mediaProxyClient.fetchViaMediaProxy).not.toHaveBeenCalled()
      expect(searchLyricsLight).toHaveBeenCalled()
      expect(result.source).toBe('local')
    })

    test('falls back to lightweight search on infrastructure errors', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(
        new Error('Could not reach the media resolver')
      )

      const result = await searchLyrics({ title: 'Yesterday' })

      expect(searchLyricsLight).toHaveBeenCalled()
      expect(result.source).toBe('local')
    })

    test('uses resolver when available', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
        ok: true,
        headers: { get: function() { return 'application/json' } },
        json: async function() {
          return {
            text: 'Resolver lyrics',
            lines: ['Resolver lyrics'],
            source: 'genius.com',
          }
        },
      })

      const result = await searchLyricsViaResolver({ title: 'Yesterday', artist: 'Beatles' })

      expect(searchLyricsLight).not.toHaveBeenCalled()
      expect(result.text).toBe('Resolver lyrics')
    })
  })
});
