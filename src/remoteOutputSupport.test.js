import { canRouteToSnapcastPlayback, getSnapcastDisabledReason } from './remoteOutputSupport';

describe('remoteOutputSupport', function() {
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
});
