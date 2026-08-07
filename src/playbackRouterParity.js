import {
  PLAYBACK_ENGINE_ANDROID_NATIVE,
  PLAYBACK_ENGINE_CAST,
  PLAYBACK_ENGINE_LOCAL_HTML,
  PLAYBACK_ENGINE_LOCAL_PROCESSOR,
  PLAYBACK_ENGINE_MIDI_FILE,
  PLAYBACK_ENGINE_NOTATION_MIDI,
  PLAYBACK_ENGINE_SNAPCAST,
  PLAYBACK_ENGINE_YOUTUBE_IFRAME,
  PLAYBACK_ENGINE_YOUTUBE_NATIVE,
  abcMidiUsesAndroidNativePrerender,
  resolvePlaybackRoute,
} from './playbackRouter';
import { buildPlaybackRouterContext } from './playbackRouterContext';

export const ROUTER_ENFORCE_KEYS = {
  all: 'all',
  resolverPrecheck: 'resolver-precheck',
  snapcastDefault: 'snapcast-default',
  midiNative: 'midi-native',
  mediaNative: 'media-native',
  externalProcessing: 'external-processing',
};

export const PARITY_EXEMPT_BRANCHES = [
  'noop-idempotent',
  'snapcast-resume',
  'cast-resume',
  'seek-blocked',
];

const ENFORCE_STORAGE_PREFIX = 'tunebook_playback_router_enforce';

export function isRouterEnforcedForPath(pathKey) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const all = localStorage.getItem(ENFORCE_STORAGE_PREFIX);
    if (all === 'all' || all === '1') return true;
    if (pathKey && localStorage.getItem(ENFORCE_STORAGE_PREFIX + '_' + pathKey) === '1') {
      return true;
    }
    return pathKey && localStorage.getItem(ENFORCE_STORAGE_PREFIX) === pathKey;
  } catch (e) {
    return false;
  }
}

export function mapActiveEngineToRouterEngine(activeEngine, routeMode) {
  const engine = activeEngine || 'none';
  if (engine === 'snapcast') return PLAYBACK_ENGINE_SNAPCAST;
  if (engine === 'cast') return PLAYBACK_ENGINE_CAST;
  if (engine === 'nativeMidi') return PLAYBACK_ENGINE_ANDROID_NATIVE;
  if (engine === 'midi') return PLAYBACK_ENGINE_NOTATION_MIDI;
  if (engine === 'midifile') return PLAYBACK_ENGINE_MIDI_FILE;
  if (engine === 'nativeFiltered') return PLAYBACK_ENGINE_ANDROID_NATIVE;
  if (engine === 'external' || engine === 'pending') return PLAYBACK_ENGINE_LOCAL_PROCESSOR;
  if (engine === 'youtube') {
    return routeMode === 'media' ? PLAYBACK_ENGINE_YOUTUBE_IFRAME : PLAYBACK_ENGINE_YOUTUBE_IFRAME;
  }
  if (engine === 'audio') return PLAYBACK_ENGINE_LOCAL_HTML;
  return null;
}

export function classifyPlayBranch(snapshot, opts) {
  const s = snapshot || {};
  const playOpts = opts || s.playOpts || {};

  if (s.snapcastRemoteActive) return 'snapcast-resume';
  if (s.castRemoteActive) return 'cast-resume';

  if (!s.snapcastRemoteActive && !s.castRemoteActive && shouldAttemptSnapcastDefault(s)) {
    return 'snapcast-default';
  }

  if (!playOpts.restart && !playOpts.fresh
    && s.isPlaying && !s.userPaused && s.hasActiveOutput) {
    return 'noop-idempotent';
  }

  if (s.routeMode === 'midi') {
    if (s.prefersNative && abcMidiUsesAndroidNativePrerender()) {
      return 'midi-native';
    }
    return 'midi-synth';
  }

  if (s.isMidiFileMediaRoute || s.srcType === 'midifile') {
    return 'media-midifile';
  }

  if (s.needsExternalProcessing) {
    if (s.canUseNativeFiltered) return 'media-native-filtered';
    return 'media-external';
  }

  if (s.srcType === 'youtube') {
    if (s.androidYoutubeNative) return 'media-youtube-native';
    return 'media-youtube';
  }

  if (s.prefersNative && (s.srcType === 'audio' || s.srcType === 'recording')) {
    return 'media-native-audio';
  }

  if (s.srcType === 'audio' || s.srcType === 'recording') {
    return 'media-html-audio';
  }

  return 'unknown';
}

export function branchToExpectedEngine(branch) {
  if (branch === 'snapcast-resume') return PLAYBACK_ENGINE_SNAPCAST;
  if (branch === 'cast-resume') return PLAYBACK_ENGINE_CAST;
  if (branch === 'snapcast-default') return PLAYBACK_ENGINE_SNAPCAST;
  if (branch === 'midi-native') return PLAYBACK_ENGINE_ANDROID_NATIVE;
  if (branch === 'midi-synth') return PLAYBACK_ENGINE_NOTATION_MIDI;
  if (branch === 'media-midifile') return PLAYBACK_ENGINE_MIDI_FILE;
  if (branch === 'media-native-filtered') return PLAYBACK_ENGINE_ANDROID_NATIVE;
  if (branch === 'media-external') return PLAYBACK_ENGINE_LOCAL_PROCESSOR;
  if (branch === 'media-youtube-native') return PLAYBACK_ENGINE_YOUTUBE_NATIVE;
  if (branch === 'media-youtube') return PLAYBACK_ENGINE_YOUTUBE_IFRAME;
  if (branch === 'media-native-audio') return PLAYBACK_ENGINE_ANDROID_NATIVE;
  if (branch === 'media-html-audio') return PLAYBACK_ENGINE_LOCAL_HTML;
  return null;
}

export function comparePlaybackRoutes(expected, actual, options) {
  const opts = options || {};
  if (!expected || !actual) {
    return { match: false, reason: 'missing-route', severity: opts.severity || 'policy' };
  }
  if (expected.engine === actual.engine) {
    return { match: true, reason: '', severity: 'none' };
  }
  if (opts.allowedEngines && opts.allowedEngines.indexOf(actual.engine) >= 0) {
    return { match: true, reason: 'allowed-engine', severity: 'none' };
  }
  return {
    match: false,
    reason: 'engine-mismatch:' + expected.engine + '!=' + actual.engine,
    severity: opts.severity || 'policy',
  };
}

export function resolveRouteFromSnapshot(snapshot) {
  return resolvePlaybackRoute(buildPlaybackRouterContext(snapshot));
}

export function shouldAttemptSnapcastDefault(snapshot) {
  const route = resolveRouteFromSnapshot(snapshot);
  return route.engine === PLAYBACK_ENGINE_SNAPCAST;
}

export function shouldUseMidiNativePath(snapshot) {
  if (isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.midiNative)) {
    const route = resolveRouteFromSnapshot(snapshot);
    return route.engine === PLAYBACK_ENGINE_ANDROID_NATIVE;
  }
  return abcMidiUsesAndroidNativePrerender();
}

export function shouldUseMediaNativePath(snapshot) {
  if (!isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.mediaNative)) return null;
  const route = resolveRouteFromSnapshot(snapshot);
  return route.engine === PLAYBACK_ENGINE_ANDROID_NATIVE;
}

export function shouldUseExternalProcessorPath(snapshot) {
  if (!isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.externalProcessing)) return null;
  const route = resolveRouteFromSnapshot(snapshot);
  return route.engine === PLAYBACK_ENGINE_LOCAL_PROCESSOR;
}

export function shouldBlockNativeFilteredPath(snapshot) {
  if (!isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.externalProcessing)) return false;
  return shouldUseExternalProcessorPath(snapshot) === true;
}

export function prefersAndroidNativeAudioPath(snapshot, srcType, prefersNative) {
  if (!prefersNative || srcType !== 'audio') return false;
  const enforced = shouldUseMediaNativePath(snapshot);
  if (enforced === null) return true;
  return enforced === true;
}

export function isBranchParityExempt(branch) {
  return PARITY_EXEMPT_BRANCHES.indexOf(branch) >= 0;
}
