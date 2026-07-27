jest.mock('./mediaProxyConfig', function() {
  return {
    getMediaProxyBaseCandidates: jest.fn(function() {
      return ['https://resolver.example'];
    }),
  };
});

import { getMediaSearchAccess } from './mediaSearchAccess';
import { getMediaProxyBaseCandidates } from './mediaProxyConfig';

describe('mediaSearchAccess', function() {
  beforeEach(function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
  });

  test('returns null warning when media proxy is not configured', function() {
    getMediaProxyBaseCandidates.mockReturnValue([]);
    const access = getMediaSearchAccess({
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
      accessToken: null,
    });
    expect(access.loginWarning).toBeNull();
  });

  test('returns null warning when resolver is available', function() {
    const access = getMediaSearchAccess({
      resolverAvailable: true,
      resolverStatus: {
        available: true,
        candidates: [],
      },
      accessToken: 'ya29.example',
    });
    expect(access.loginWarning).toBeNull();
    expect(access.needsLogin).toBe(false);
  });

  test('shows media-search login warning when resolver needs auth', function() {
    const access = getMediaSearchAccess({
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
      accessToken: null,
    });
    expect(access.needsLogin).toBe(true);
    expect(access.loginWarning.message).toBe('Sign in for access to more media sources.');
    expect(access.loginWarning.showLoginButton).toBe(true);
  });

  test('hides login warning after user is authenticated', function() {
    const access = getMediaSearchAccess({
      resolverAvailable: true,
      resolverStatus: {
        available: true,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: true,
          requireAuth: true,
        }],
      },
      accessToken: 'ya29.example',
    });
    expect(access.loginWarning).toBeNull();
    expect(access.needsLogin).toBe(false);
  });

  test('hides login warning when signed in but health is stale', function() {
    const access = getMediaSearchAccess({
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
      accessToken: 'ya29.example',
    });
    expect(access.loginWarning).toBeNull();
    expect(access.needsLogin).toBe(false);
  });

  test('shows login warning when signed in with an invalid token', function() {
    const access = getMediaSearchAccess({
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'invalid_token',
        }],
      },
      accessToken: 'ya29.example',
    });
    expect(access.needsLogin).toBe(true);
    expect(access.loginWarning).not.toBeNull();
  });
});
