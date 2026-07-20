/**
 * Lyrics commonality gate for collection / library merge proposals.
 * Flexible overlap — unrelated verses should not keep a title-only match.
 * Missing lyrics on either side do not block a match.
 */

const LYRIC_STOP_WORDS = {
  the: true,
  and: true,
  for: true,
  you: true,
  that: true,
  with: true,
  this: true,
  from: true,
  your: true,
  have: true,
  are: true,
  was: true,
  were: true,
  but: true,
  not: true,
  all: true,
  can: true,
  her: true,
  his: true,
  she: true,
  him: true,
  they: true,
  them: true,
  its: true,
  our: true,
  out: true,
  who: true,
  what: true,
  when: true,
  will: true,
  just: true,
  like: true,
  dont: true,
  into: true,
  than: true,
  then: true,
  there: true,
  their: true,
  about: true,
};

function lyricSourceLines(tune) {
  if (!tune) return [];
  if (Array.isArray(tune.words) && tune.words.length) return tune.words;
  if (Array.isArray(tune.wLines) && tune.wLines.length) return tune.wLines;
  return [];
}

/** Strip ChordPro chords / braces and collapse to lowercase words. */
export function normalizeLyricLineForMatch(line) {
  return String(line == null ? '' : line)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function significantLyricTokensFromTune(tune) {
  const tokens = [];
  lyricSourceLines(tune).forEach(function(raw) {
    const normalized = normalizeLyricLineForMatch(raw);
    if (!normalized) return;
    normalized.split(/\s+/).forEach(function(token) {
      if (token.length <= 2) return;
      if (LYRIC_STOP_WORDS[token]) return;
      tokens.push(token);
    });
  });
  return tokens;
}

function uniqueTokenSet(tokens) {
  const set = {};
  (Array.isArray(tokens) ? tokens : []).forEach(function(token) {
    set[token] = true;
  });
  return set;
}

function nontrivialLyricLines(tune) {
  const lines = [];
  lyricSourceLines(tune).forEach(function(raw) {
    const normalized = normalizeLyricLineForMatch(raw);
    if (normalized.length < 12) return;
    lines.push(normalized);
  });
  return lines;
}

function sharedLyricLine(tuneA, tuneB) {
  const linesA = nontrivialLyricLines(tuneA);
  const linesB = nontrivialLyricLines(tuneB);
  if (!linesA.length || !linesB.length) return false;
  for (let i = 0; i < linesA.length; i += 1) {
    const a = linesA[i];
    for (let j = 0; j < linesB.length; j += 1) {
      const b = linesB[j];
      if (a === b) return true;
      if (a.length >= 16 && b.indexOf(a) !== -1) return true;
      if (b.length >= 16 && a.indexOf(b) !== -1) return true;
    }
  }
  return false;
}

/**
 * True when lyrics do not contradict a collection match.
 * Empty / tiny lyrics on either side → allow (title/composer still decide).
 * Otherwise require some token or line commonality.
 */
export function importLyricsMatchForDeduping(tuneA, tuneB) {
  const tokensA = significantLyricTokensFromTune(tuneA);
  const tokensB = significantLyricTokensFromTune(tuneB);
  if (tokensA.length === 0 || tokensB.length === 0) return true;
  // Too little text to confidently reject a title match
  if (tokensA.length < 6 || tokensB.length < 6) return true;

  if (sharedLyricLine(tuneA, tuneB)) return true;

  const setA = uniqueTokenSet(tokensA);
  const setB = uniqueTokenSet(tokensB);
  const keysA = Object.keys(setA);
  const keysB = Object.keys(setB);
  let inter = 0;
  keysA.forEach(function(token) {
    if (setB[token]) inter += 1;
  });
  const smaller = Math.min(keysA.length, keysB.length);
  if (smaller <= 0) return true;

  const ratio = inter / smaller;
  if (inter >= 8) return true;
  if (inter >= 4 && ratio >= 0.22) return true;
  if (inter >= 3 && ratio >= 0.35) return true;
  return false;
}
