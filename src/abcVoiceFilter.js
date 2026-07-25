import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { stripNotationDisplayMetadata } from './notation/notationDisplayAbc';
import { getTuneVoiceKeys, getPlaybackVoiceKeys } from './abcVoiceViewSettings';
import { buildAbcWithNoteSpacing } from './noteSpacingUtils';

function sortVoiceKeys(voiceKeys) {
  return voiceKeys.slice().sort(function(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

/** Return a tune copy containing only the requested voice keys. */
export function filterTuneVoices(tune, voiceKeys) {
  if (!tune) return tune;
  const keys = sortVoiceKeys(voiceKeys || []);
  if (!keys.length) return tune;
  const tuneCopy = JSON.parse(JSON.stringify(tune));
  if (!tuneCopy.voices) return tuneCopy;
  const filtered = {};
  // Renumber to V:1..n so abcjs still renders when the original first voice is hidden.
  let outIndex = 1;
  keys.forEach(function(key) {
    if (tune.voices && tune.voices[key]) {
      filtered[String(outIndex)] = tuneCopy.voices[key];
      outIndex += 1;
    }
  });
  if (!Object.keys(filtered).length) {
    const primary = resolvePrimaryVoiceKey(tune.voices);
    if (primary && tune.voices[primary]) {
      filtered['1'] = JSON.parse(JSON.stringify(tune.voices[primary]));
    }
  }
  tuneCopy.voices = filtered;
  return tuneCopy;
}

export function buildFilteredTuneAbc(tune, tunebook, voiceKeys, options) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  const filteredTune = filterTuneVoices(tune, voiceKeys);
  const abc = tunebook.abcTools.json2abc(filteredTune);
  const opts = options || {};
  if (opts.stripMetadata) {
    return stripNotationDisplayMetadata(abc);
  }
  return abc;
}

/** ABC for synth playback honoring per-tune playable voice settings. */
export function buildPlayableTuneAbc(tune, tunebook, options) {
  if (!tune || !tunebook || !tunebook.abcTools) return '';
  const voiceKeys = getTuneVoiceKeys(tune);
  const playbackKeys = getPlaybackVoiceKeys(tune.id, voiceKeys);
  const filteredTune = filterTuneVoices(tune, playbackKeys);
  const spacingOptions = Object.assign({ includeLyrics: false }, options || {});
  const abc = buildAbcWithNoteSpacing(filteredTune, tunebook.abcTools, spacingOptions);
  return abc.split('\n').filter(function(line) { return !line.startsWith('B:'); }).join('\n');
}
