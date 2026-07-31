/**
 * Central playback routing decisions extracted from useTuneBookMediaController.
 * Returns which engine should handle play for a given context.
 */

import { prefersNativeMediaPlayback } from './platformUtils';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
  isSnapcastPreferredOutput,
} from './preferredRemoteOutputSettings';
import { isArchiveOrgLinkUri } from './archiveOrgLinkUtils';
import { isBandcampLinkUri } from './bandcampLinkUtils';
import { isLocGovLinkUri } from './locGovLinkUtils';
import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils';

const RECORDING_LINK_PREFIX = 'abcbook-recording:';

function isOwnedMediaLinkUri(uri) {
  return !!(uri && String(uri).trim().startsWith(RECORDING_LINK_PREFIX));
}

function requiresResolverProxiedPlayback(src) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  return isMusicCollectionLinkUri(trimmed)
    || isBandcampLinkUri(trimmed)
    || isArchiveOrgLinkUri(trimmed)
    || isLocGovLinkUri(trimmed);
}

export const PLAYBACK_ENGINE_LOCAL_HTML = 'local-html';
export const PLAYBACK_ENGINE_LOCAL_PROCESSOR = 'local-processor';
export const PLAYBACK_ENGINE_ANDROID_NATIVE = 'android-native';
export const PLAYBACK_ENGINE_NOTATION_MIDI = 'notation-midi';
export const PLAYBACK_ENGINE_MIDI_FILE = 'midi-file';
export const PLAYBACK_ENGINE_YOUTUBE_IFRAME = 'youtube-iframe';
export const PLAYBACK_ENGINE_YOUTUBE_NATIVE = 'youtube-native';
export const PLAYBACK_ENGINE_SNAPCAST = 'snapcast';
export const PLAYBACK_ENGINE_CAST = 'cast';

/**
 * @param {object} context
 * @param {object|null} context.tune
 * @param {string|null} context.srcType - audio|youtube|recording|midi|midifile|empty
 * @param {string|null} context.src
 * @param {boolean} context.isMidiPlaybackRoute
 * @param {boolean} context.isMidiFileMediaRoute
 * @param {boolean} context.needsExternalProcessing
 * @param {boolean} context.mediaResolverAvailable
 * @param {boolean} context.cachedBlobAvailable
 * @param {boolean} context.remoteOutputActive
 * @returns {{ engine: string, resolverRequired: boolean, remoteOutputAllowed: boolean }}
 */
export function resolvePlaybackRoute(context) {
  const ctx = context || {};
  const srcType = ctx.srcType || 'empty';
  const src = ctx.src || '';
  const remoteOutputAllowed = getSnapcastOutputEnabled() || getChromecastOutputEnabled();

  if (ctx.isMidiPlaybackRoute) {
    return {
      engine: prefersNativeMediaPlayback()
        ? PLAYBACK_ENGINE_ANDROID_NATIVE
        : PLAYBACK_ENGINE_NOTATION_MIDI,
      resolverRequired: false,
      remoteOutputAllowed: remoteOutputAllowed,
    };
  }

  if (ctx.isMidiFileMediaRoute || srcType === 'midifile' || srcType === 'midi') {
    return {
      engine: PLAYBACK_ENGINE_MIDI_FILE,
      resolverRequired: false,
      remoteOutputAllowed: remoteOutputAllowed,
    };
  }

  if (remoteOutputAllowed && isSnapcastPreferredOutput() && !ctx.remoteOutputActive) {
    return {
      engine: PLAYBACK_ENGINE_SNAPCAST,
      resolverRequired: true,
      remoteOutputAllowed: true,
    };
  }

  if (srcType === 'youtube') {
    if (prefersNativeMediaPlayback() && ctx.androidYoutubeNative) {
      return {
        engine: PLAYBACK_ENGINE_YOUTUBE_NATIVE,
        resolverRequired: false,
        remoteOutputAllowed: remoteOutputAllowed,
      };
    }
    return {
      engine: PLAYBACK_ENGINE_YOUTUBE_IFRAME,
      resolverRequired: false,
      remoteOutputAllowed: remoteOutputAllowed,
    };
  }

  if (ctx.needsExternalProcessing) {
    return {
      engine: ctx.canUseNativeFiltered ? PLAYBACK_ENGINE_ANDROID_NATIVE : PLAYBACK_ENGINE_LOCAL_PROCESSOR,
      resolverRequired: !ctx.cachedBlobAvailable && !isOwnedMediaLinkUri(src),
      remoteOutputAllowed: remoteOutputAllowed,
    };
  }

  if (prefersNativeMediaPlayback() && (srcType === 'audio' || srcType === 'recording')) {
    return {
      engine: PLAYBACK_ENGINE_ANDROID_NATIVE,
      resolverRequired: !ctx.cachedBlobAvailable
        && requiresResolverProxiedPlayback(src)
        && !isOwnedMediaLinkUri(src),
      remoteOutputAllowed: remoteOutputAllowed,
    };
  }

  const resolverRequired = !ctx.cachedBlobAvailable
    && requiresResolverProxiedPlayback(src)
    && !isOwnedMediaLinkUri(src)
    && srcType !== 'recording';

  return {
    engine: PLAYBACK_ENGINE_LOCAL_HTML,
    resolverRequired: resolverRequired,
    remoteOutputAllowed: remoteOutputAllowed,
  };
}

/**
 * Android ABC notation uses on-device WAV pre-render (notationAudioExport) rather than
 * web useAbcSynth or resolver FluidSynth. Keep engines separate until soundfont parity exists.
 */
export function abcMidiUsesAndroidNativePrerender() {
  return prefersNativeMediaPlayback();
}
