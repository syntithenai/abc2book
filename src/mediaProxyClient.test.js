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

  afterEach(function() {
    global.fetch = fetchMock;
  });
});
