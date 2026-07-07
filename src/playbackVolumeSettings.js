const STORAGE_KEY = 'bookstorage_playback_volume';
const DEFAULT_VOLUME = 1;
export const PLAYBACK_VOLUME_STEP = 0.05;
export const PLAYBACK_VOLUME_MIN = 0;
export const PLAYBACK_VOLUME_MAX = 1;

function clampVolume(value) {
  const n = parseFloat(value);
  if (isNaN(n) || !isFinite(n)) return DEFAULT_VOLUME;
  return Math.max(PLAYBACK_VOLUME_MIN, Math.min(PLAYBACK_VOLUME_MAX, n));
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === '') return DEFAULT_VOLUME;
    return clampVolume(raw);
  } catch (e) {
    return DEFAULT_VOLUME;
  }
}

function writeStored(volume) {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampVolume(volume)));
  } catch (e) {}
}

export function getPlaybackVolume() {
  return readStored();
}

export function setPlaybackVolume(volume) {
  const next = clampVolume(volume);
  writeStored(next);
  return next;
}

export function adjustPlaybackVolume(delta) {
  return setPlaybackVolume(readStored() + (parseFloat(delta) || 0));
}
