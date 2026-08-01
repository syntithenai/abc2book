import {
  buildMediaSourceOptions,
  getActiveMediaSourceId,
  mediaSourceNeedsLogin,
} from './mediaSourceMenuAccess';

describe('mediaSourceMenuAccess', function() {
  const tunebook = {
    hasNotesOrChords: function() { return true; },
    hasLinks: function(tune) {
      return !!(tune.links && tune.links.some(function(link) {
        return link && link.link && String(link.link).trim();
      }));
    },
    utils: {
      isYoutubeLink: function(url) {
        return String(url).indexOf('youtu') >= 0;
      },
    },
  };

  test('buildMediaSourceOptions lists ABC and links', function() {
    const options = buildMediaSourceOptions({
      links: [
        { link: 'https://youtu.be/abc', title: 'Live take' },
        { link: 'https://example.com/a.mp3' },
      ],
    }, tunebook);
    expect(options.map(function(option) { return option.label; })).toEqual([
      'ABC notation',
      'Live take',
      'Audio',
    ]);
  });

  test('getActiveMediaSourceId reflects playback route', function() {
    expect(getActiveMediaSourceId({
      isMidiPlaybackRoute: function() { return true; },
      isMediaPlaybackRoute: function() { return false; },
    })).toBe('midi');
    expect(getActiveMediaSourceId({
      isMidiPlaybackRoute: function() { return false; },
      isMediaPlaybackRoute: function() { return true; },
      mediaLinkNumber: 1,
    })).toBe('link-1');
  });

  test('mediaSourceNeedsLogin is null for plain youtube playback', function() {
    const gate = mediaSourceNeedsLogin(
      { srcType: 'youtube' },
      {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
        }],
      },
      null,
      { youtubeAudio: true },
      { pitch: 0, fineTune: 0, audioFilters: null }
    );
    expect(gate).toBeNull();
  });

  test('mediaSourceNeedsLogin for youtube pitch shift when resolver needs auth', function() {
    const gate = mediaSourceNeedsLogin(
      { srcType: 'youtube' },
      {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      null,
      { proxy: true, youtubeAudio: true },
      { pitch: 2, fineTune: 0, audioFilters: null }
    );
    expect(gate && gate.showLoginButton).toBe(true);
  });
});
