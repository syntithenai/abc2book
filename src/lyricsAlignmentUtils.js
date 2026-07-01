import { buildLyricsLineDiff, buildDefaultLyricsMergeChoices } from './lyricsMergeUtils';

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9']/g, '');
}

function tokenMatchCost(a, b) {
  const left = normalizeToken(a);
  const right = normalizeToken(b);
  if (!left || !right) return 3;
  if (left === right) return 0;
  if (left.includes(right) || right.includes(left)) return 1;
  return 2;
}

export function alignTranscribedLineToExisting(existingLine, transcribedLine) {
  const existingTokens = String(existingLine || '').trim().split(/\s+/).filter(Boolean);
  const transcribedTokens = String(transcribedLine || '').trim().split(/\s+/).filter(Boolean);
  if (existingTokens.length === 0 || transcribedTokens.length === 0) {
    return { existingLine: existingLine || '', transcribedLine: transcribedLine || '', score: 3 };
  }
  let score = 0;
  const limit = Math.max(existingTokens.length, transcribedTokens.length);
  for (let index = 0; index < limit; index += 1) {
    score += tokenMatchCost(existingTokens[index] || '', transcribedTokens[index] || '');
  }
  return { existingLine, transcribedLine, score: score / limit };
}

function lineSimilarityScore(existingLine, importedLine) {
  const left = String(existingLine || '').trim();
  const right = String(importedLine || '').trim();
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  const alignment = alignTranscribedLineToExisting(left, right);
  return Math.max(0, 1 - alignment.score / 3);
}

function buildFuzzyLinePairs(existingLines, importedLines, matchThreshold) {
  const existing = Array.isArray(existingLines) ? existingLines : [];
  const imported = Array.isArray(importedLines) ? importedLines : [];
  const candidates = [];

  existing.forEach(function(existingLine, existingIndex) {
    imported.forEach(function(importedLine, importedIndex) {
      const score = lineSimilarityScore(existingLine, importedLine);
      if (score >= matchThreshold) {
        candidates.push({
          existingIndex: existingIndex,
          importedIndex: importedIndex,
          score: score,
        });
      }
    });
  });

  candidates.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.existingIndex - b.existingIndex;
  });

  const usedExisting = {};
  const usedImported = {};
  const pairs = [];

  candidates.forEach(function(candidate) {
    if (usedExisting[candidate.existingIndex] || usedImported[candidate.importedIndex]) {
      return;
    }
    usedExisting[candidate.existingIndex] = true;
    usedImported[candidate.importedIndex] = true;
    pairs.push(candidate);
  });

  pairs.sort(function(a, b) {
    return a.importedIndex - b.importedIndex;
  });

  return {
    pairs: pairs,
    usedExisting: usedExisting,
    usedImported: usedImported,
  };
}

export function buildFuzzyAlignedLyricRows(existingLines, importedLines, options) {
  const matchThreshold = options && typeof options.matchThreshold === 'number'
    ? options.matchThreshold
    : 0.45;
  const existing = Array.isArray(existingLines) ? existingLines : [];
  const imported = Array.isArray(importedLines) ? importedLines : [];
  const pairing = buildFuzzyLinePairs(existing, imported, matchThreshold);
  const rows = [];

  pairing.pairs.forEach(function(pair) {
    const existingLine = existing[pair.existingIndex] || '';
    const importedLine = imported[pair.importedIndex] || '';
    const same = String(existingLine).trim() === String(importedLine).trim();
    rows.push({
      id: rows.length,
      existing: existingLine,
      imported: importedLine,
      type: same ? 'same' : 'changed',
      defaultChoice: same ? 'existing' : 'transcribed',
      useExisting: same,
      existingIndex: pair.existingIndex,
      importedIndex: pair.importedIndex,
    });
  });

  imported.forEach(function(importedLine, importedIndex) {
    if (pairing.usedImported[importedIndex]) return;
    rows.push({
      id: rows.length,
      existing: '',
      imported: importedLine,
      type: 'added',
      defaultChoice: 'transcribed',
      useExisting: false,
      existingIndex: -1,
      importedIndex: importedIndex,
    });
  });

  existing.forEach(function(existingLine, existingIndex) {
    if (pairing.usedExisting[existingIndex]) return;
    rows.push({
      id: rows.length,
      existing: existingLine,
      imported: '',
      type: 'removed',
      defaultChoice: 'existing',
      useExisting: true,
      existingIndex: existingIndex,
      importedIndex: -1,
    });
  });

  rows.sort(function(a, b) {
    const aOrder = a.importedIndex >= 0 ? a.importedIndex : a.existingIndex + imported.length;
    const bOrder = b.importedIndex >= 0 ? b.importedIndex : b.existingIndex + imported.length;
    return aOrder - bOrder;
  });

  return rows.map(function(row, index) {
    return Object.assign({}, row, {
      id: index,
      transcribed: row.imported || '',
    });
  });
}

export function mergeFuzzyLyricRows(rows) {
  const lines = [];
  (Array.isArray(rows) ? rows : []).forEach(function(row) {
    if (row.deleted) return;
    if (row.type === 'same') {
      lines.push(row.existing || row.imported || '');
      return;
    }
    if (row.useExisting) {
      if (row.existing) lines.push(row.existing);
      return;
    }
    if (row.imported) lines.push(row.imported);
  });
  return lines;
}

export function lyricRowsHaveDiff(rows) {
  return (Array.isArray(rows) ? rows : []).some(function(row) {
    if (row.deleted) return true;
    if (row.type === 'same') return false;
    if (row.type === 'added' || row.type === 'removed') return true;
    return String(row.existing || '').trim() !== String(row.imported || '').trim()
      || !!row.useExisting !== (row.type === 'removed');
  });
}

export function alignLyricLineLists(existingLines, transcribedLines) {
  const existing = Array.isArray(existingLines) ? existingLines : [];
  const transcribed = Array.isArray(transcribedLines) ? transcribedLines : [];
  return buildLyricsLineDiff(existing.join('\n'), transcribed.join('\n'));
}

export function buildAlignedLyricRows(existingLines, transcribedLines, options) {
  const useFuzzy = !options || options.fuzzy !== false;
  if (useFuzzy) {
    return buildFuzzyAlignedLyricRows(existingLines, transcribedLines, options);
  }
  const diffRows = alignLyricLineLists(existingLines, transcribedLines);
  const defaultChoices = buildDefaultLyricsMergeChoices(diffRows);
  return diffRows.map(function(row) {
    return Object.assign({}, row, {
      choice: defaultChoices[row.id] || row.defaultChoice,
    });
  });
}
