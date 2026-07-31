import {
  getRemoteOutputMenuSections,
  hasRemoteCastInfrastructure,
  needsHomeResolverLogin,
} from './remoteOutputMenuAccess';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
  setChromecastOutputEnabled,
  setSnapcastOutputEnabled,
} from './preferredRemoteOutputSettings';

describe('remoteOutputMenuAccess', function() {
  beforeEach(function() {
    localStorage.clear();
    setSnapcastOutputEnabled(true);
    setChromecastOutputEnabled(true);
  });

  test('needsHomeResolverLogin when reachable resolver requires auth', function() {
    expect(needsHomeResolverLogin({
      candidates: [{
        reachable: true,
        requireAuth: true,
        available: false,
      }],
    }, null)).toBe(true);
    expect(needsHomeResolverLogin({
      candidates: [{
        reachable: true,
        requireAuth: true,
        available: false,
      }],
    }, 'token')).toBe(false);
  });

  test('shows login-only Snapcast when home infra awaits sign-in', function() {
    const menu = getRemoteOutputMenuSections({
      mediaController: {
        mediaResolverStatus: {
          candidates: [{
            base: 'https://home.example.com',
            reachable: true,
            available: false,
            requireAuth: true,
            features: { snapcastPlayback: true },
          }],
        },
        resolverFeatures: {},
      },
      accessToken: null,
      snapcast: {},
      castSession: {},
      airplayCast: { isAirPlaySupported: false, isRemotePlaybackSupported: false },
      canSnapcast: false,
      canAirPlay: false,
      castReason: 'No media loaded',
      castSdkEnabled: false,
      snapcastEnabled: false,
      sessionPayload: null,
    });
    expect(menu.showSnapcast).toBe(true);
    expect(menu.snapcastLoginOnly).toBe(true);
    expect(menu.showChromecast).toBe(false);
  });

  test('hides Snapcast when no infra and control disabled', function() {
    const menu = getRemoteOutputMenuSections({
      mediaController: {
        mediaResolverStatus: { candidates: [] },
        resolverFeatures: { snapcastControl: false },
      },
      snapcast: {},
      castSession: {},
      airplayCast: { isAirPlaySupported: false, isRemotePlaybackSupported: false },
      canSnapcast: false,
      canAirPlay: false,
      castReason: null,
      castSdkEnabled: false,
      snapcastEnabled: false,
      sessionPayload: null,
    });
    expect(menu.showSnapcast).toBe(false);
  });

  test('hasRemoteCastInfrastructure from candidate features', function() {
    expect(hasRemoteCastInfrastructure({
      candidates: [{
        reachable: true,
        features: { castPlayback: true },
      }],
    }, {})).toBe(true);
    expect(hasRemoteCastInfrastructure({ candidates: [] }, { proxy: true })).toBe(true);
  });
});
