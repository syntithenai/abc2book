export function getLyricLines(tune) {
  if (!tune) return [];
  if (Array.isArray(tune.wLines) && tune.wLines.length > 0) return tune.wLines.slice();
  if (Array.isArray(tune.words) && tune.words.length > 0) return tune.words.slice();
  return [];
}

export function setLyricLines(tune, lines) {
  if (!tune) return;
  tune.wLines = Array.isArray(lines) ? lines : String(lines || '').split('\n');
}

export function lyricLinesToText(tune) {
  return getLyricLines(tune).join('\n');
}
