jest.mock('./mediaProxyConfig', function() {
  return {
    getMediaProxyBaseCandidates: jest.fn(),
    getBillingMediaProxyCandidates: jest.fn(function() {
      return ['https://cloud-hosted.example.com'];
    }),
  };
});

jest.mock('./analytics', function() {
  return {
    trackResolverRequest: jest.fn(),
  };
});

import * as mediaProxyClient from './mediaProxyClient';
import { getMediaProxyBaseCandidates, getBillingMediaProxyCandidates } from './mediaProxyConfig';

const fetchMock = global.fetch;

describe('mediaProxyClient', function() {
  beforeEach(function() {
    jest.clearAllMocks();
    getBillingMediaProxyCandidates.mockReturnValue([
      'https://cloud-hosted.example.com',
    ]);
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

  test('getResolverLoginWarning for insufficient credit', function() {
    const warning = mediaProxyClient.getResolverLoginWarning({
      available: false,
      candidates: [{
        base: 'https://resolver.example',
        reachable: true,
        available: false,
        requireAuth: true,
        authReason: 'insufficient_credit',
      }],
    }, 'ya29.token');
    expect(warning).not.toBeNull();
    expect(warning.showBuyCreditButton).toBe(true);
    expect(warning.showLoginButton).toBe(false);
  });

  test('pickBillingProxyBase prefers Cloud Run over peppertrees and local billing', function() {
    const base = mediaProxyClient.pickBillingProxyBase([
      {
        base: 'http://localhost:8787',
        reachable: true,
        available: true,
        billingEnabled: true,
      },
      {
        base: 'https://peppertrees.example.com',
        reachable: true,
        available: true,
        billingEnabled: true,
      },
      {
        base: 'https://cloud-hosted.example.com',
        reachable: true,
        available: true,
        billingEnabled: true,
      },
    ]);
    expect(base).toBe('https://cloud-hosted.example.com');
  });

  test('fetchViaMediaProxy pins billing requests to hosted billing resolver', async function() {
    getMediaProxyBaseCandidates.mockReturnValue([
      'http://localhost:8787',
      'https://peppertrees.example.com',
      'https://cloud-hosted.example.com',
    ]);

    global.fetch = jest.fn().mockImplementation(function(url) {
      if (String(url).indexOf('/health') >= 0) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: function() { return 'application/json'; } },
          json: async function() {
            return {
              ok: true,
              authorized: true,
              billingEnabled: true,
              creditBalanceCents: 12.5,
            };
          },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async function() { return { balanceCents: 12.5 }; },
      });
    });

    await mediaProxyClient.probeMediaResolverCandidates('token');
    await mediaProxyClient.fetchViaMediaProxy('/billing/balance', 'token', { method: 'GET' });

    const billingCall = global.fetch.mock.calls.find(function(call) {
      return String(call[0]).indexOf('/billing/balance') >= 0;
    });
    expect(billingCall).toBeTruthy();
    expect(billingCall[0]).toBe('https://cloud-hosted.example.com/billing/balance');
  });

  test('getResolverProxiedPlaybackBlock when balance is empty', function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
    const block = mediaProxyClient.getResolverProxiedPlaybackBlock({
      billingEnabled: true,
      creditRequired: true,
      creditBalanceCents: 0,
      creditUnlimited: false,
      candidates: [],
    }, 'ya29.token');
    expect(block).not.toBeNull();
    expect(block.message).toMatch(/empty/i);
  });

  test('getResolverCreditLowBalanceWarning under 10 cents', function() {
    const warning = mediaProxyClient.getResolverCreditLowBalanceWarning({
      billingEnabled: true,
      creditBalanceCents: 8,
      creditUnlimited: false,
    });
    expect(warning).not.toBeNull();
    expect(warning.message).toMatch(/Low resolver credit/i);
  });

  test('resolveCastPlaybackBase prefers direct localhost:8787 over dev-server proxy', function() {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'http:', origin: 'http://localhost:3000', hostname: 'localhost' },
    });
    const base = mediaProxyClient.resolveCastPlaybackBase([
      {
        base: 'http://localhost:3000',
        reachable: true,
        available: true,
        resolverAccess: true,
        oauthBff: true,
        features: { castPlayback: true, oauthBff: true },
        cast: { enabled: true, publicBase: 'https://peppertrees.example.com' },
      },
      {
        base: 'http://localhost:8787',
        reachable: true,
        available: true,
        resolverAccess: true,
        features: { castPlayback: true },
        cast: { enabled: true, publicBase: 'https://peppertrees.example.com' },
      },
    ]);
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    expect(base).toBe('http://localhost:8787');
  });

  test('resolveCastPlaybackBase uses cast health when features omit castPlayback', function() {
    const base = mediaProxyClient.resolveCastPlaybackBase([
      {
        base: 'http://localhost:8787',
        reachable: true,
        available: true,
        resolverAccess: true,
        features: { proxy: true },
        cast: { enabled: true, publicBase: 'https://peppertrees.example.com' },
      },
    ]);
    expect(base).toBe('http://localhost:8787');
  });

  test('clearActiveMediaProxyBase only clears the last fetch target', function() {
    const candidates = [{
      base: 'http://localhost:8787',
      reachable: true,
      available: true,
      resolverAccess: true,
      features: { castPlayback: true },
      cast: { enabled: true, publicBase: 'https://peppertrees.example.com' },
    }];
    expect(mediaProxyClient.resolveCastPlaybackBase(candidates)).toBe('http://localhost:8787');
    mediaProxyClient.clearActiveMediaProxyBase();
    expect(mediaProxyClient.getActiveMediaProxyBase()).toBe('');
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

  test('normalizeMediaProxyTargetUrl upgrades public http links to https', function() {
    expect(mediaProxyClient.normalizeMediaProxyTargetUrl('http://archive.org/details/foo'))
      .toBe('https://archive.org/details/foo');
    expect(mediaProxyClient.normalizeMediaProxyTargetUrl('http://example.com/a.mp3'))
      .toBe('https://example.com/a.mp3');
    expect(mediaProxyClient.normalizeMediaProxyTargetUrl('http://localhost:8787/music-collection/a.mp3'))
      .toBe('http://localhost:8787/music-collection/a.mp3');
    expect(mediaProxyClient.normalizeMediaProxyTargetUrl('https://example.com/a.mp3'))
      .toBe('https://example.com/a.mp3');
  });

  test('fetchDirectOrProxy upgrades http archive URLs before proxying', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'http://archive.org/details/foo',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/internet-archive/audio?url=');
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('https://archive.org/details/foo');
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
