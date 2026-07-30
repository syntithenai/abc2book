import { flattenMelodyText } from '../lyricBarAlignmentUtils';
import { countVoiceBars } from '../scratchpadNotationMerge';

const STRAIN_MARKER_RE = /\|\||::|\|:/g;

/**
 * Global bar indices (1-based) where strain markers appear in flattened melody.
 */
export function strainBoundaryBars(noteLines) {
  const flat = flattenMelodyText(noteLines);
  const boundaries = [];
  if (!flat) return boundaries;

  let barIndex = 1;
  let searchFrom = 0;
  let match;
  STRAIN_MARKER_RE.lastIndex = 0;
  while ((match = STRAIN_MARKER_RE.exec(flat)) !== null) {
    const before = flat.slice(0, match.index);
    const barsBefore = (before.match(/\|/g) || []).length;
    const atBar = Math.max(1, barsBefore + 1);
    boundaries.push({
      barIndex: atBar,
      marker: match[0],
      position: match.index,
    });
    barIndex = atBar;
    searchFrom = match.index + match[0].length;
    STRAIN_MARKER_RE.lastIndex = searchFrom;
  }
  return boundaries;
}

function rangeOverlapsBar(fromBar, toBar, barIndex) {
  const end = toBar == null ? fromBar : toBar;
  return barIndex >= fromBar && barIndex <= end;
}

/**
 * Warn when a paste/replace/merge range crosses or removes a strain boundary.
 */
export function pasteStrainBoundaryWarnings(targetNotes, fromBar, toBar, mode) {
  const warnings = [];
  const noteLines = Array.isArray(targetNotes) ? targetNotes : [];
  const boundaries = strainBoundaryBars(noteLines);
  if (!boundaries.length) return warnings;

  const endBar = toBar == null ? fromBar : toBar;
  const totalBars = countVoiceBars(noteLines, {});

  boundaries.forEach(function(boundary) {
    const bar = boundary.barIndex;
    if (mode === 'insert' && bar >= fromBar) {
      warnings.push({
        code: 'paste_shifts_strain_boundary',
        message: 'Insert at bar ' + fromBar + ' will shift strain marker (' + boundary.marker + ') at bar ' + bar,
        severity: 'warning',
        barIndex: bar,
      });
      return;
    }
    if (mode === 'replace' && rangeOverlapsBar(fromBar, endBar, bar)) {
      warnings.push({
        code: 'paste_removes_strain_boundary',
        message: 'Replace bars ' + fromBar + '–' + endBar + ' includes strain marker (' + boundary.marker + ') at bar ' + bar,
        severity: 'warning',
        barIndex: bar,
      });
      return;
    }
    if (mode === 'merge' && rangeOverlapsBar(fromBar, endBar, bar)) {
      warnings.push({
        code: 'paste_merges_strain_boundary',
        message: 'Merge at bar ' + fromBar + ' may alter strain marker (' + boundary.marker + ') at bar ' + bar,
        severity: 'info',
        barIndex: bar,
      });
    }
  });

  if (mode === 'replace' && endBar >= totalBars && boundaries.some(function(b) { return b.barIndex === totalBars; })) {
    warnings.push({
      code: 'paste_truncates_strain_tail',
      message: 'Replace through bar ' + endBar + ' may remove melody after the last strain marker',
      severity: 'warning',
    });
  }

  const seen = {};
  return warnings.filter(function(item) {
    const key = item.code + ':' + (item.barIndex || '') + ':' + item.message;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}
