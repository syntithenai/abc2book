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

export function alignLyricLineLists(existingLines, transcribedLines) {
  const existing = Array.isArray(existingLines) ? existingLines : [];
  const transcribed = Array.isArray(transcribedLines) ? transcribedLines : [];
  return buildLyricsLineDiff(existing.join('\n'), transcribed.join('\n'));
}

export function buildAlignedLyricRows(existingLines, transcribedLines) {
  const diffRows = alignLyricLineLists(existingLines, transcribedLines);
  const defaultChoices = buildDefaultLyricsMergeChoices(diffRows);
  return diffRows.map(function(row) {
    return Object.assign({}, row, {
      choice: defaultChoices[row.id] || row.defaultChoice,
    });
  });
}
