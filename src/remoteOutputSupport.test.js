import {
  canRouteToSnapcastPlayback,
  getSnapcastDisabledReason,
  needsCastHlsSession,
  usesNativeElementRemoteHandoff,
} from './remoteOutputSupport';

describe('remoteOutputSupport', function() {
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

  test('getSnapcastDisabledReason when control disabled', function() {
    const mediaController = {
      resolverFeatures: { snapcastControl: false, snapcastPlayback: false },
    };
    expect(getSnapcastDisabledReason(mediaController)).toMatch(/profile snapcast/i);
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
});
