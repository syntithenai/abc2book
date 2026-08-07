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
  PREFERRED_OUTPUT_LOCAL,
} from './preferredRemoteOutputSettings';
import { buildPlaybackRouterContext } from './playbackRouterContext';
import { classifyPlayBranch } from './playbackRouterParity';
import { PLAYBACK_ROUTER_FIXTURES } from './playbackRouter.fixtures';

const { prefersNativeMediaPlayback } = require('./platformUtils');

function applyFixtureSettings(settings) {
  if (!settings) return;
  if (settings.snapcastPreferred) {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
  } else {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_LOCAL);
  }
  if (settings.snapcastOutputEnabled === false) {
    setSnapcastOutputEnabled(false);
  }
  if (settings.chromecastOutputEnabled === false) {
    setChromecastOutputEnabled(false);
  }
}

describe('playbackRouter', function() {
  beforeEach(function() {
    localStorage.clear();
    setSnapcastOutputEnabled(true);
    setChromecastOutputEnabled(true);
    prefersNativeMediaPlayback.mockReturnValue(false);
  });

  test.each(PLAYBACK_ROUTER_FIXTURES.map(function(f) { return [f.name, f]; }))(
    'fixture %s',
    function(_name, fixture) {
      applyFixtureSettings(fixture.settings);
      if (fixture.snapshot.prefersNative) {
        prefersNativeMediaPlayback.mockReturnValue(true);
      } else {
        prefersNativeMediaPlayback.mockReturnValue(false);
      }
      const route = resolvePlaybackRoute(buildPlaybackRouterContext(fixture.snapshot));
      expect(route.engine).toBe(fixture.expectedEngine);
      expect(route.resolverRequired).toBe(fixture.expectedResolverRequired);
      const branch = classifyPlayBranch(fixture.snapshot, {});
      expect(fixture.allowedBranches).toContain(branch);
    }
  );

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
