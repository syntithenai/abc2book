import { normalizeMidiBinaryData } from './midiFileUtils';

function bytesToBase64(bytes) {
  if (!bytes) return '';
  if (typeof bytes === 'string') return bytes;
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray ? bytes.subarray(i, i + chunk) : bytes.slice(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

export function exportAbcMidiBase64(tune, tunebook) {
  if (!tune || !tunebook || typeof tunebook.getMidiData !== 'function') return null;
  const midi = tunebook.getMidiData(tune, 'binary');
  const bytes = normalizeMidiBinaryData(midi);
  if (!bytes) return null;
  return bytesToBase64(bytes);
}

export function isAbcMidiPlaybackRoute(mediaController) {
  return !!(mediaController
    && mediaController.isMidiPlaybackRoute
    && mediaController.isMidiPlaybackRoute());
}

export function buildAbcMidiSessionFields(tune, tunebook) {
  const midiBase64 = exportAbcMidiBase64(tune, tunebook);
  if (!midiBase64 || !tune) return null;
  return {
    source: 'abc-midi://' + String(tune.id || 'tune'),
    sourceType: 'abc-midi',
    midiBase64: midiBase64,
    title: tune.name || '',
    artist: tune.composer || '',
  };
}
