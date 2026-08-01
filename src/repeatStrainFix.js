import { normalizeChordChartRepeatMarks } from './chordSheetUtils';
import { flattenMelodyText } from './lyricBarAlignmentUtils';

/** End-repeat, zero or more empty bars, then start-repeat (e.g. :| |:, :| | |:). */
const EMPTY_BARS_BETWEEN_REPEATS_RE = /:\|(?:\s*\|)*\s*\|:/g;
/** Strain boundary: || then empty bars then |: (common in Session imports). */
const EMPTY_BARS_BETWEEN_STRAIN_REPEATS_RE = /\|\|(?:\s*\|)+\s*\|:/g;

export function hasEmptyBarsBetweenRepeatMarks(flat) {
  EMPTY_BARS_BETWEEN_REPEATS_RE.lastIndex = 0;
  EMPTY_BARS_BETWEEN_STRAIN_REPEATS_RE.lastIndex = 0;
  return EMPTY_BARS_BETWEEN_REPEATS_RE.test(String(flat || ''))
    || EMPTY_BARS_BETWEEN_STRAIN_REPEATS_RE.test(String(flat || ''));
}

export function hasOpenRepeatBeforeDoubleBar(flat) {
  let depth = 0;
  const re = /\|:|:\||::|\|\|/g;
  let match;
  while ((match = re.exec(String(flat || ''))) !== null) {
    const token = match[0];
    if (token === '|:') depth += 1;
    else if (token === ':|' || token === '::') {
      if (depth > 0) depth -= 1;
    } else if (token === '||' && depth > 0) return true;
  }
  return false;
}

function collapseEmptyRepeatBarsOnLine(line) {
  return String(line || '')
    .replace(/:\|(?:\s*\|)*\s*\|:/g, '::')
    .replace(/\|\|(?:\s*\|)+\s*\|:/g, '|| |:');
}

function collapseEmptyBarsAcrossLineBreak(lines) {
  let changed = false;
  const next = lines.slice();
  for (let i = 0; i < next.length; i += 1) {
    const before = next[i];
    next[i] = collapseEmptyRepeatBarsOnLine(next[i]);
    if (next[i] !== before) changed = true;

    if (i < next.length - 1 && /\|\|\s*$/.test(next[i])) {
      const nextBefore = next[i + 1];
      const nextAfter = nextBefore.replace(/^\s*(?:\|\s*)+\|:/, '|:');
      if (nextAfter !== nextBefore) {
        next[i + 1] = nextAfter;
        changed = true;
      }
    }
  }
  return changed ? next : null;
}

function insertRepeatEndsBeforeDoubleBarOnLines(lines) {
  let depth = 0;
  let changed = false;
  const next = lines.map(function(line) {
    let out = '';
    const source = String(line || '');
    const re = /\|:|:\||::|\|\|/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      out += source.slice(lastIndex, match.index);
      const token = match[0];
      if (token === '|:') {
        depth += 1;
        out += token;
      } else if (token === ':|' || token === '::') {
        if (depth > 0) depth -= 1;
        out += token;
      } else if (token === '||') {
        if (depth > 0) {
          out += ':';
          depth -= 1;
          changed = true;
        }
        out += token;
      }
      lastIndex = re.lastIndex;
    }
    out += source.slice(lastIndex);
    return out;
  });
  return changed ? next : null;
}

function normalizeRepeatMarksOnLines(lines) {
  return lines.map(function(line) {
    return normalizeChordChartRepeatMarks(String(line || ''));
  });
}

export function collapseEmptyRepeatBarsOnLines(noteLines) {
  if (!Array.isArray(noteLines) || noteLines.length === 0) return null;
  const lines = noteLines.map(function(line) { return String(line || ''); });
  return collapseEmptyBarsAcrossLineBreak(lines);
}

/**
 * Session-style repeat fix: remove empty bars between strain markers, add :| before ||,
 * normalize repeat spacing. Preserves note line breaks.
 */
export function fixStrainRepeatEndsOnLines(noteLines) {
  if (!Array.isArray(noteLines) || noteLines.length === 0) return null;

  const lines = noteLines.map(function(line) { return String(line || ''); });
  let next = lines.slice();
  let changed = false;

  const collapsed = collapseEmptyBarsAcrossLineBreak(next);
  if (collapsed) {
    next = collapsed;
    changed = true;
  }

  const withEnds = insertRepeatEndsBeforeDoubleBarOnLines(next);
  if (withEnds) {
    next = withEnds;
    changed = true;
  }

  const normalized = normalizeRepeatMarksOnLines(next);
  if (normalized.some(function(line, index) { return line !== next[index]; })) {
    next = normalized;
    changed = true;
  }

  if (!changed) return null;
  if (next.join('\n') === lines.join('\n')) return null;
  return next;
}

export function canFixStrainRepeatEnds(noteLines) {
  if (!Array.isArray(noteLines) || noteLines.length === 0) return false;
  const flat = flattenMelodyText(noteLines);
  if (hasEmptyBarsBetweenRepeatMarks(flat) || hasOpenRepeatBeforeDoubleBar(flat)) return true;
  const normalized = normalizeRepeatMarksOnLines(noteLines);
  return normalized.some(function(line, index) {
    return line !== noteLines[index];
  });
}
