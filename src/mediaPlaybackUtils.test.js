import {
  formatPlaybackSeconds,
  getFirstAudioMediaLinkIndex,
  getDefaultLoopMediaLinkIndex,
  resolveLoopEditorLinkIndex,
  isMediaLoopTabEnabled,
  tuneHasPlayableMediaLinks,
  getLinkRegionStart,
  getLinkRegionEnd,
} from './mediaPlaybackUtils';

describe('mediaPlaybackUtils loop helpers', function() {
  const isYoutubeLink = function(url) {
    return String(url).indexOf('youtu') >= 0;
  };

  const tuneWithMixedLinks = {
    links: [
      { link: 'https://youtu.be/abc', title: 'YouTube take' },
      { link: 'https://example.com/first.mp3', title: 'Studio' },
      { link: 'https://example.com/second.mp3', title: 'Live' },
    ],
  };

  const tuneYoutubeOnly = {
    links: [{ link: 'https://youtu.be/only', title: 'Clip' }],
  };

  test('getFirstAudioMediaLinkIndex skips YouTube and picks first audio file', function() {
    expect(getFirstAudioMediaLinkIndex(tuneWithMixedLinks, isYoutubeLink)).toBe(1);
  });

  test('getFirstAudioMediaLinkIndex returns null when no audio links exist', function() {
    expect(getFirstAudioMediaLinkIndex(tuneYoutubeOnly, isYoutubeLink)).toBe(null);
  });

  test('getDefaultLoopMediaLinkIndex prefers audio over YouTube', function() {
    expect(getDefaultLoopMediaLinkIndex(tuneWithMixedLinks, isYoutubeLink)).toBe(1);
  });

  test('getDefaultLoopMediaLinkIndex falls back to playable non-audio media', function() {
    expect(getDefaultLoopMediaLinkIndex(tuneYoutubeOnly, isYoutubeLink)).toBe(0);
  });

  test('tuneHasPlayableMediaLinks is false without links', function() {
    expect(tuneHasPlayableMediaLinks({ links: [] }, isYoutubeLink)).toBe(false);
  });

  test('resolveLoopEditorLinkIndex uses active media link on media route', function() {
    const mediaController = {
      isMediaPlaybackRoute: function() { return true; },
      mediaLinkNumber: 2,
    };
    expect(resolveLoopEditorLinkIndex(tuneWithMixedLinks, mediaController, isYoutubeLink)).toBe(2);
  });

  test('resolveLoopEditorLinkIndex defaults to first audio when not on media route', function() {
    const mediaController = {
      isMediaPlaybackRoute: function() { return false; },
      mediaLinkNumber: null,
    };
    expect(resolveLoopEditorLinkIndex(tuneWithMixedLinks, mediaController, isYoutubeLink)).toBe(1);
  });

  test('isMediaLoopTabEnabled is false on MIDI route', function() {
    const mediaController = {
      isMidiPlaybackRoute: function() { return true; },
      isMediaPlaybackRoute: function() { return false; },
    };
    expect(isMediaLoopTabEnabled(tuneWithMixedLinks, mediaController, isYoutubeLink)).toBe(false);
  });

  test('isMediaLoopTabEnabled is true on media route', function() {
    const mediaController = {
      isMidiPlaybackRoute: function() { return false; },
      isMediaPlaybackRoute: function() { return true; },
    };
    expect(isMediaLoopTabEnabled(tuneWithMixedLinks, mediaController, isYoutubeLink)).toBe(true);
  });

  test('isMediaLoopTabEnabled is true for media-only tune before playback starts', function() {
    const mediaController = {
      isMidiPlaybackRoute: function() { return false; },
      isMediaPlaybackRoute: function() { return false; },
    };
    expect(isMediaLoopTabEnabled(tuneYoutubeOnly, mediaController, isYoutubeLink)).toBe(true);
  });
});

describe('formatPlaybackSeconds', function() {
  test('formats times as seconds never minutes:seconds', function() {
    expect(formatPlaybackSeconds(0)).toBe('0');
    expect(formatPlaybackSeconds(12.5)).toBe('12.5');
    expect(formatPlaybackSeconds(200)).toBe('200');
    expect(formatPlaybackSeconds(-3)).toBe('0');
    expect(formatPlaybackSeconds('not-a-number')).toBe('0');
    expect(formatPlaybackSeconds(12.5)).not.toMatch(/:/);
  });
});

describe('mediaPlaybackUtils play range', function() {
  test('getLinkRegionStart/End use audio startAt/endAt when no loops exist', function() {
    const link = { link: 'https://example.com/a.mp3', startAt: '12.5', endAt: '200' };
    expect(getLinkRegionStart(link)).toBe(12.5);
    expect(getLinkRegionEnd(link)).toBe(200);
  });

  test('getLinkRegionStart/End ignore play range on MIDI files', function() {
    const httpMidi = { link: 'https://example.com/tune.mid', startAt: '12.5', endAt: '200' };
    const ownedMidi = {
      link: 'abcbook-recording:rec1',
      mediaKind: 'midi',
      startAt: '8',
      endAt: '90',
    };
    expect(getLinkRegionStart(httpMidi)).toBe(0);
    expect(getLinkRegionEnd(httpMidi)).toBe(0);
    expect(getLinkRegionStart(ownedMidi)).toBe(0);
    expect(getLinkRegionEnd(ownedMidi)).toBe(0);
  });

  test('getLinkRegionStart/End still honor an active practice loop on MIDI files', function() {
    const midi = {
      link: 'https://example.com/tune.mid',
      startAt: '12.5',
      endAt: '200',
      playbackLoops: [{ id: 'loop1', startAt: '4', endAt: '20', active: true }],
    };
    expect(getLinkRegionStart(midi)).toBe(4);
    expect(getLinkRegionEnd(midi)).toBe(20);
  });
});
