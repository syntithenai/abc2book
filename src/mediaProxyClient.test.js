import { normalizeAccessToken } from './mediaProxyClient';

describe('mediaProxyClient', function() {
  test('normalizeAccessToken accepts bearer string', function() {
    expect(normalizeAccessToken('ya29.example')).toBe('ya29.example');
  });

  test('normalizeAccessToken extracts access_token from Google token object', function() {
    expect(normalizeAccessToken({
      access_token: 'ya29.example',
      expires_in: 3599,
    })).toBe('ya29.example');
  });

  test('normalizeAccessToken returns empty for invalid values', function() {
    expect(normalizeAccessToken(null)).toBe('');
    expect(normalizeAccessToken({})).toBe('');
  });
});
