jest.mock('./platformUtils', function() {
  return {
    prefersNativeMediaPlayback: jest.fn(function() { return false; }),
    isAndroidApp: jest.fn(function() { return false; }),
  };
});

import {
  resolvePlaybackRoute,
  PLAYBACK_ENGINE_LOCAL_HTML,
  PLAYBACK_ENGINE_NOTATION_MIDI,
  PLAYBACK_ENGINE_SNAPCAST,
  abcMidiUsesAndroidNativePrerender,
} from './playbackRouter';
import {
  setChromecastOutputEnabled,
  setSnapcastOutputEnabled,
  setPreferredRemoteOutput,
  PREFERRED_OUTPUT_SNAPCAST,
} from './preferredRemoteOutputSettings';

const { prefersNativeMediaPlayback } = require('./platformUtils');

describe('playbackRouter', function() {
  beforeEach(function() {
    localStorage.clear();
    setSnapcastOutputEnabled(true);
    setChromecastOutputEnabled(true);
    prefersNativeMediaPlayback.mockReturnValue(false);
  });

  test('notation midi uses web synth by default', function() {
    const route = resolvePlaybackRoute({
      isMidiPlaybackRoute: true,
      srcType: 'empty',
    });
    expect(route.engine).toBe(PLAYBACK_ENGINE_NOTATION_MIDI);
    expect(route.resolverRequired).toBe(false);
  });

  test('proxied audio requires resolver when not cached', function() {
    const route = resolvePlaybackRoute({
      srcType: 'audio',
      src: 'https://archive.org/details/foo',
      cachedBlobAvailable: false,
    });
    expect(route.engine).toBe(PLAYBACK_ENGINE_LOCAL_HTML);
    expect(route.resolverRequired).toBe(true);
  });

  test('cached proxied audio does not require resolver', function() {
    const route = resolvePlaybackRoute({
      srcType: 'audio',
      src: 'https://archive.org/details/foo',
      cachedBlobAvailable: true,
    });
    expect(route.resolverRequired).toBe(false);
  });

  test('snapcast default when enabled and preferred', function() {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    const route = resolvePlaybackRoute({
      srcType: 'audio',
      src: 'https://example.com/a.mp3',
      remoteOutputActive: false,
    });
    expect(route.engine).toBe(PLAYBACK_ENGINE_SNAPCAST);
  });

  test('snapcast skipped when remote output disabled', function() {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    setSnapcastOutputEnabled(false);
    setChromecastOutputEnabled(false);
    const route = resolvePlaybackRoute({
      srcType: 'audio',
      src: 'https://example.com/a.mp3',
      remoteOutputActive: false,
    });
    expect(route.engine).toBe(PLAYBACK_ENGINE_LOCAL_HTML);
  });

  test('abcMidiUsesAndroidNativePrerender follows platform', function() {
    prefersNativeMediaPlayback.mockReturnValue(true);
    expect(abcMidiUsesAndroidNativePrerender()).toBe(true);
  });
});
