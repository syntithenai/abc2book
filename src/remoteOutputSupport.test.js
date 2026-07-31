import {
  canRouteToCastSdk,
  canRouteToSnapcastPlayback,
  getCastSdkDisabledReason,
  getSnapcastDisabledReason,
  needsCastHlsSession,
  usesNativeElementRemoteHandoff,
} from './remoteOutputSupport';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
  setChromecastOutputEnabled,
  setSnapcastOutputEnabled,
} from './preferredRemoteOutputSettings';

describe('remoteOutputSupport', function() {
  beforeEach(function() {
    localStorage.clear();
    setSnapcastOutputEnabled(true);
    setChromecastOutputEnabled(true);
  });
  test('usesNativeElementRemoteHandoff for AirPlay', function() {
    const ref = { current: { mode: 'airplay', connected: true } };
    expect(usesNativeElementRemoteHandoff(ref)).toBe(true);
  });

  test('usesNativeElementRemoteHandoff for Remote Playback', function() {
    const ref = { current: { mode: 'cast', connected: true, subMode: 'remotePlayback' } };
    expect(usesNativeElementRemoteHandoff(ref)).toBe(true);
  });

  test('sdk cast is not native handoff', function() {
    const ref = { current: { mode: 'cast', connected: true, subMode: 'sdk' } };
    expect(usesNativeElementRemoteHandoff(ref)).toBe(false);
  });

  test('blocks youtube routes for snapcast playback', function() {
    const mediaController = {
      resolverFeatures: { snapcastPlayback: true, snapcastControl: true },
      tune: { links: [{ link: 'https://youtu.be/x' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://youtu.be/x'; },
      getSrcType: function() { return 'youtube'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(canRouteToSnapcastPlayback(mediaController)).toBe(false);
  });

  test('blocks attached recording links for snapcast playback', function() {
    const mediaController = {
      resolverFeatures: { snapcastPlayback: true, snapcastControl: true },
      tune: { links: [{ link: 'abcbook-recording:rec1', recordingId: 'rec1' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'abcbook-recording:rec1'; },
      getSrcType: function() { return 'recording'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(canRouteToSnapcastPlayback(mediaController)).toBe(false);
    expect(getSnapcastDisabledReason(mediaController)).toMatch(/attached recordings/i);
  });

  test('getSnapcastDisabledReason when control disabled', function() {
    const mediaController = {
      resolverFeatures: { snapcastControl: false, snapcastPlayback: false },
    };
    expect(getSnapcastDisabledReason(mediaController)).toMatch(/profile snapcast/i);
  });

  test('getSnapcastDisabledReason when snapcast output setting is off', function() {
    setSnapcastOutputEnabled(false);
    const mediaController = {
      resolverFeatures: { snapcastControl: true, snapcastPlayback: true },
      tune: { links: [{ link: 'https://example.com/a.mp3' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://example.com/a.mp3'; },
      getSrcType: function() { return 'audio'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(getSnapcastDisabledReason(mediaController)).toMatch(/disabled in audio settings/i);
    setSnapcastOutputEnabled(true);
  });

  test('needsCastHlsSession for youtube when castPlayback enabled', function() {
    const mediaController = {
      resolverFeatures: { castPlayback: true },
      tune: { links: [{ link: 'https://youtu.be/x' }] },
      isExternalOutputActive: function() { return false; },
    };
    expect(needsCastHlsSession(mediaController, {
      source: 'https://youtu.be/x',
      sourceType: 'youtube',
    })).toBe(true);
  });

  test('disables snapcast routing when snapcast output setting is off', function() {
    setSnapcastOutputEnabled(false);
    const mediaController = {
      resolverFeatures: { snapcastPlayback: true, snapcastControl: true },
      tune: { links: [{ link: 'https://example.com/a.mp3' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://example.com/a.mp3'; },
      getSrcType: function() { return 'audio'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(canRouteToSnapcastPlayback(mediaController)).toBe(false);
  });

  test('disables chromecast routing when chromecast output setting is off', function() {
    setChromecastOutputEnabled(false);
    const mediaController = {
      resolverFeatures: { castPlayback: true, proxy: true },
      tune: { links: [{ link: 'https://example.com/a.mp3' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://example.com/a.mp3'; },
      getSrcType: function() { return 'audio'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(canRouteToCastSdk(mediaController)).toBe(false);
  });

  test('getCastSdkDisabledReason warns when cast media base is HTTP on HTTPS page', function() {
    const originalLocation = window.location;
    delete window.location;
    window.location = { protocol: 'https:' };
    const mediaController = {
      mediaResolverStatus: {
        cast: { enabled: true, publicBase: 'http://home.example.com:8787' },
      },
      resolverFeatures: { castPlayback: true, proxy: true },
      tune: { links: [{ link: 'https://example.com/a.mp3' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://example.com/a.mp3'; },
      getSrcType: function() { return 'audio'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(getCastSdkDisabledReason(mediaController)).toContain('HTTP');
    window.location = originalLocation;
  });
});
