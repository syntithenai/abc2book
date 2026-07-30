import {
  getMusicCollectionStatusFromHealth,
  isMusicCollectionSettingsAvailable,
  readMusicCollectionSettingsStatus,
  rebuildMusicCollectionIndex,
} from './musicCollectionAdminClient';
import { resolverHasFeature } from './resolverFeatures';

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
    hasMusicCollectionAccess: jest.fn(),
  };
});

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(),
    getActiveResolverAccessToken: jest.fn(function() { return ''; }),
  };
});

import { getMediaResolverHealthState } from './mediaResolverHealthStore';

import { fetchViaMediaProxy, hasMusicCollectionAccess } from './mediaProxyClient';

describe('musicCollectionAdminClient', function() {
  beforeEach(function() {
    fetchViaMediaProxy.mockReset();
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
        activeBase: 'https://resolver.example',
        features: { musicCollection: true },
        musicCollectionCount: 42,
        musicCollectionDir: '/music-collection',
        musicCollectionIndex: '/music-collection/music_collection_index.json',
      },
    });
  });

  test('reads summary from resolver health', function() {
    const summary = readMusicCollectionSettingsStatus();
    expect(summary.available).toBe(true);
    expect(summary.count).toBe(42);
    expect(summary.dir).toBe('/music-collection');
  });

  test('is unavailable when user lacks collection access', function() {
    expect(isMusicCollectionSettingsAvailable({
      musicCollectionAccess: false,
      features: { musicCollection: true },
      candidates: [{ musicCollectionAccess: false }],
    })).toBe(false);
    expect(isMusicCollectionSettingsAvailable({
      musicCollectionAccess: true,
      features: { musicCollection: true },
    })).toBe(true);
  });

  test('rebuildMusicCollectionIndex posts to resolver', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      json: async function() {
        return {
          ok: true,
          count: 99,
          musicCollectionCount: 99,
          musicCollectionDir: '/music-collection',
          musicCollectionIndex: '/music-collection/music_collection_index.json',
        };
      },
    });

    const result = await rebuildMusicCollectionIndex({ accessToken: 'token' });
    expect(fetchViaMediaProxy).toHaveBeenCalledWith(
      '/rebuild-music-collection-index',
      'token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.count).toBe(99);
  });

  test('getMusicCollectionStatusFromHealth maps fields', function() {
    const summary = getMusicCollectionStatusFromHealth({
      available: true,
      activeBase: 'https://resolver.example',
      features: { musicCollection: true },
      musicCollectionCount: 7,
      musicCollectionDir: '/music-collection',
      musicCollectionIndex: '/music-collection/music_collection_index.json',
    });
    expect(summary.enabled).toBe(true);
    expect(summary.count).toBe(7);
    expect(resolverHasFeature({
      available: true,
      features: { musicCollection: true },
    }, 'musicCollection')).toBe(true);
  });
});
