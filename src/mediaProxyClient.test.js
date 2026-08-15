jest.mock('./mediaProxyConfig', function() {
  const actual = jest.requireActual('./mediaProxyConfig');
  return Object.assign({}, actual, {
    getMediaProxyBaseCandidates: jest.fn(),
    getBillingMediaProxyCandidates: jest.fn(function() {
      return ['https://cloud-hosted.example.com'];
    }),
  });
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
    expect(warning.message).toBe('Login to continue');
  });

  test('getResolverLoginWarning is null when offline', function() {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
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
      expect(mediaProxyClient.getResolverLoginWarning(status, null)).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
    }
  });

  test('getResolverLoginWarning ignores stale login_required once a token is present', function() {
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
    expect(mediaProxyClient.getResolverLoginWarning(status, 'ya29.token')).toBeNull();
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

  test('isMediaProxyAuthorizationError detects 401 and missing bearer', function() {
    expect(mediaProxyClient.isMediaProxyAuthorizationError(
      new Error('Media proxy error 401: Missing Authorization Bearer token')
    )).toBe(true);
    expect(mediaProxyClient.isMediaProxyAuthorizationError(
      new Error('Media proxy error 403: forbidden')
    )).toBe(false);
    expect(mediaProxyClient.isMediaProxyAuthorizationError(
      new Error('Could not reach any media resolver')
    )).toBe(false);
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

  test('pickBillingProxyBase uses dev-server proxy in development when Cloud Run billing is up', function() {
    const originalEnv = process.env.NODE_ENV;
    const originalLocation = window.location;
    process.env.NODE_ENV = 'development';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'http:', origin: 'http://localhost:3000', hostname: 'localhost', port: '3000' },
    });
    try {
      const base = mediaProxyClient.pickBillingProxyBase([
        {
          base: 'http://localhost:3000',
          reachable: true,
          available: true,
          billingEnabled: false,
        },
        {
          base: 'https://cloud-hosted.example.com',
          reachable: true,
          available: true,
          billingEnabled: true,
        },
      ]);
      expect(base).toBe('http://localhost:3000');
    } finally {
      process.env.NODE_ENV = originalEnv;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
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

  test('fetchDirectOrProxy routes Bandcamp URLs through resolver even with a collection entry id', async function() {
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
      collectionLink: {
        link: 'https://altan.bandcamp.com/track/the-sally-gardens',
        source: 'bandcamp',
        collectionEntryId: '999',
      },
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/bandcamp/audio?url=');
    expect(global.fetch.mock.calls[0][0]).not.toContain('/music-collection-by-entry/');
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

  test('fetchDirectOrProxy coalesces in-flight Bandcamp audio fetches', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    let resolveFetch;
    global.fetch = jest.fn().mockReturnValue(new Promise(function(resolve) {
      resolveFetch = resolve;
    }));

    const src = 'https://altan.bandcamp.com/track/the-sally-gardens';
    const first = mediaProxyClient.fetchDirectOrProxy({
      src: src,
      srcType: 'audio',
      accessToken: 'token',
    });
    const second = mediaProxyClient.fetchDirectOrProxy({
      src: src,
      srcType: 'audio',
      accessToken: 'token',
    });
    resolveFetch({
      ok: true,
      status: 200,
      headers: { get: function() { return 'audio/mpeg'; } },
      arrayBuffer: async function() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    });

    const results = await Promise.all([first, second]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const blobA = await results[0].response.blob();
    const blobB = await results[1].response.blob();
    expect(blobA.size).toBe(bytes.length);
    expect(blobB.size).toBe(bytes.length);
    expect(results[0].response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(results[1].response.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  test('fetchDirectOrProxy repairs doubled Bandcamp origins before proxying', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'https://altan.bandcamp.comhttps://altan.bandcamp.com/track/the-sally-gardens',
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(result.viaProxy).toBe(true);
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain(
      'https://altan.bandcamp.com/track/the-sally-gardens'
    );
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).not.toContain(
      'bandcamp.comhttps://'
    );
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

  test('fetchDirectOrProxy prefers music collection entry ids when provided', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async function() { return new ArrayBuffer(0); },
    });

    const result = await mediaProxyClient.fetchDirectOrProxy({
      src: 'http://localhost:8787/music-collection/Altan/track.wma',
      srcType: 'audio',
      accessToken: 'token',
      collectionLink: {
        link: 'http://localhost:8787/music-collection/Altan/track.wma',
        collectionEntryId: '42',
      },
    });

    expect(result.viaProxy).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/music-collection-by-entry/42');
    expect(global.fetch.mock.calls[0][0]).toContain('playable=1');
  });

  test('requiresResolverProxiedPlayback detects music collection links', function() {
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'http://localhost:8787/music-collection/clementine/track.mp3'
    )).toBe(true);
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'http://localhost:8787/music-collection-by-entry/42'
    )).toBe(true);
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'https://altan.bandcamp.com/track/the-sally-gardens'
    )).toBe(true);
    expect(mediaProxyClient.requiresResolverProxiedPlayback(
      'https://example.com/tunes/foo.mp3'
    )).toBe(false);
  });

  test('sniffAudioMimeFromBytes recognizes common audio headers', function() {
    expect(mediaProxyClient.sniffAudioMimeFromBytes(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe('audio/mpeg');
    expect(mediaProxyClient.sniffAudioMimeFromBytes(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe('audio/mpeg');
    expect(mediaProxyClient.sniffAudioMimeFromBytes(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe('audio/flac');
    const ftyp = new Uint8Array(12);
    ftyp[4] = 0x66; ftyp[5] = 0x74; ftyp[6] = 0x79; ftyp[7] = 0x70;
    expect(mediaProxyClient.sniffAudioMimeFromBytes(ftyp)).toBe('audio/mp4');
    const ftypM4a = new Uint8Array(12);
    ftypM4a[4] = 0x66; ftypM4a[5] = 0x74; ftypM4a[6] = 0x79; ftypM4a[7] = 0x70;
    ftypM4a[8] = 0x4d; ftypM4a[9] = 0x34; ftypM4a[10] = 0x41; ftypM4a[11] = 0x20;
    expect(mediaProxyClient.sniffAudioMimeFromBytes(ftypM4a)).toBe('audio/x-m4a');
  });

  test('looksLikeAlacAudio detects an ALAC codec box after ftyp', function() {
    const bytes = new Uint8Array(24);
    bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70;
    bytes[16] = 0x61; bytes[17] = 0x6c; bytes[18] = 0x61; bytes[19] = 0x63;
    expect(mediaProxyClient.looksLikeAlacAudio(bytes)).toBe(true);
    expect(mediaProxyClient.looksLikeAlacAudio(new Uint8Array([0x49, 0x44, 0x33]))).toBe(false);
  });

  test('htmlAudioMimeFallbackTypes retries mp4 family as m4a/aac', function() {
    expect(mediaProxyClient.htmlAudioMimeFallbackTypes('audio/mp4')).toEqual([
      'audio/x-m4a',
      'audio/aac',
      'audio/mpeg',
    ]);
    expect(mediaProxyClient.htmlAudioMimeFallbackTypes('audio/mpeg')).toEqual([
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
    ]);
  });

  test('blobForHtmlAudioPlayback retags octet-stream mp3 as audio/mpeg', async function() {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const playable = await mediaProxyClient.blobForHtmlAudioPlayback(blob, 'application/octet-stream');
    expect(playable.type).toBe('audio/mpeg');
  });

  test('blobForHtmlAudioPlayback prefers sniffed FLAC over a wrong MPEG content type', async function() {
    const bytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22]);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const playable = await mediaProxyClient.blobForHtmlAudioPlayback(blob, 'audio/mpeg');
    expect(playable.type).toBe('audio/flac');
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

  test('fetchProxiedAudioBlobUrl requests playable transcode for wma collection links', async function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async function() { return blob; },
    });
    global.URL.createObjectURL = jest.fn(function() { return 'blob:proxied-audio'; });

    await mediaProxyClient.fetchProxiedAudioBlobUrl(
      'http://localhost:8787/music-collection/clementine/track.wma',
      'audio',
      { accessToken: 'token' }
    );

    expect(global.fetch.mock.calls[0][0]).toContain('/music-collection/clementine/track.wma?playable=1');
  });

  afterEach(function() {
    global.fetch = fetchMock;
  });
});
