/**
 * A `/` in a lyric word marks a bar/beat anchor (usually the first beat of a
 * bar). It may lead the word (`/grace`) or sit mid-word (`a/mazing`). Markers
 * stay in stored/edited lyrics and are stripped for display.
 *
 * Example: `a/mazing /grace how /sweet the /sound`
 *   → anchors on amazing, grace, sweet, sound
 *   → display: `amazing grace how sweet the sound`
 */

/** True when a whitespace token contains a beat-marker `/`. */
export function wordHasLyricBeatMarker(word) {
  const w = String(word == null ? '' : word);
  if (!w) return false;
  // Bare `/` tokens are anchors too.
  if (/^\/+$/.test(w.trim())) return true;
  return w.indexOf('/') >= 0 && /[^/\s]/.test(w);
}

/** Remove beat-marker slashes from one word token (leading or mid-word). */
export function stripLyricBeatMarkerFromWord(word) {
  return String(word == null ? '' : word).replace(/\//g, '');
}

/**
 * Word indices in a whitespace-split line that carry beat markers.
 * Standalone `/` tokens (no following text) also count as anchors.
 */
export function lyricBeatAnchorWordIndices(words) {
  const list = Array.isArray(words) ? words : [];
  const indices = [];
  for (let i = 0; i < list.length; i++) {
    if (wordHasLyricBeatMarker(list[i])) indices.push(i);
  }
  return indices;
}

/**
 * Map a bar index onto a beat-marker word index for that lyric line.
 * Returns null when the line has no markers (caller should fall back).
 */
export function wordIndexForBarFromLyricBeatAnchors(barIndex, barCount, anchorIndices) {
  const barAnchors = beatAnchorsForBar(barIndex, barCount, anchorIndices);
  if (barAnchors.length === 0) return null;
  return barAnchors[0];
}

/**
 * When a lyric line has fewer `/` markers than bars, treat the first word as
 * bar 1 (unless it is already marked) and insert extra downbeats in the
 * largest gaps so a whole-bar change like `G | F | C F |` can land on
 * `A new /throne` instead of skipping the F.
 */
export function expandLyricBeatDownbeats(anchorIndices, barCount) {
  const bars = Math.max(1, Number(barCount) || 1);
  const markers = Array.isArray(anchorIndices)
    ? anchorIndices.filter(function(index) { return Number.isFinite(index); })
    : [];
  if (markers.length === 0) return [];
  if (bars <= 1 || markers.length >= bars) return markers.slice();

  const downbeats = markers.slice();
  if (downbeats[0] !== 0) downbeats.unshift(0);

  while (downbeats.length < bars) {
    let bestI = -1;
    let bestSize = 1;
    for (let i = 0; i < downbeats.length - 1; i++) {
      const size = downbeats[i + 1] - downbeats[i];
      if (size > bestSize) {
        bestSize = size;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    const insertAt = downbeats[bestI] + Math.floor((downbeats[bestI + 1] - downbeats[bestI]) / 2);
    if (insertAt <= downbeats[bestI] || insertAt >= downbeats[bestI + 1]) break;
    downbeats.splice(bestI + 1, 0, insertAt);
  }
  return downbeats;
}

/**
 * Partition lyric beat-marker indices across the bars assigned to one line.
 * Extra markers on a single-bar line stay available for mid-bar chord changes
 * (e.g. `C B` over `/gather … /bow`).
 */
export function beatAnchorsForBar(barIndex, barCount, anchorIndices) {
  const anchors = Array.isArray(anchorIndices) ? anchorIndices : [];
  if (anchors.length === 0) return [];
  const bars = Math.max(1, Number(barCount) || 1);
  const b = Math.max(0, Math.min(Number(barIndex) || 0, bars - 1));
  if (bars <= 1) return anchors.slice();
  if (anchors.length === bars) return [anchors[b]];
  if (anchors.length > bars) {
    const start = Math.round((b * anchors.length) / bars);
    const end = Math.round(((b + 1) * anchors.length) / bars);
    const slice = anchors.slice(start, Math.max(start + 1, end));
    if (slice.length > 0) return slice;
    return [anchors[Math.min(b, anchors.length - 1)]];
  }
  const downbeats = expandLyricBeatDownbeats(anchors, bars);
  if (downbeats.length === bars) return [downbeats[b]];
  const start = Math.round((b * downbeats.length) / bars);
  const end = Math.round(((b + 1) * downbeats.length) / bars);
  const slice = downbeats.slice(start, Math.max(start + 1, end));
  if (slice.length > 0) return slice;
  return [downbeats[Math.min(b, downbeats.length - 1)]];
}

/**
 * Word slots for successive chords inside one bar, preferring that bar's beat
 * anchors over plain consecutive words.
 *
 * When there are at least as many anchors as chords, chords map 1:1 onto
 * markers (so mid-bar `C B` lands on `/gather … /bow`). When there are more
 * chords than markers, placement starts at the first marker and continues on
 * following words so chromatic runs stay readable.
 */
export function wordIndicesForChordsOnBeatAnchors(chordCount, barAnchors, fallbackStart, wordCount) {
  const n = Math.max(0, Number(chordCount) || 0);
  const limit = Math.max(1, Number(wordCount) || 1);
  if (n === 0) return [];
  const anchors = Array.isArray(barAnchors) ? barAnchors : [];
  const start = Math.max(0, Math.min(Number(fallbackStart) || 0, limit - 1));
  const out = [];
  if (anchors.length === 0) {
    for (let i = 0; i < n; i += 1) {
      out.push(Math.min(start + i, limit - 1));
    }
    return out;
  }
  if (n <= anchors.length) {
    for (let i = 0; i < n; i += 1) out.push(anchors[i]);
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    out.push(Math.min(anchors[0] + i, limit - 1));
  }
  return out;
}

/** Resolve bar → word index from beat markers on `info.words`, or null. */
export function resolveLyricBeatAnchorWordIndex(info) {
  const words = info && Array.isArray(info.words) ? info.words : [];
  const anchors = lyricBeatAnchorWordIndices(words);
  if (anchors.length === 0) return null;
  return wordIndexForBarFromLyricBeatAnchors(info.barIndex, info.barCount, anchors);
}

/**
 * Strip beat-marker slashes from a lyric line for display.
 * Bare `/` tokens are removed. Section headers are unaffected in practice
 * (they do not use `/` beat markers).
 */
export function stripLyricBeatMarkersFromLine(line) {
  const raw = String(line == null ? '' : line);
  if (!raw) return '';
  if (raw.indexOf('/') < 0) return raw;
  const leading = raw.match(/^\s*/)[0];
  const trailing = raw.match(/\s*$/)[0];
  const body = raw.slice(leading.length, raw.length - trailing.length);
  if (!body) return raw;
  const words = body.split(/\s+/).map(stripLyricBeatMarkerFromWord).filter(function(word) {
    return word.length > 0;
  });
  return leading + words.join(' ') + trailing;
}

export function stripLyricBeatMarkersFromLines(lines) {
  return (Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/)).map(stripLyricBeatMarkersFromLine);
}

/** Strip beat markers from ChordPro `{ chord, text }` token rows. */
export function stripLyricBeatMarkersFromTokenLines(tokenLines) {
  return (Array.isArray(tokenLines) ? tokenLines : []).map(function(tokens) {
    if (!Array.isArray(tokens)) return tokens;
    return tokens.map(function(token) {
      if (!token || typeof token !== 'object') return token;
      return Object.assign({}, token, {
        text: stripLyricBeatMarkersFromLine(token.text == null ? '' : token.text),
      });
    }).filter(function(token) {
      // Drop tokens that were only a bare `/` and carry no chord.
      const text = token && token.text != null ? String(token.text) : '';
      const chord = token && token.chord != null ? String(token.chord) : '';
      return text.trim().length > 0 || chord.trim().length > 0;
    });
  });
}
