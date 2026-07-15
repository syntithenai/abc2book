import { getResourceBase, resourceUrl } from './resourceBase';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';

const DEFAULT_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs';
const DEFAULT_SOUNDFONT_VOLUME = 1.0;

export const MUSYNGKITE_SOUNDFONT_PATH = 'midi-js-soundfonts/MusyngKite/';
export const LOCAL_SELECTION_SOUNDFONT_PATH = 'midi-js-soundfonts/selection/MusyngKite/';
export const LOCAL_ABCJS_SOUNDFONT_PATH = 'midi-js-soundfonts/abcjs/';

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
  // Accept either the store shape { available, status } or a probe status object.
  if (health.soundfontsReady === true) {
    return health.available !== false;
  }
  if (health.status && health.status.soundfontsReady === true) {
    return health.available !== false;
  }
  return false;
}

/**
 * Base URL for abcjs CreateSynth (`{url}{instrument}-mp3/{Note}.mp3`).
 * Prefer full MusyngKite via resolver when ready; otherwise the embedded selection.
 */
export function getSoundFontUrl(options) {
  const opts = options || {};
  const fromEnv = process.env.REACT_APP_SOUNDFONT_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return withTrailingSlash(fromEnv);
  }

  const ready = opts.musyngKiteReady !== undefined
    ? !!opts.musyngKiteReady
    : isResolverMusyngKiteReady();

  const resourceBase = getResourceBase();
  if (ready) {
    if (resourceBase) return withTrailingSlash(resourceBase + '/' + MUSYNGKITE_SOUNDFONT_PATH);
    return withTrailingSlash('/' + MUSYNGKITE_SOUNDFONT_PATH);
  }

  // Local subset for remapped GM programs (multi-instrument when bank not ready).
  if (opts.preferSelection !== false) {
    if (resourceBase) return withTrailingSlash(resourceBase + '/' + LOCAL_SELECTION_SOUNDFONT_PATH);
    return withTrailingSlash('/' + LOCAL_SELECTION_SOUNDFONT_PATH);
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
  const ready = opts.musyngKiteReady !== undefined
    ? !!opts.musyngKiteReady
    : isResolverMusyngKiteReady();
  if (ready) {
    return resourceUrl('midi-js-soundfonts').replace(/\/+$/, '') || '/midi-js-soundfonts';
  }
  return resourceUrl('midi-js-soundfonts/selection').replace(/\/+$/, '')
    || '/midi-js-soundfonts/selection';
}
