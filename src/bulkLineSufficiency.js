/**
 * Sufficiency checks for bulk title-list Import gating.
 */
import { parseBulkLine } from './bulkListFormat'

export function parseBulkTextRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function(line) { return parseBulkLine(line); })
    .filter(function(row) { return row && (row.title || row.link); });
}

/**
 * A row is sufficient when it has a title and either an artist or a link.
 */
export function isBulkRowSufficient(row) {
  if (!row) return false;
  const title = String(row.title || '').trim();
  const artist = String(row.artist || '').trim();
  const link = String(row.link || '').trim();
  if (!title) return false;
  return !!(artist || link);
}

function describeInsufficientRow(row, index) {
  const title = String(row.title || '').trim();
  const artist = String(row.artist || '').trim();
  const link = String(row.link || '').trim();
  const missing = [];
  if (!title) missing.push('title');
  if (!artist && !link) missing.push('artist or YouTube link');
  const preview = title
    ? (artist ? (title + ' by ' + artist) : title)
    : (link ? link : '(empty)');
  return {
    index: index,
    lineNumber: index + 1,
    title: title,
    artist: artist,
    link: link,
    missing: missing,
    preview: preview,
    detail: missing.length
      ? ('Line ' + (index + 1) + ': ' + preview + ' — needs ' + missing.join(' and '))
      : ('Line ' + (index + 1) + ': ' + preview),
  };
}

export function assessBulkTextSufficiency(text) {
  const rows = parseBulkTextRows(text);
  const insufficient = [];
  rows.forEach(function(row, index) {
    if (!isBulkRowSufficient(row)) {
      insufficient.push(describeInsufficientRow(row, index));
    }
  });
  return {
    rows: rows,
    rowCount: rows.length,
    sufficient: rows.length > 0 && insufficient.length === 0,
    insufficient: insufficient,
  };
}

export function bulkImportDisabledReason(assessment) {
  if (!assessment || assessment.rowCount === 0) {
    return 'Add at least one line with a title.';
  }
  if (assessment.sufficient) return '';
  const n = assessment.insufficient.length;
  return n === 1
    ? 'Add an artist or YouTube link on each line, or run Prepare.'
    : (n + ' lines need an artist or YouTube link — add them or run Prepare.');
}

export function insufficientBulkLineDetails(assessment) {
  if (!assessment || !Array.isArray(assessment.insufficient)) return [];
  return assessment.insufficient.map(function(row) {
    return row.detail || ('Line ' + row.lineNumber);
  });
}
