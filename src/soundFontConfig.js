import { getResourceBase, resourceUrl } from './resourceBase';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';
import {
  isLocalGmProgramShipped,
  remapGmProgramToLocal,
} from './localSoundfontInstrumentMap';

const DEFAULT_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs';
const ONLINE_MUSYNGKITE_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/';
const DEFAULT_SOUNDFONT_VOLUME = 2.0;

export const MUSYNGKITE_SOUNDFONT_PATH = 'midi-js-soundfonts/MusyngKite/';
export const LOCAL_SELECTION_SOUNDFONT_PATH = 'midi-js-soundfonts/selection/MusyngKite/';
export const LOCAL_ABCJS_SOUNDFONT_PATH = 'midi-js-soundfonts/abcjs/';

export { ONLINE_MUSYNGKITE_CDN };

export function getSoundFontVolumeMultiplier() {
  const fromEnv = process.env.REACT_APP_SOUNDFONT_VOLUME;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    const parsed = parseFloat(fromEnv);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SOUNDFONT_VOLUME;
}

function withTrailingSlash(url) {
  const base = String(url || '').replace(/\/+$/, '');
  return base ? base + '/' : '/';
}

/**
 * True when the local-resolver has finished downloading the full MusyngKite bank.
 */
export function isResolverMusyngKiteReady(healthOrStatus) {
  const health = healthOrStatus || getMediaResolverHealthState();
  if (!health) return false;
  if (health.soundfontsReady === true) {
    return health.available !== false;
  }
  if (health.status && health.status.soundfontsReady === true) {
    return health.available !== false;
  }
  return false;
}

export function getSelectionSoundFontUrl() {
  const fromEnv = process.env.REACT_APP_SOUNDFONT_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return withTrailingSlash(fromEnv);
  }
  const resourceBase = getResourceBase();
  if (resourceBase) {
    return withTrailingSlash(resourceBase + '/' + LOCAL_SELECTION_SOUNDFONT_PATH);
  }
  return withTrailingSlash('/' + LOCAL_SELECTION_SOUNDFONT_PATH);
}

export function getOnlineMusyngKiteUrl() {
  const fromEnv = process.env.REACT_APP_SOUNDFONT_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return withTrailingSlash(fromEnv);
  }
  const resourceBase = getResourceBase();
  if (isResolverMusyngKiteReady() && resourceBase) {
    return withTrailingSlash(resourceBase + '/' + MUSYNGKITE_SOUNDFONT_PATH);
  }
  return withTrailingSlash(ONLINE_MUSYNGKITE_CDN);
}

/**
 * Playback soundfont plan: default embedded selection + GM remap for fast first play.
 * Online full MusyngKite when tune.soundFonts === 'online' or a required program
 * is not covered by the shipped selection after remap.
 *
 * @returns {{ url: string, remap: boolean, bank: 'selection'|'online' }}
 */
export function getPlaybackSoundFontPlan(options) {
  const opts = options || {};
  const tune = opts.tune;
  const forceLocal = !!(tune && tune.soundFonts === 'local');
  const preferOnline = !!(tune && tune.soundFonts === 'online');

  let useOnline = preferOnline && !forceLocal;
  if (!useOnline && !forceLocal && Array.isArray(opts.requiredPrograms)) {
    for (let i = 0; i < opts.requiredPrograms.length; i += 1) {
      const localProgram = remapGmProgramToLocal(opts.requiredPrograms[i]);
      if (!isLocalGmProgramShipped(localProgram)) {
        useOnline = true;
        break;
      }
    }
  }

  if (useOnline) {
    return {
      url: getOnlineMusyngKiteUrl(),
      remap: false,
      bank: 'online',
    };
  }
  return {
    url: getSelectionSoundFontUrl(),
    remap: true,
    bank: 'selection',
  };
}

/**
 * Base URL for abcjs CreateSynth (`{url}{instrument}-mp3/{Note}.mp3`).
 * Non-playback callers may still pass musyngKiteReady; interactive MIDI should
 * use getPlaybackSoundFontPlan instead.
 */
export function getSoundFontUrl(options) {
  const opts = options || {};
  const fromEnv = process.env.REACT_APP_SOUNDFONT_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return withTrailingSlash(fromEnv);
  }

  if (opts.preferSelection === true) {
    return getSelectionSoundFontUrl();
  }

  const ready = opts.musyngKiteReady !== undefined
    ? !!opts.musyngKiteReady
    : isResolverMusyngKiteReady();

  const resourceBase = getResourceBase();
  if (ready) {
    if (resourceBase) return withTrailingSlash(resourceBase + '/' + MUSYNGKITE_SOUNDFONT_PATH);
    return withTrailingSlash('/' + MUSYNGKITE_SOUNDFONT_PATH);
  }

  if (opts.preferSelection !== false) {
    return getSelectionSoundFontUrl();
  }

  if (resourceBase) return withTrailingSlash(resourceBase + '/' + LOCAL_ABCJS_SOUNDFONT_PATH);
  if (process.env.NODE_ENV === 'development') {
    return withTrailingSlash(DEFAULT_SOUNDFONT_CDN);
  }
  return withTrailingSlash('/' + LOCAL_ABCJS_SOUNDFONT_PATH);
}

/** Hostname base for soundfont-player (`{host}/MusyngKite/{name}-mp3.js`). */
export function getSoundfontPlayerHostname(options) {
  const opts = options || {};
  if (opts.preferSelection === true) {
    return resourceUrl('midi-js-soundfonts/selection').replace(/\/+$/, '')
      || '/midi-js-soundfonts/selection';
  }
  const ready = opts.musyngKiteReady !== undefined
    ? !!opts.musyngKiteReady
    : isResolverMusyngKiteReady();
  if (ready) {
    return resourceUrl('midi-js-soundfonts').replace(/\/+$/, '') || '/midi-js-soundfonts';
  }
  return resourceUrl('midi-js-soundfonts/selection').replace(/\/+$/, '')
    || '/midi-js-soundfonts/selection';
}
