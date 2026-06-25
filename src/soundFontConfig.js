const DEFAULT_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs';
const DEFAULT_SOUNDFONT_VOLUME = 1.0;

export function getSoundFontVolumeMultiplier() {
  const fromEnv = process.env.REACT_APP_SOUNDFONT_VOLUME;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    const parsed = parseFloat(fromEnv);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SOUNDFONT_VOLUME;
}

export function getSoundFontUrl() {
  const fromEnv = process.env.REACT_APP_SOUNDFONT_BASE;
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    const base = String(fromEnv).trim().replace(/\/$/, '');
    return base + '/';
  }
  if (process.env.NODE_ENV === 'development') {
    return DEFAULT_SOUNDFONT_CDN + '/';
  }
  return '/midi-js-soundfonts/abcjs/';
}
