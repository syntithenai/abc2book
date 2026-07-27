jest.mock('./mediaProxyConfig', function() {
  return {
    getMediaProxyBaseCandidates: jest.fn(),
  };
});

jest.mock('./analytics', function() {
  return {
    trackResolverRequest: jest.fn(),
  };
});

import * as mediaProxyClient from './mediaProxyClient';
import { getMediaProxyBaseCandidates } from './mediaProxyConfig';

const fetchMock = global.fetch;

describe('mediaProxyClient', function() {
  beforeEach(function() {
    jest.clearAllMocks();
    mediaProxyClient.clearActiveMediaProxyBase();
  });

  test('normalizeAccessToken accepts bearer string', function() {
    expect(mediaProxyClient.normalizeAccessToken('ya29.example')).toBe('ya29.example');
  });

  test('normalizeAccessToken extracts access_token from Google token object', function() {
    expect(mediaProxyClient.normalizeAccessToken({
      access_token: 'ya29.example',
      expires_in: 3599,
    })).toBe('ya29.example');
  });

  test('normalizeAccessToken returns empty for invalid values', function() {
    expect(mediaProxyClient.normalizeAccessToken(null)).toBe('');
    expect(mediaProxyClient.normalizeAccessToken({})).toBe('');
  });

  test('getResolverLoginWarning when shared resolver needs login', function() {
    const status = {
      available: false,
      candidates: [{
        base: 'https://resolver.example',
        reachable: true,
        available: false,
        requireAuth: true,
        authReason: 'login_required',
      }],
    };
    const warning = mediaProxyClient.getResolverLoginWarning(status, null);
    expect(warning).not.toBeNull();
    expect(warning.showLoginButton).toBe(true);
    expect(warning.message).toMatch(/Google login/i);
  });

  test('getResolverLoginWarning is null when resolver is available', function() {
    expect(mediaProxyClient.getResolverLoginWarning({
      available: true,
      candidates: [],
    }, null)).toBeNull();
  });

  test('getResolverLoginWarning for unauthorized account', function() {
    const warning = mediaProxyClient.getResolverLoginWarning({
      available: false,
      candidates: [{
        base: 'https://resolver.example',
        reachable: true,
        available: false,
        requireAuth: true,
        authReason: 'email_not_authorized',
      }],
    }, 'ya29.token');
    expect(warning).not.toBeNull();
    expect(warning.showLoginButton).toBe(false);
    expect(warning.message).toMatch(/not authorized/i);
  });

  test('fetchViaMediaProxy skips mixed-content HTTP bases on HTTPS pages', async function() {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:', origin: 'https://app.example' },
    });

    getMediaProxyBaseCandidates.mockReturnValue([
      'http://localhost:8787',
      'https://resolver.example',
    ]);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async function() { return { profile: {} }; },
    });

    const response = await mediaProxyClient.fetchViaMediaProxy('/midi2analyze', 'token', {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://resolver.example/midi2analyze');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('fetchViaMediaProxy retries 405 on later resolver candidates', async function() {
    getMediaProxyBaseCandidates.mockReturnValue([
      'https://public.example',
      'http://local.example',
    ]);

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
        json: async function() { return { error: 'Method Not Allowed' }; },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async function() { return { ok: true }; },
      });

    const response = await mediaProxyClient.fetchViaMediaProxy('/lyrics-dictionary', null);

    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('https://public.example/lyrics-dictionary');
    expect(global.fetch.mock.calls[1][0]).toBe('http://local.example/lyrics-dictionary');
  });

  test('fetchDirectOrProxy routes Bandcamp URLs through resolver', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'https://altan.bandcamp.com/track/the-sally-gardens',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/bandcamp/audio?url=');
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('altan.bandcamp.com/track/the-sally-gardens');
  });

  test('fetchDirectOrProxy routes Internet Archive details URLs through resolver', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'https://archive.org/details/foo',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/internet-archive/audio?url=');
  });

  test('fetchDirectOrProxy routes Internet Archive download URLs through proxy-audio', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'https://archive.org/download/foo/bar.mp3',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/proxy-audio?url=');
  });

  test('fetchDirectOrProxy routes loc.gov URLs through resolver', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'https://www.loc.gov/item/123/',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/loc/audio?url=');
  });

  test('requiresResolverProxiedPlayback detects music collection links', function() {
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'http://localhost:8787/music-collection/clementine/track.mp3'
    )).toBe(true);
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'https://example.com/tunes/foo.mp3'
    )).toBe(false);
  });

  test('fetchProxiedAudioBlobUrl returns a blob object URL', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async function() { return blob; },
    });
    global.URL.createObjectURL = jest.fn(function() { return 'blob:proxied-audio'; });

    const blobUrl = await mediaProxyClient.fetchProxiedAudioBlobUrl(
      'http://localhost:8787/music-collection/clementine/track.mp3',
      'audio',
      { accessToken: 'token' }
    );

    expect(blobUrl).toBe('blob:proxied-audio');
    expect(global.fetch.mock.calls[0][0]).toContain('/music-collection/clementine/track.mp3');
  });

  afterEach(function() {
    global.fetch = fetchMock;
  });
});
