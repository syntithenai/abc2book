import {
  canCastNativeAudio,
  getCastDisabledReason,
  getCastAppId,
} from './mediaCastSupport';

describe('mediaCastSupport', function() {
  test('getCastAppId defaults to CC1AD845', function() {
    expect(getCastAppId()).toBeTruthy();
  });

  test('blocks youtube for native cast', function() {
    const mediaController = {
      tune: { links: [{ link: 'https://youtu.be/x' }] },
      mediaLinkNumber: 0,
      getSrc: function() { return 'https://youtu.be/x'; },
      getSrcType: function() { return 'youtube'; },
      isMidiPlaybackRoute: function() { return false; },
      isMidiFileMediaRoute: function() { return false; },
      isExternalOutputActive: function() { return false; },
    };
    expect(canCastNativeAudio(mediaController)).toBe(false);
    expect(getCastDisabledReason(mediaController)).toMatch(/YouTube/i);
  });
});
