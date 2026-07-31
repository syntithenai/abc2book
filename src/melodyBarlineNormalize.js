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

/**
 * Apply pickup barline normalization to music lines in a full ABC document.
 */
export function normalizeAbcTextForAbcjs(abcText) {
  return String(abcText || '').split('\n').map(function(line) {
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
