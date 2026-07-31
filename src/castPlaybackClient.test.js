jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
    normalizeMediaProxyTargetUrl: jest.fn(function(url) { return url; }),
    requiresResolverProxiedPlayback: jest.fn(function() { return false; }),
  };
});

jest.mock('./snapcastPlaybackClient', function() {
  return {
    resolveSnapcastAccessToken: jest.fn(function(opts) {
      const token = opts && (opts.accessToken || opts.token);
      return token || 'stored-resolver-token';
    }),
  };
});

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getActiveResolverAccessToken: jest.fn(function() { return 'stored-resolver-token'; }),
  };
});

jest.mock('./resolverAccessToken', function() {
  return {
    resolveResolverAccessToken: jest.fn(function(token) { return token || ''; }),
  };
});

import { fetchViaMediaProxy } from './mediaProxyClient';
import { resolveSnapcastAccessToken } from './snapcastPlaybackClient';
import {
  getCastResolverBase,
  isLocalhostCastBase,
  resolveCastContentUrl,
  createCastPlaybackSession,
} from './castPlaybackClient';
import { setCastPublicBaseFromHealth } from './castSupport';

describe('castPlaybackClient', function() {
  const originalEnv = process.env;

  beforeEach(function() {
    process.env = Object.assign({}, originalEnv);
    delete process.env.REACT_APP_CAST_RESOLVER_BASE;
    setCastPublicBaseFromHealth(null);
    fetchViaMediaProxy.mockReset();
    resolveSnapcastAccessToken.mockImplementation(function(opts) {
      const token = opts && (opts.accessToken || opts.token);
      return token || 'stored-resolver-token';
    });
  });

  afterAll(function() {
    process.env = originalEnv;
  });

  test('getCastResolverBase prefers health public base', function() {
    setCastPublicBaseFromHealth('https://peppertrees.example.com');
    expect(getCastResolverBase()).toBe('https://peppertrees.example.com');
  });

  test('resolveCastContentUrl rejects localhost base', function() {
    expect(function() {
      resolveCastContentUrl('https://youtu.be/demo', 'sess-1', { resolverBase: 'http://localhost:8787' });
    }).toThrow(/cannot reach localhost/i);
  });

  test('resolveCastContentUrl builds hosted HLS url', function() {
    setCastPublicBaseFromHealth('https://peppertrees.example.com');
    const url = resolveCastContentUrl('https://youtu.be/demo', 'sess-1');
    expect(url).toBe('https://peppertrees.example.com/cast-playback/session/sess-1/playlist.m3u8');
  });

  test('isLocalhostCastBase detects localhost', function() {
    expect(isLocalhostCastBase('http://localhost:8787')).toBe(true);
    expect(isLocalhostCastBase('http://192.168.1.4:8787')).toBe(false);
  });

  test('createCastPlaybackSession sends linked access token', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      json: function() { return Promise.resolve({ sessionId: 'sess-1' }); },
    });
    await createCastPlaybackSession({
      source: 'https://example.com/a.mp3',
      sourceType: 'audio',
      accessToken: 'linked-google-token',
    });
    expect(fetchViaMediaProxy).toHaveBeenCalledWith(
      '/cast-playback/session',
      'linked-google-token',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
