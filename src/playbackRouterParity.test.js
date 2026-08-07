jest.mock('./platformUtils', function() {
  return {
    prefersNativeMediaPlayback: jest.fn(function() { return false; }),
    isAndroidApp: jest.fn(function() { return false; }),
  };
});

import {
  PLAYBACK_ENGINE_ANDROID_NATIVE,
  PLAYBACK_ENGINE_CAST,
  PLAYBACK_ENGINE_LOCAL_HTML,
  PLAYBACK_ENGINE_LOCAL_PROCESSOR,
  PLAYBACK_ENGINE_MIDI_FILE,
  PLAYBACK_ENGINE_NOTATION_MIDI,
  PLAYBACK_ENGINE_SNAPCAST,
  PLAYBACK_ENGINE_YOUTUBE_IFRAME,
} from './playbackRouter';
import {
  branchToExpectedEngine,
  classifyPlayBranch,
  comparePlaybackRoutes,
  isBranchParityExempt,
  isRouterEnforcedForPath,
  mapActiveEngineToRouterEngine,
  PARITY_EXEMPT_BRANCHES,
  ROUTER_ENFORCE_KEYS,
} from './playbackRouterParity';

const { prefersNativeMediaPlayback } = require('./platformUtils');

describe('playbackRouterParity', function() {
  beforeEach(function() {
    localStorage.clear();
    prefersNativeMediaPlayback.mockReturnValue(false);
  });

  test('mapActiveEngineToRouterEngine covers getActivePlaybackEngine values', function() {
    expect(mapActiveEngineToRouterEngine('snapcast', 'media')).toBe(PLAYBACK_ENGINE_SNAPCAST);
    expect(mapActiveEngineToRouterEngine('cast', 'media')).toBe(PLAYBACK_ENGINE_CAST);
    expect(mapActiveEngineToRouterEngine('nativeMidi', 'midi')).toBe(PLAYBACK_ENGINE_ANDROID_NATIVE);
    expect(mapActiveEngineToRouterEngine('midi', 'midi')).toBe(PLAYBACK_ENGINE_NOTATION_MIDI);
    expect(mapActiveEngineToRouterEngine('midifile', 'media')).toBe(PLAYBACK_ENGINE_MIDI_FILE);
    expect(mapActiveEngineToRouterEngine('nativeFiltered', 'media')).toBe(PLAYBACK_ENGINE_ANDROID_NATIVE);
    expect(mapActiveEngineToRouterEngine('external', 'media')).toBe(PLAYBACK_ENGINE_LOCAL_PROCESSOR);
    expect(mapActiveEngineToRouterEngine('pending', 'media')).toBe(PLAYBACK_ENGINE_LOCAL_PROCESSOR);
    expect(mapActiveEngineToRouterEngine('youtube', 'media')).toBe(PLAYBACK_ENGINE_YOUTUBE_IFRAME);
    expect(mapActiveEngineToRouterEngine('audio', 'media')).toBe(PLAYBACK_ENGINE_LOCAL_HTML);
    expect(mapActiveEngineToRouterEngine('none', 'media')).toBe(null);
  });

  test('classifyPlayBranch for midi and media', function() {
    expect(classifyPlayBranch({ routeMode: 'midi', prefersNative: false })).toBe('midi-synth');
    prefersNativeMediaPlayback.mockReturnValue(true);
    expect(classifyPlayBranch({ routeMode: 'midi', prefersNative: true })).toBe('midi-native');
    expect(classifyPlayBranch({
      routeMode: 'media',
      isMidiFileMediaRoute: true,
      srcType: 'midifile',
    })).toBe('media-midifile');
    expect(classifyPlayBranch({
      routeMode: 'media',
      srcType: 'youtube',
      androidYoutubeNative: false,
    })).toBe('media-youtube');
  });

  test('comparePlaybackRoutes with allowed engines', function() {
    const result = comparePlaybackRoutes(
      { engine: PLAYBACK_ENGINE_SNAPCAST },
      { engine: PLAYBACK_ENGINE_LOCAL_HTML },
      { allowedEngines: [PLAYBACK_ENGINE_LOCAL_HTML, PLAYBACK_ENGINE_SNAPCAST] }
    );
    expect(result.match).toBe(true);
  });

  test('branchToExpectedEngine round-trip for fixtures branches', function() {
    const branches = [
      'midi-synth', 'midi-native', 'media-midifile', 'media-external',
      'media-youtube', 'media-native-audio', 'media-html-audio',
    ];
    branches.forEach(function(branch) {
      expect(branchToExpectedEngine(branch)).toBeTruthy();
    });
  });

  test('parity exempt branches', function() {
    PARITY_EXEMPT_BRANCHES.forEach(function(branch) {
      expect(isBranchParityExempt(branch)).toBe(true);
    });
    expect(isBranchParityExempt('midi-synth')).toBe(false);
  });

  test('isRouterEnforcedForPath reads localStorage', function() {
    expect(isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.resolverPrecheck)).toBe(false);
    localStorage.setItem('tunebook_playback_router_enforce', 'resolver-precheck');
    expect(isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.resolverPrecheck)).toBe(true);
    localStorage.clear();
    localStorage.setItem('tunebook_playback_router_enforce', 'all');
    expect(isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.midiNative)).toBe(true);
  });

  test('shouldAttemptSnapcastDefault respects preference', function() {
    const { shouldAttemptSnapcastDefault } = require('./playbackRouterParity');
    const { setPreferredRemoteOutput, PREFERRED_OUTPUT_SNAPCAST } = require('./preferredRemoteOutputSettings');
    setPreferredRemoteOutput(PREFERRED_OUTPUT_SNAPCAST);
    expect(shouldAttemptSnapcastDefault({
      routeMode: 'media',
      srcType: 'audio',
      src: 'https://example.com/a.mp3',
      remoteOutputActive: false,
    })).toBe(true);
  });

  test('prefersAndroidNativeAudioPath when not enforced', function() {
    const { prefersAndroidNativeAudioPath } = require('./playbackRouterParity');
    prefersNativeMediaPlayback.mockReturnValue(true);
    expect(prefersAndroidNativeAudioPath({ routeMode: 'media' }, 'audio', true)).toBe(true);
    expect(prefersAndroidNativeAudioPath({ routeMode: 'media' }, 'youtube', true)).toBe(false);
  });
});
