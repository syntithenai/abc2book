/**
 * Sufficiency checks for bulk title-list Import gating.
 */
import { parseBulkLine, formatBulkLine } from './bulkListFormat'

export function parseBulkTextRows(text) {
  return iterateBulkTextRows(text).map(function(entry) { return entry.row; });
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

export function isBulkRowMissingTitle(row) {
  if (!row) return false;
  return !String(row.title || '').trim();
}

export function isBulkRowMissingArtist(row) {
  if (!row) return false;
  return !String(row.artist || '').trim();
}

export function isBulkRowMissingLink(row) {
  if (!row) return false;
  return !String(row.link || '').trim();
}

export function rowReportLabel(row, lineNumber) {
  const title = String(row && row.title || '').trim();
  if (title) return title;
  const link = String(row && row.link || '').trim();
  if (link) {
    return link.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 48);
  }
  return 'Line ' + (lineNumber || '?');
}

export function formatReportLabelList(labels) {
  return (Array.isArray(labels) ? labels : []).map(function(entry) {
    if (entry && typeof entry === 'object' && entry.label != null) return String(entry.label);
    return String(entry || '');
  }).join(', ');
}

export function iterateBulkTextRows(text) {
  const entries = [];
  String(text || '').split(/\r?\n/).forEach(function(line, lineIndex) {
    const row = parseBulkLine(line);
    if (row && (row.title || row.link)) {
      entries.push({
        row: row,
        lineIndex: lineIndex,
        lineNumber: lineIndex + 1,
        label: rowReportLabel(row, lineIndex + 1),
      });
    }
  });
  return entries;
}

/**
 * Character range for selecting one line in bulk textarea text (0-based line index).
 */
export function getBulkTextLineSelectionRange(text, lineIndex) {
  const lines = String(text || '').split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  let start = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    start += lines[i].length + 1;
  }
  const end = start + lines[lineIndex].length;
  return { start: start, end: end, lineIndex: lineIndex, lineCount: lines.length };
}

/**
 * Scroll a textarea so the given 0-based line index is visible (centered when possible).
 */
export function scrollBulkTextareaToLine(textarea, lineIndex, lineCount) {
  if (!textarea || lineIndex < 0) return;
  const totalLines = Math.max(
    1,
    lineCount || String(textarea.value || '').split(/\r?\n/).length
  );
  let paddingTop = 0;
  let paddingBottom = 0;
  let lineHeight = NaN;
  let fontSize = 16;
  try {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' && textarea.nodeType === 1) {
      const style = window.getComputedStyle(textarea);
      paddingTop = parseFloat(style.paddingTop) || 0;
      paddingBottom = parseFloat(style.paddingBottom) || 0;
      lineHeight = parseFloat(style.lineHeight);
      fontSize = parseFloat(style.fontSize) || 16;
    }
  } catch (e) {
    // jsdom or non-DOM test doubles
  }
  const innerHeight = Math.max(0, textarea.clientHeight - paddingTop - paddingBottom);
  const scrollable = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
  if (scrollable <= 0) return;

  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    lineHeight = textarea.scrollHeight / totalLines;
  }
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    lineHeight = fontSize * 1.2;
  }

  const lineTop = lineIndex * lineHeight;
  const centerOffset = Math.max(0, (innerHeight - lineHeight) / 2);
  const nextScroll = Math.max(0, Math.min(lineTop - centerOffset, scrollable));
  textarea.scrollTop = nextScroll;
}

/**
 * Focus a bulk import textarea, select one line, and scroll it into view.
 */
export function focusBulkTextareaLine(textarea, text, lineIndex) {
  if (!textarea) return false;
  const range = getBulkTextLineSelectionRange(text, lineIndex);
  if (!range) return false;
  textarea.focus();
  textarea.setSelectionRange(range.start, range.end);
  scrollBulkTextareaToLine(textarea, range.lineIndex, range.lineCount);
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(function() {
      scrollBulkTextareaToLine(textarea, range.lineIndex, range.lineCount);
    });
  }
  return true;
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
  const entries = iterateBulkTextRows(text);
  const insufficient = [];
  const missingTitleEntries = [];
  const missingArtistEntries = [];
  const missingLinkEntries = [];
  const unimportableEntries = [];
  let importableCount = 0;

  entries.forEach(function(entry) {
    const row = entry.row;
    if (isBulkRowMissingTitle(row)) missingTitleEntries.push(entry);
    if (isBulkRowMissingArtist(row)) missingArtistEntries.push(entry);
    if (isBulkRowMissingLink(row)) missingLinkEntries.push(entry);
    if (isBulkRowSufficient(row)) {
      importableCount += 1;
    } else {
      insufficient.push(describeInsufficientRow(row, entry.lineIndex));
      unimportableEntries.push(entry);
    }
  });

  const unimportableCount = insufficient.length;

  return {
    rows: entries.map(function(entry) { return entry.row; }),
    rowCount: entries.length,
    missingTitleCount: missingTitleEntries.length,
    missingTitleEntries: missingTitleEntries,
    missingTitleLabels: missingTitleEntries.map(function(entry) { return entry.label; }),
    missingArtistCount: missingArtistEntries.length,
    missingArtistEntries: missingArtistEntries,
    missingArtistLabels: missingArtistEntries.map(function(entry) { return entry.label; }),
    missingLinkCount: missingLinkEntries.length,
    missingLinkEntries: missingLinkEntries,
    missingLinkLabels: missingLinkEntries.map(function(entry) { return entry.label; }),
    unimportableCount: unimportableCount,
    unimportableEntries: unimportableEntries,
    unimportableLabels: unimportableEntries.map(function(entry) { return entry.label; }),
    importableCount: importableCount,
    sufficient: entries.length > 0 && unimportableCount === 0,
    insufficient: insufficient,
  };
}

export function bulkImportDisabledReason(assessment) {
  if (!assessment || assessment.rowCount === 0) {
    return 'Add at least one line with a title.';
  }
  if (assessment.importableCount > 0) return '';
  return assessment.unimportableCount === 1
    ? '1 line cannot be imported — add a title and an artist or YouTube link.'
    : (assessment.unimportableCount + ' lines cannot be imported — add a title and an artist or YouTube link on each.');
}

export function insufficientBulkLineDetails(assessment) {
  if (!assessment || !Array.isArray(assessment.insufficient)) return [];
  return assessment.insufficient.map(function(row) {
    return row.detail || ('Line ' + row.lineNumber);
  });
}

/**
 * Keep only rows that can be imported (title plus artist or link).
 */
export function filterImportableBulkText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const kept = [];
  let skipped = 0;

  lines.forEach(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      kept.push(line);
      return;
    }
    const row = parseBulkLine(trimmed);
    if (row && isBulkRowSufficient(row)) {
      kept.push(formatBulkLine(row));
    } else {
      skipped += 1;
    }
  });

  return {
    text: kept.join('\n'),
    skipped: skipped,
  };
}
