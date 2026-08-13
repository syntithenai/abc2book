/**
 * Normalize melody barlines for parsing/rendering.
 * Pickup || right after |: or :: (no prior | in segment) is a single barline.
 */

export function normalizeMelodyBarlines(text) {
  return String(text || '')
    .replace(/\|:([^|]*?)\|\|/g, '|:$1|')
    .replace(/::([^|]*?)\|\|/g, '::$1|')
    .replace(/:\|\s+\|:/g, '::');
}

/** @deprecated use normalizeMelodyBarlines */
export function collapseAnacrusisDoubleBarlines(flat) {
  return normalizeMelodyBarlines(flat);
}

function isAbcMusicLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('%%')) return false;
  if (trimmed.startsWith('%')) return false;
  if (trimmed.length > 1 && trimmed.charAt(1) === ':' && trimmed.charAt(0) !== '|') return false;
  return true;
}

const BARLINE_END_RE = /(?:\|\]|\[\||\|\||::|:\||\|:|\|)\s*$/;
const BARLINE_START_RE = /^(?:\|\]|\[\||\|\||::|:\||\|:|\|)/;
const TRAILING_INLINE_FIELD_RE = /\[[A-Za-z]:[^\]]*\]\s*$/;

export function musicLineEndsWithBarline(line) {
  return BARLINE_END_RE.test(String(line || '').trim());
}

export function musicLineStartsWithBarline(line) {
  return BARLINE_START_RE.test(String(line || '').trim());
}

function musicLineEndsWithInlineField(line) {
  return TRAILING_INLINE_FIELD_RE.test(String(line || '').trim());
}

/**
 * Insert a trailing | when a music line is followed by another music line and
 * neither side has an explicit barline at the join. Visual ABC wraps almost
 * always fall on bar boundaries; omitting the final | is common and otherwise
 * merges the last bar of one line into the first of the next (lost chorus bars).
 * Do not insert after trailing [M:]/[K:]/[Q:] — those belong with the next strain.
 */
export function ensureBarlinesAtMusicLineJoins(noteLines) {
  const lines = (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);
  return lines.map(function(line, index) {
    if (index >= lines.length - 1) return line;
    const next = lines[index + 1];
    if (!isAbcMusicLine(line) || !isAbcMusicLine(next)) return line;
    if (musicLineEndsWithBarline(line) || musicLineStartsWithBarline(next)) return line;
    if (musicLineEndsWithInlineField(line)) return line;
    return line + '|';
  });
}

/**
 * Trim voice note lines and drop blanks.
 * ABC treats a blank line as end-of-tune, which truncates chords/notes in abcjs.
 */
export function normalizeVoiceNoteLines(textOrLines) {
  const lines = Array.isArray(textOrLines)
    ? textOrLines
    : String(textOrLines || '').split('\n');
  const out = [];
  for (var i = 0; i < lines.length; i++) {
    const trimmed = String(lines[i] || '').trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

export function normalizeVoiceNotesText(textOrLines) {
  return normalizeVoiceNoteLines(textOrLines).join('\n');
}

/**
 * Apply pickup barline normalization to music lines in a full ABC document.
 * Also trims lines and drops blanks so abcjs does not end the tune early.
 * Inserts missing | between consecutive music lines so a wrap without a
 * trailing barline does not merge bars.
 */
export function normalizeAbcTextForAbcjs(abcText) {
  const prepared = String(abcText || '').split('\n').map(function(line) {
    return String(line || '').trim();
  }).filter(Boolean);
  const withJoins = ensureBarlinesAtMusicLineJoins(prepared);
  return withJoins.map(function(line) {
    if (!isAbcMusicLine(line)) return line;
    return normalizeMelodyBarlines(line);
  }).join('\n');
}

/**
 * Alias for render/parse entry points (abcjs, synth, editor display).
 */
export function abcForAbcjs(abcText) {
  return normalizeAbcTextForAbcjs(abcText);
}

export function melodyHasAnacrusisDoubleBarlines(noteLines) {
  const lines = Array.isArray(noteLines) ? noteLines : [noteLines];
  return lines.some(function(line) {
    const raw = String(line || '');
    return raw !== normalizeMelodyBarlines(raw);
  });
}

/**
 * True when a || segment is a single bar (no internal |), after stripping
 * leading/trailing repeat marks. Used to spot historic every-bar || imports.
 */
function isSingleBarDoubleBarSegment(part) {
  const cleaned = String(part || '')
    .replace(/^\s*(\|:|::|:\|)+/, '')
    .replace(/(:\||:\|:)\s*$/, '')
    .trim();
  if (!cleaned) return false;
  const barChunks = cleaned.split('|').map(function(chunk) {
    return String(chunk || '').trim();
  }).filter(Boolean);
  return barChunks.length <= 1;
}

/**
 * Historic chord-merge bug: || used between consecutive bars inside a section
 * (e.g. `"D"zzzzzzzz||"G"zzzzzzzz||"A"zzzzzzzz||`) instead of only at section ends.
 * That splits notation-based chord charts into one-bar blocks.
 */
export function melodyLineHasMidBlockDoubleBarlines(line) {
  const text = normalizeMelodyBarlines(line);
  if (text.indexOf('||') < 0) return false;
  const parts = text.split(/\|\|/).map(function(part) {
    return String(part || '').trim();
  }).filter(Boolean);
  if (parts.length < 2) return false;
  const singleBarParts = parts.filter(isSingleBarDoubleBarSegment);
  return singleBarParts.length >= 2 && singleBarParts.length === parts.length;
}

export function melodyHasMidBlockDoubleBarlines(noteLines) {
  const lines = Array.isArray(noteLines) ? noteLines : [noteLines];
  return lines.some(function(line) {
    return melodyLineHasMidBlockDoubleBarlines(line);
  });
}
