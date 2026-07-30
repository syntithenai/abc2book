import { isMusicCollectionAvailable, searchMusicCollection } from './musicCollectionSearchClient';
import { getActiveResolverAccessToken, getMediaResolverHealthState } from './mediaResolverHealthStore';
import { fetchViaMediaProxy, isMediaProxyConfigured, hasMusicCollectionAccess } from './mediaProxyClient';

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
    isMediaProxyConfigured: jest.fn(function() { return true; }),
    hasMusicCollectionAccess: jest.fn(),
  };
});

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(),
    getActiveResolverAccessToken: jest.fn(function() { return ''; }),
  };
});

describe('musicCollectionSearchClient', function() {
  beforeEach(function() {
    fetchViaMediaProxy.mockReset();
    isMediaProxyConfigured.mockReturnValue(true);
    getActiveResolverAccessToken.mockReturnValue('');
    hasMusicCollectionAccess.mockImplementation(function(candidates) {
      if (!Array.isArray(candidates)) return false;
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].musicCollectionAccess) return true;
      }
      return false;
    });
    getMediaResolverHealthState.mockReturnValue({
      available: true,
      checked: true,
      status: {
        available: true,
        musicCollectionAccess: true,
        features: { musicCollection: true },
        musicCollectionCount: 101290,
      },
    });
  });

  test('isMusicCollectionAvailable reads musicCollectionAccess on resolver status', function() {
    expect(isMusicCollectionAvailable()).toBe(true);
    getMediaResolverHealthState.mockReturnValue({
      available: true,
      checked: true,
      status: {
        available: true,
        musicCollectionAccess: false,
        features: { musicCollection: true },
        musicCollectionCount: 12,
        candidates: [{ musicCollectionAccess: false }],
      },
    });
    expect(isMusicCollectionAvailable()).toBe(false);
    getMediaResolverHealthState.mockReturnValue({
      available: false,
      checked: true,
      status: {
        available: true,
        musicCollectionAccess: true,
        features: { musicCollection: true },
      },
    });
    expect(isMusicCollectionAvailable()).toBe(true);
  });

  test('searchMusicCollection queries resolver when available', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      json: async function() {
        return {
          ok: true,
          candidates: [{
            title: 'Sally Gardens',
            source: 'music-collection',
            link: 'https://resolver/music-collection/a.mp3',
          }],
        };
      },
    });

    const result = await searchMusicCollection({
      title: 'Sally Gardens',
      artist: 'Altan',
      accessToken: 'token',
    });

    expect(fetchViaMediaProxy).toHaveBeenCalledWith(
      '/search-music-collection',
      'token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.empty).toBe(false);
    expect(result.title).toBe('Sally Gardens');
  });

  test('searchMusicCollection returns empty when feature unavailable', async function() {
    getMediaResolverHealthState.mockReturnValue({
      available: true,
      checked: true,
      status: {
        available: true,
        musicCollectionAccess: false,
        features: { musicCollection: false },
        musicCollectionCount: 0,
        candidates: [{ musicCollectionAccess: false }],
      },
    });

    const result = await searchMusicCollection({
      title: 'Sally Gardens',
      accessToken: 'token',
    });

    expect(fetchViaMediaProxy).not.toHaveBeenCalled();
    expect(result.empty).toBe(true);
  });

  test('searchMusicCollection falls back to active resolver access token', async function() {
    getActiveResolverAccessToken.mockReturnValue('stored-token');
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      json: async function() {
        return {
          ok: true,
          candidates: [{
            title: 'High Street',
            source: 'music-collection',
            link: 'https://resolver/music-collection/a.mp3',
          }],
        };
      },
    });

    const result = await searchMusicCollection({
      title: 'High Street',
    });

    expect(fetchViaMediaProxy).toHaveBeenCalledWith(
      '/search-music-collection',
      'stored-token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.empty).toBe(false);
    expect(result.title).toBe('High Street');
  });
});
