import { splitIntoBlocks, coalesceSectionHeaderBlocks, normalizeLyricBlocks, isSectionHeader } from './chordSheetUtils';

/**
 * Join ABC note lines for bar/block parsing. Visual line breaks are layout
 * only and must not create extra musical units.
 */
export function flattenMelodyText(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(Boolean)
    .join(' ');
}

/**
 * Split flattened melody into sections at double barlines or strain markers (||, ::).
 */
export function splitMelodyIntoBlocks(noteLines) {
  const flat = flattenMelodyText(noteLines);
  if (!flat) return [];
  // || and :: are explicit strain breaks; |: also starts a new strain in
  // hymns that open the chorus with a repeat mark instead of a double bar.
  // Do not split on :| alone — first endings use it mid-strain.
  return flat.split(/\|\||::|\|:/)
    .map(function(part) { return part.trim(); })
    .filter(Boolean);
}

/**
 * Bars from one melody fragment (pipe-delimited). Newlines are already flattened.
 */
export function extractBarsFromMelodyText(text) {
  const bars = [];
  const segments = String(text || '').split('|');
  segments.forEach(function(segment, index) {
    const trimmed = segment.trim();
    if (!trimmed) return;
    if (index === segments.length - 1 && !/[A-Ga-gzZ\^_\=\d",]/.test(trimmed)) return;
    bars.push(trimmed);
  });
  return bars;
}

export function countBarsOnNotationLine(noteLine) {
  return extractBarsFromMelodyText(noteLine).length;
}

/**
 * Global bar index range for each ABC notation line (visual staff line).
 */
export function buildNotationLineBarMap(noteLines) {
  let globalBar = 0;
  return (Array.isArray(noteLines) ? noteLines : []).map(function(noteLine, lineIndex) {
    const barCount = countBarsOnNotationLine(noteLine);
    const startBar = globalBar;
    globalBar += barCount;
    return {
      lineIndex: lineIndex,
      startBar: startBar,
      endBar: globalBar - 1,
      barCount: barCount,
    };
  });
}

export function splitLyricBlocks(lyricLines) {
  return normalizeLyricBlocks(lyricLines).map(function(lines) {
    let header = null;
    let body = lines;
    if (lines.length > 0 && isSectionHeader(lines[0])) {
      header = lines[0];
      body = lines.slice(1);
    }
    const singable = body.filter(function(line) { return String(line).trim().length > 0; });
    return { header: header, lines: singable, allLines: lines };
  });
}

/**
 * Evenly assign singable lyric lines to a block's bar count.
 */
export function assignLyricLinesToBars(singableLines, barCount, barsPerLyricLine) {
  const lines = Array.isArray(singableLines) ? singableLines : [];
  const n = lines.length;
  if (n === 0 || barCount <= 0) return [];

  const barsPerLine = (barsPerLyricLine !== null && barsPerLyricLine !== undefined && barsPerLyricLine > 0)
    ? barsPerLyricLine
    : (barCount / n);

  return lines.map(function(text, lineIndex) {
    const startBar = Math.min(barCount - 1, Math.floor(lineIndex * barsPerLine));
    const endBar = Math.min(barCount - 1, Math.floor((lineIndex + 1) * barsPerLine) - 1);
    return {
      text: text,
      lineIndex: lineIndex,
      startBar: startBar,
      endBar: Math.max(startBar, endBar),
    };
  });
}

/**
 * Map a lyric word index onto a note-slot index within the target line.
 * The result is clamped into the available note range.
 */
export function wordIndexToNoteIndex(wordIndex, wordCount, noteCount) {
  const words = Math.max(0, parseInt(wordCount, 10) || 0);
  const notes = Math.max(0, parseInt(noteCount, 10) || 0);
  if (words === 0 || notes === 0) return 0;

  const index = Math.max(0, parseInt(wordIndex, 10) || 0);
  const ratio = notes / words;
  return Math.max(0, Math.min(notes - 1, Math.round(index * ratio)));
}

const BARS_PER_LINE_CANDIDATES = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Bar indices where the chord symbol changes (from a chord-bar grid).
 */
export function chordChangeBarIndices(chordBars) {
  const changes = [];
  let lastChord = null;
  (Array.isArray(chordBars) ? chordBars : []).forEach(function(barChords, index) {
    const chord = barChords && barChords.length > 0 ? barChords[0] : lastChord;
    if (chord && chord !== lastChord) {
      changes.push(index);
      lastChord = chord;
    } else if (chord) {
      lastChord = chord;
    }
  });
  return changes;
}

/**
 * Pick bars-per-lyric-line ratio by aligning chord changes to lyric line starts.
 * Supports 1, 2, 4, 8 lines per bar and 1/2, 1/4, 1/8 of a line per bar.
 */
export function detectBarsPerLyricLine(lineCount, barCount, chordChangeBars) {
  if (lineCount <= 0 || barCount <= 0) return 1;
  const natural = barCount / lineCount;
  const changes = Array.isArray(chordChangeBars) ? chordChangeBars : [];

  let candidates = BARS_PER_LINE_CANDIDATES.filter(function(c) {
    return c >= natural / 8 && c <= natural * 8;
  });
  if (candidates.indexOf(natural) === -1) candidates.push(natural);
  candidates = candidates.sort(function(a, b) { return a - b; });

  let best = natural;
  let bestScore = -Infinity;
  const dummyLines = new Array(lineCount).fill('x');

  candidates.forEach(function(barsPerLine) {
    const assignments = assignLyricLinesToBars(dummyLines, barCount, barsPerLine);
    let score = 0;
    const lastEnd = assignments.length > 0 ? assignments[assignments.length - 1].endBar : -1;
    if (lastEnd < barCount - 1) {
      score -= 20 * (barCount - 1 - lastEnd);
    }
    // Prefer layouts where each lyric line owns a distinct bar range. Oversized
    // bars-per-line (eg. 4 bars/line for 8 bars and 4 lines) collapses trailing
    // lines onto the final bar and can falsely score mid-phrase chord changes
    // as "line starts".
    const rangeKeys = {};
    let collapsedLines = 0;
    assignments.forEach(function(a) {
      const key = a.startBar + ':' + a.endBar;
      if (rangeKeys[key]) collapsedLines += 1;
      else rangeKeys[key] = true;
      if (a.endBar < a.startBar) collapsedLines += 1;
    });
    if (collapsedLines > 0) {
      score -= 25 * collapsedLines;
    }
    if (Object.keys(rangeKeys).length < lineCount) {
      score -= 15 * (lineCount - Object.keys(rangeKeys).length);
    }
    changes.forEach(function(changeBar) {
      let bestLineScore = -Infinity;
      assignments.forEach(function(a) {
        let lineScore = 0;
        if (changeBar === a.startBar) lineScore = 12;
        else if (changeBar > a.startBar && changeBar <= a.endBar) lineScore = 4;
        else lineScore = -Math.min(6, Math.abs(changeBar - a.startBar));
        if (lineScore > bestLineScore) bestLineScore = lineScore;
      });
      score += bestLineScore;
    });
    if (changes.length === 0) {
      score -= Math.abs(Math.log2((barsPerLine + 0.01) / (natural + 0.01)));
    } else {
      score -= Math.abs(Math.log2((barsPerLine + 0.01) / (natural + 0.01))) * 0.35;
    }
    if (score > bestScore) {
      bestScore = score;
      best = barsPerLine;
    }
  });
  return best;
}

export function assignLyricLinesToBarsForChart(singableLines, barCount, chordBars) {
  const lines = Array.isArray(singableLines) ? singableLines : [];
  const barsPerLine = detectBarsPerLyricLine(lines.length, barCount, chordChangeBarIndices(chordBars));
  return {
    barsPerLyricLine: barsPerLine,
    assignments: assignLyricLinesToBars(lines, barCount, barsPerLine),
  };
}

/**
 * Map each singable lyric line to a global bar range using melody blocks matched
 * to lyric blocks. One lyric block sung over several melodic strains uses all
 * bars in those strains (hymn / through-composed pattern).
 */
export function lyricAssignmentsForMelody(noteLines, lyricLines, chordBlocksByMelodyBlock) {
  const melodyBlocks = splitMelodyIntoBlocks(noteLines);
  const lyricBlocks = splitLyricBlocks(lyricLines);
  if (melodyBlocks.length === 0 || lyricBlocks.length === 0) return [];

  const singleLyricOverManyStrains = lyricBlocks.length === 1 && melodyBlocks.length > 1;
  const assignments = [];
  let blockStartBar = 0;

  function pushAssignments(lineAssignments) {
    lineAssignments.forEach(function(a) {
      assignments.push({
        text: a.text,
        startBar: blockStartBar + a.startBar,
        endBar: blockStartBar + a.endBar,
      });
    });
  }

  function assignBlock(lyricBlockLines, melodyBlockText, chordChart) {
    const barCount = extractBarsFromMelodyText(melodyBlockText).length;
    if (barCount <= 0) return;
    let lineAssignments;
    if (chordChart) {
      const bars = extractBarsFromMelodyChordChart(chordChart);
      lineAssignments = assignLyricLinesToBarsForChart(lyricBlockLines, barCount, bars).assignments;
    } else {
      lineAssignments = assignLyricLinesToBars(lyricBlockLines, barCount);
    }
    pushAssignments(lineAssignments);
    blockStartBar += barCount;
  }

  if (singleLyricOverManyStrains) {
    const combinedMelody = melodyBlocks.join(' ');
    const combinedChart = Array.isArray(chordBlocksByMelodyBlock)
      ? chordBlocksByMelodyBlock.join('\n\n')
      : null;
    assignBlock(lyricBlocks[0].lines, combinedMelody, combinedChart);
    return assignments;
  }

  const blockCount = Math.max(melodyBlocks.length, lyricBlocks.length);
  for (let bi = 0; bi < blockCount; bi += 1) {
    const melodyBlock = melodyBlocks[bi] || melodyBlocks[melodyBlocks.length - 1] || '';
    const lyricBlock = lyricBlocks[bi] || lyricBlocks[lyricBlocks.length - 1];
    const chart = Array.isArray(chordBlocksByMelodyBlock) ? chordBlocksByMelodyBlock[bi] : null;
    assignBlock(lyricBlock ? lyricBlock.lines : [], melodyBlock, chart);
  }
  return assignments;
}

function extractBarsFromMelodyChordChart(chordChart) {
  if (!chordChart) return [];
  const bars = [];
  String(chordChart).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    line.split('|').forEach(function(segment, index, segments) {
      const trimmed = segment.trim();
      if (!trimmed) return;
      if (index === segments.length - 1 && trimmed === '') return;
      const chords = trimmed.split(/\s+/).filter(Boolean);
      bars.push(chords);
    });
  });
  return bars;
}

export function lyricTextForBarRange(assignments, startBar, endBar) {
  const parts = [];
  (assignments || []).forEach(function(a) {
    if (a.endBar < startBar || a.startBar > endBar) return;
    if (a.text && String(a.text).trim()) parts.push(String(a.text).trim());
  });
  return parts.join(' ');
}

export function totalMelodyBarCount(noteLines) {
  return splitMelodyIntoBlocks(noteLines).reduce(function(sum, block) {
    return sum + extractBarsFromMelodyText(block).length;
  }, 0);
}

/**
 * Estimate note count for a global bar index range across ABC notation lines.
 */
export function countNotesInBarRange(noteLines, startBar, endBar, countNotesOnLine) {
  const barMap = buildNotationLineBarMap(noteLines);
  let total = 0;
  barMap.forEach(function(range, lineIndex) {
    if (range.barCount <= 0 || range.endBar < startBar || range.startBar > endBar) return;
    const lineNoteCount = countNotesOnLine(noteLines[lineIndex]);
    const overlapStart = Math.max(startBar, range.startBar);
    const overlapEnd = Math.min(endBar, range.endBar);
    const overlapBars = overlapEnd - overlapStart + 1;
    total += Math.round((lineNoteCount * overlapBars) / range.barCount);
  });
  return Math.max(0, total);
}
