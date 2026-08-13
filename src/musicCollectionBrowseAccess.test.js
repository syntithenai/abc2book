import {
  formatMusicCollectionBrowseError,
  getMusicCollectionBrowseAccess,
  isMusicCollectionAuthorizationError,
} from './musicCollectionBrowseAccess';

describe('getMusicCollectionBrowseAccess', function() {
  test('needs login when home collection exists but token missing', function() {
    const access = getMusicCollectionBrowseAccess({
      accessToken: null,
      resolverStatus: {
        requireAuth: true,
        available: false,
        candidates: [{
          reachable: true,
          features: { musicCollection: true },
          musicCollectionAccess: false,
        }],
      },
    });
    expect(access.needsLogin).toBe(true);
    expect(access.canBrowse).toBe(false);
  });

  test('does not show auth denial from health when logged in without API verify', function() {
    const access = getMusicCollectionBrowseAccess({
      accessToken: 'token',
      resolverStatus: {
        candidates: [{
          reachable: true,
          features: { musicCollection: true },
          musicCollectionAccess: false,
        }],
      },
    });
    expect(access.blockedMessage).toBe('');
    expect(access.canBrowse).toBe(false);
  });

  test('can browse when API verify succeeds before health updates', function() {
    const access = getMusicCollectionBrowseAccess({
      accessToken: 'token',
      browseVerified: true,
      resolverStatus: {
        candidates: [{
          reachable: true,
          features: { musicCollection: true },
          musicCollectionAccess: false,
        }],
      },
    });
    expect(access.canBrowse).toBe(true);
    expect(access.blockedMessage).toBe('');
  });

  test('can browse when music collection access is granted', function() {
    const access = getMusicCollectionBrowseAccess({
      accessToken: 'token',
      resolverStatus: {
        musicCollectionAccess: true,
        musicCollectionBase: 'https://home.example',
        candidates: [{
          reachable: true,
          features: { musicCollection: true },
          musicCollectionAccess: true,
          base: 'https://home.example',
        }],
      },
    });
    expect(access.canBrowse).toBe(true);
    expect(access.resolverBase).toBe('https://home.example');
  });
});

describe('formatMusicCollectionBrowseError', function() {
  test('explains stale resolver on 404', function() {
    expect(formatMusicCollectionBrowseError(new Error('Media proxy error 404: Not found')))
      .toMatch(/home resolver/i);
  });
});

describe('isMusicCollectionAuthorizationError', function() {
  test('detects 403 responses', function() {
    expect(isMusicCollectionAuthorizationError(new Error('Media proxy error 403: forbidden'))).toBe(true);
  });

  test('detects 401 responses', function() {
    expect(isMusicCollectionAuthorizationError(new Error('Media proxy error 401: unauthorized'))).toBe(true);
  });
});
