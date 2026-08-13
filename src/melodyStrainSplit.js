/**
 * Canonical melody strain splitting — single rule set for barline / repeat boundaries.
 * Visual ABC line breaks are flattened before splitting.
 */
import {
  flattenMelodyText,
  extractBarsFromMelodyText,
} from './lyricBarAlignmentUtils';

function noteLinesForMerge(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean);
}

/**
 * True when text after a :| begins a volta second (or later) ending, so the
 * repeat close is mid-strain rather than a section boundary.
 */
export function isVoltaContinuationAfterRepeatEnd(ahead) {
  const t = String(ahead || '').replace(/^\s+/, '');
  if (!t) return false;
  // [2, [2., [1.2, [2,3
  if (/^\[\d/.test(t)) return true;
  // Short ABC volta: 2. or 2,
  if (/^\d+\s*[.,]/.test(t)) return true;
  return false;
}

/**
 * Separator when rejoining adjacent strains. Section-ending :| stays in the
 * previous strain text, so do not insert || after it.
 */
export function strainJoinSeparator(prevStrain, nextStrain) {
  if (nextStrain && nextStrain.startBarline === '|:') return ' |: ';
  if (prevStrain && prevStrain.endBarline === ':|') return ' ';
  return ' || ';
}

/**
 * Split flattened melody into strain objects preserving barline markers.
 * Section-ending :| (without a following volta) is a strain boundary; first
 * endings that use :| mid-strain are not.
 * @returns {{ text: string, startBarline: string|null, endBarline: string|null }[]}
 */
export function splitMelodyStrainsWithBarlines(noteLines) {
  const flat = flattenMelodyText(noteLinesForMerge(noteLines));
  if (!flat) return [];
  const re = /(\|\||::|\|:|:\|)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let pendingStart = null;
  while ((match = re.exec(flat)) !== null) {
    const token = match[1];
    if (token === ':|') {
      if (isVoltaContinuationAfterRepeatEnd(flat.slice(match.index + token.length))) {
        // Leave :| in the strain body; first/second endings stay one strain.
        continue;
      }
      // Keep :| in the strain text so merge/rejoin preserves the repeat.
      const before = flat.slice(lastIndex, match.index + token.length).trim();
      if (before) {
        parts.push({
          text: before,
          startBarline: pendingStart,
          endBarline: ':|',
        });
        pendingStart = null;
      }
      lastIndex = match.index + token.length;
      continue;
    }
    const before = flat.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push({
        text: before,
        startBarline: pendingStart,
        endBarline: token,
      });
      pendingStart = token === '|:' ? '|:' : null;
    } else if (token === '|:') {
      pendingStart = '|:';
    }
    lastIndex = match.index + token.length;
  }
  const tail = flat.slice(lastIndex).trim();
  if (tail) {
    parts.push({
      text: tail,
      startBarline: pendingStart,
      endBarline: null,
    });
  }
  if (parts.length === 0 && flat.trim()) {
    parts.push({ text: flat.trim(), startBarline: null, endBarline: null });
  }
  return parts;
}

/**
 * Split ABC note lines into strains preserving per-line structure for notation alignment.
 */
export function splitMelodyNoteLinesByStrain(noteLines) {
  const strains = [];
  let current = [];
  const lines = Array.isArray(noteLines) ? noteLines : [];
  lines.forEach(function(noteLine, index) {
    const text = String(noteLine || '');
    const nextText = index + 1 < lines.length ? String(lines[index + 1] || '') : '';
    current.push(text);
    const closesSectionRepeat = /:\|\s*$/.test(text.trim())
      && !isVoltaContinuationAfterRepeatEnd(nextText);
    if (/\|\||::|\|:/.test(text) || closesSectionRepeat) {
      strains.push(current);
      current = [];
    }
  });
  if (current.length) strains.push(current);
  return strains;
}

/**
 * Full harmonic bar count for a strain text, preferring display-chart bar count when
 * the opening anacrusis/pickup bar was omitted from renderChords output.
 */
export function countFullBarsInMelodyStrain(strainText, displayBarCount) {
  const melodyBars = extractBarsFromMelodyText(strainText).length;
  const display = Math.max(0, Number(displayBarCount) || 0);
  if (display > 0 && display < melodyBars) return display;
  return melodyBars;
}
