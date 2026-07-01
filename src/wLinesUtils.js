import { expandRepeatedSectionLyrics } from './chordSheetUtils';

export function getLyricLines(tune) {
  if (!tune) return [];
  if (Array.isArray(tune.wLines) && tune.wLines.length > 0) return tune.wLines.slice();
  if (Array.isArray(tune.words) && tune.words.length > 0) return tune.words.slice();
  return [];
}

export function getLyricLinesForDisplay(tune) {
  return expandRepeatedSectionLyrics(getLyricLines(tune));
}

export function setLyricLines(tune, lines) {
  if (!tune) return;
  tune.wLines = Array.isArray(lines) ? lines : String(lines || '').split('\n');
}

export function lyricLinesToText(tune) {
  return getLyricLines(tune).join('\n');
}

export function countVoiceNoteLines(tune) {
  if (!tune || !tune.voices) return 0;
  return Object.keys(tune.voices).reduce(function(total, voice) {
    const notes = tune.voices[voice] && tune.voices[voice].notes;
    return total + (Array.isArray(notes) ? notes.length : 0);
  }, 0);
}

export function wordsMatchWLines(tune) {
  const words = Array.isArray(tune && tune.words) ? tune.words : [];
  const wLines = Array.isArray(tune && tune.wLines) ? tune.wLines : [];
  return words.length > 0
    && words.length === wLines.length
    && words.every(function(word, index) { return word === wLines[index]; });
}

export function getInterleavedLyricLines(tune) {
  const wLines = Array.isArray(tune && tune.wLines) ? tune.wLines : [];
  if (wLines.length === 0) return [];
  if (tune.timingScaffold) return wLines.slice();
  if (wordsMatchWLines(tune)) return [];
  const words = Array.isArray(tune.words) ? tune.words : [];
  if (words.length > 0) return wLines.slice();
  if (wLines.length <= countVoiceNoteLines(tune)) return wLines.slice();
  return [];
}

export function getBlockLyricLines(tune) {
  const words = Array.isArray(tune && tune.words) ? tune.words : [];
  if (words.length > 0) return words.slice();
  const wLines = Array.isArray(tune && tune.wLines) ? tune.wLines : [];
  if (wLines.length > 0 && !tune.timingScaffold && wLines.length > countVoiceNoteLines(tune)) {
    return wLines.slice();
  }
  return [];
}

export function renderBlockLyricsAbc(tune) {
  const lines = getBlockLyricLines(tune);
  if (lines.length === 0) return '';
  return lines.map(function(line) { return 'W: ' + line; }).join('\n') + '\n';
}
