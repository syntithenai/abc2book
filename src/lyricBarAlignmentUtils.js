import { splitIntoBlocks, coalesceSectionHeaderBlocks, normalizeLyricBlocks, isSectionHeader } from './chordSheetUtils';
import {
  collapseAnacrusisDoubleBarlines,
  normalizeMelodyBarlines,
  ensureBarlinesAtMusicLineJoins,
} from './melodyBarlineNormalize';
import { splitMelodyNoteLinesByStrain, splitMelodyStrainsWithBarlines } from './melodyStrainSplit';

export { collapseAnacrusisDoubleBarlines, normalizeMelodyBarlines } from './melodyBarlineNormalize';

/**
 * Join ABC note lines for bar/block parsing. Visual line breaks are treated as
 * bar boundaries when the previous line omits a trailing | (common ABC wrap).
 */
export function flattenMelodyText(noteLines) {
  const flat = ensureBarlinesAtMusicLineJoins(noteLines).join(' ');
  return normalizeMelodyBarlines(flat);
}

/**
 * Split flattened melody into sections at double barlines or strain markers
 * (||, ::, |:, and section-ending :| — not volta mid-strain :|).
 * @deprecated import from melodyStrainSplit for strain-aware APIs; kept for bar-count helpers.
 */
export function splitMelodyIntoBlocks(noteLines) {
  const lines = typeof noteLines === 'string' ? [noteLines] : noteLines;
  return splitMelodyStrainsWithBarlines(lines).map(function(strain) {
    return strain.text;
  });
}

/**
 * Bars from one melody fragment (pipe-delimited). Newlines are already flattened.
 */
export function extractBarsFromMelodyText(text) {
  const bars = [];
  const segments = normalizeMelodyBarlines(String(text || '')).split('|');
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
 * Pair non-blank lyric lines with non-empty chord/notation lines.
 * When there are at least as many chord lines as lyrics, map 1:1 and leave
 * leftover chord lines after the lyrics. Otherwise each chord line covers two
 * lyric lines (trailing odd lyric stays bare).
 */
export function allocateChordLinesToLyrics(lyricCount, chordLineCount) {
  const L = Math.max(0, Math.floor(Number(lyricCount) || 0));
  const C = Math.max(0, Math.floor(Number(chordLineCount) || 0));
  if (C >= L) {
    return {
      lyricsPerChordLine: 1,
      allocatedChordLines: L,
      extraChordLines: C - L,
      leftoverLyrics: 0,
    };
  }
  const allocated = Math.min(C, Math.floor(L / 2));
  return {
    lyricsPerChordLine: 2,
    allocatedChordLines: allocated,
    extraChordLines: C - allocated,
    leftoverLyrics: L - allocated * 2,
  };
}

/**
 * Drop %%MIDI and %Z:/%Q: style comment rows before notation alignment.
 */
export function filterNotationNoteLinesForAlignment(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : []).filter(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    if (/^%%MIDI\s/i.test(trimmed)) return false;
    if (/^%/.test(trimmed)) return false;
    return true;
  });
}

function notationLineHasRepeatMark(text) {
  const t = String(text || '');
  return /\|:/.test(t) || /:\|/.test(t);
}

/**
 * When every lyric in a block sits on one notation row and that row carries
 * repeat marks, the sung lines usually span two melodic passes (|: … :|).
 */
function effectiveRowBarCount(noteLine, rowBarCount, lyricsForRow, totalLyricCount) {
  if (lyricsForRow !== totalLyricCount || rowBarCount <= 0) return rowBarCount;
  if (notationLineHasRepeatMark(noteLine)) return rowBarCount * 2;
  return rowBarCount;
}

function melodyBlockHasRepeat(blockText) {
  const t = String(blockText || '');
  return (/\|:/.test(t) && /:\|/.test(t)) || /:\|\s*$/.test(t.trim());
}

/** True when lyric lines should cycle through a :| strain twice (2 bars per line). */
export function strainLyricsUseRepeatDoubling(strainNoteLines, lineCount) {
  const opening = splitMelodyIntoBlocks(flattenMelodyText(strainNoteLines))[0] || '';
  if (!melodyBlockHasRepeat(opening)) return false;
  const openingBars = extractBarsFromMelodyText(opening).length;
  return openingBars > 0 && lineCount > 0 && lineCount * 2 <= openingBars * 2;
}

function assignTwoBarsPerLyricLine(lines) {
  return lines.map(function(text, lineIndex) {
    return {
      text: text,
      lineIndex: lineIndex,
      startBar: lineIndex * 2,
      endBar: lineIndex * 2 + 1,
    };
  });
}

/**
 * Split long lyric blocks into verse-sized groups (blank lines, or chunks of 4).
 */
export function lyricStanzaGroups(lyricLines) {
  const groups = [];
  let current = [];
  (Array.isArray(lyricLines) ? lyricLines : []).forEach(function(line) {
    if (!String(line || '').trim()) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      return;
    }
    current.push(line);
  });
  if (current.length) groups.push(current);

  return groups;
}

const STANZA_BAR_WINDOW = 8;

/**
 * When one chart covers many verse-sized lyric groups, assign each group its own
 * bar window (eg. 8 bars / 4 lines) cycling through the chart.
 */
export function assignLyricLinesToBarsForStanzaGroups(lyricLines, bars, options) {
  const groups = lyricStanzaGroups(lyricLines);
  if (groups.length <= 1) return null;

  const opts = options || {};
  const assignments = [];
  let lineIndex = 0;
  groups.forEach(function(group, groupIndex) {
    const singable = group.map(function(line) { return String(line || '').trim(); })
      .filter(function(line) { return line.split(/\s+/).filter(Boolean).length > 0; });
    if (!singable.length) return;

    const offset = (groupIndex * STANZA_BAR_WINDOW) % Math.max(1, bars.length);
    const windowBars = [];
    for (let i = 0; i < STANZA_BAR_WINDOW; i += 1) {
      windowBars.push(bars[(offset + i) % bars.length]);
    }
    const chunk = assignLyricLinesToBarsForChart(singable, windowBars.length, windowBars, opts);
    chunk.assignments.forEach(function(assignment) {
      assignments.push({
        text: assignment.text,
        lineIndex: lineIndex + assignment.lineIndex,
        startBar: offset + assignment.startBar,
        endBar: offset + assignment.endBar,
      });
    });
    lineIndex += singable.length;
  });

  return assignments.length ? assignments : null;
}

function totalBarsInBarMap(barMap) {
  return (Array.isArray(barMap) ? barMap : []).reduce(function(sum, row) {
    return sum + row.barCount;
  }, 0);
}

function assignLyricLinesToBarsFromNotationOnRows(lines, noteLines, barMap) {
  if (!lines.length || !barMap.length) return null;

  if (lines.length === barMap.length) {
    return lines.map(function(text, lineIndex) {
      const row = barMap[lineIndex];
      return {
        text: text,
        lineIndex: lineIndex,
        startBar: row.startBar,
        endBar: row.endBar,
      };
    });
  }

  if (lines.length > barMap.length) {
    if (lines.length % barMap.length === 0) {
      const lyricsPerRow = lines.length / barMap.length;
      const assignments = [];
      let lyricIndex = 0;
      barMap.forEach(function(row, rowIndex) {
        const rowBars = effectiveRowBarCount(
          noteLines[row.lineIndex],
          row.barCount,
          lyricsPerRow,
          lines.length
        );
        const barsPerLyric = rowBars / lyricsPerRow;
        const repeats = rowBars > row.barCount;
        for (let j = 0; j < lyricsPerRow; j += 1) {
          const effStart = Math.floor(j * barsPerLyric);
          const effEnd = Math.floor((j + 1) * barsPerLyric) - 1;
          const startBar = repeats
            ? row.startBar + (effStart % row.barCount)
            : row.startBar + effStart;
          const endBar = repeats
            ? row.startBar + (effEnd % row.barCount)
            : row.startBar + effEnd;
          assignments.push({
            text: lines[lyricIndex],
            lineIndex: lyricIndex,
            startBar: startBar,
            endBar: Math.max(startBar, endBar),
          });
          lyricIndex += 1;
        }
      });
      if (assignments.length === lines.length) return assignments;
    }

    const assignments = [];
    let lyricIndex = 0;
    barMap.forEach(function(row, rowIndex) {
      const isLastRow = rowIndex === barMap.length - 1;
      const lyricsForRow = isLastRow ? (lines.length - lyricIndex) : 1;
      if (lyricsForRow <= 0) return;
      const rowBars = effectiveRowBarCount(
        noteLines[row.lineIndex],
        row.barCount,
        lyricsForRow,
        lines.length
      );
      const barsPerLyric = rowBars / lyricsForRow;
      const repeats = rowBars > row.barCount;
      for (let j = 0; j < lyricsForRow; j += 1) {
        const effStart = Math.floor(j * barsPerLyric);
        const effEnd = Math.floor((j + 1) * barsPerLyric) - 1;
        const startBar = repeats
          ? row.startBar + (effStart % row.barCount)
          : row.startBar + effStart;
        const endBar = repeats
          ? row.startBar + (effEnd % row.barCount)
          : row.startBar + effEnd;
        assignments.push({
          text: lines[lyricIndex],
          lineIndex: lyricIndex,
          startBar: startBar,
          endBar: Math.max(startBar, endBar),
        });
        lyricIndex += 1;
      }
    });
    return assignments.length === lines.length ? assignments : null;
  }

  if (lines.length < barMap.length) {
    const totalBars = totalBarsInBarMap(barMap);
    const twoBarsPerLine = lines.length * 2;
    if (twoBarsPerLine > 0 && twoBarsPerLine <= totalBars) {
      const natural = totalBars / lines.length;
      if (natural >= 2) {
        return assignTwoBarsPerLyricLine(lines);
      }
    }
  }

  return null;
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

/**
 * Split ABC note lines into strains using the same || / :: / |: breaks as
 * splitMelodyStrainsWithBarlines, preserving per-line structure for notation
 * alignment in lyrics.
 */
export { splitMelodyNoteLinesByStrain } from './melodyStrainSplit';

/**
 * When lyric lines align with ABC notation rows (one sung line per staff line),
 * map each lyric line to that row's bar span. Extra lyric lines beyond the
 * notation row count share the last row's bars evenly.
 */
export function assignLyricLinesToBarsFromNotation(singableLines, noteLines, options) {
  const opts = options || {};
  const lines = Array.isArray(singableLines) ? singableLines : [];
  const filtered = filterNotationNoteLinesForAlignment(noteLines);
  if (!lines.length || !filtered.length) return null;

  const fullBarMap = buildNotationLineBarMap(filtered);
  const strains = splitMelodyNoteLinesByStrain(filtered);

  if (strains.length > 1 && !opts.strainScopedNotation) {
    const openingLines = strains[0];
    const openingBarMap = buildNotationLineBarMap(openingLines);
    const openingBlock = splitMelodyIntoBlocks(openingLines)[0] || '';
    const openingBarCount = extractBarsFromMelodyText(openingBlock).length;
    const hasRepeat = melodyBlockHasRepeat(openingBlock);
    const repeatExpanded = hasRepeat ? openingBarCount * 2 : openingBarCount;

    if (lines.length * 2 <= openingBarCount && openingBarCount / lines.length > 2) {
      return assignTwoBarsPerLyricLine(lines);
    }

    if (hasRepeat && lines.length <= repeatExpanded && lines.length > openingBarMap.length) {
      const openingAssignment = assignLyricLinesToBarsFromNotationOnRows(
        lines,
        openingLines,
        openingBarMap
      );
      if (openingAssignment) return openingAssignment;
    }
  } else {
    const blocks = splitMelodyIntoBlocks(filtered);
    if (blocks.length > 1) {
      const firstBarCount = extractBarsFromMelodyText(blocks[0]).length;
      if (lines.length * 2 <= firstBarCount && firstBarCount / lines.length > 2) {
        return assignTwoBarsPerLyricLine(lines);
      }
    }
  }

  return assignLyricLinesToBarsFromNotationOnRows(lines, filtered, fullBarMap);
}

/**
 * Find the melody strain whose bar count matches a section chart block.
 */
export function notationNoteLinesForChart(noteLines, chartBarCount) {
  const count = Math.max(0, Number(chartBarCount) || 0);
  if (!count) return null;
  const filtered = filterNotationNoteLinesForAlignment(noteLines);
  if (!filtered.length) return null;
  const strains = splitMelodyNoteLinesByStrain(filtered);

  function strainBarTotal(strain) {
    return buildNotationLineBarMap(strain).reduce(function(sum, row) {
      return sum + row.barCount;
    }, 0);
  }

  for (let i = 0; i < strains.length; i++) {
    if (strainBarTotal(strains[i]) === count) return strains[i];
  }

  if (strains.length > 0) {
    const opening = strains[0];
    const openingBars = strainBarTotal(opening);
    if (count >= openingBars - 1 && count <= openingBars + 1) return opening;
    const totalStrainBars = strains.reduce(function(sum, strain) {
      return sum + strainBarTotal(strain);
    }, 0);
    if (count >= totalStrainBars - 1 || count > openingBars) return opening;
  }

  return filtered;
}

function sliceBarsFromNotationLine(noteLine, startBarInLine, endBarInLine) {
  const bars = extractBarsFromMelodyText(noteLine);
  if (!bars.length) return '';
  const start = Math.max(0, Math.min(startBarInLine, bars.length - 1));
  const end = Math.max(start, Math.min(endBarInLine, bars.length - 1));
  return bars.slice(start, end + 1).join('|');
}

/**
 * ABC note lines for one melody strain (double-barline split), for per-section
 * chord-to-lyric alignment when strains differ in bars-per-line ratio.
 */
export function notationNoteLinesForStrainIndex(noteLines, strainIndex) {
  const filtered = filterNotationNoteLinesForAlignment(noteLines);
  if (!filtered.length) return null;
  const strains = splitMelodyStrainsWithBarlines(filtered);
  const idx = Number(strainIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= strains.length) return null;

  const strainBarCounts = strains.map(function(strain) {
    return extractBarsFromMelodyText(strain.text).length;
  });
  const startBar = strainBarCounts.slice(0, idx).reduce(function(sum, count) {
    return sum + count;
  }, 0);
  const endBar = startBar + strainBarCounts[idx] - 1;
  const barMap = buildNotationLineBarMap(filtered);
  const lines = [];
  barMap.forEach(function(row) {
    if (row.endBar < startBar || row.startBar > endBar) return;
    const overlapStart = Math.max(startBar, row.startBar);
    const overlapEnd = Math.min(endBar, row.endBar);
    const sliceStartBar = overlapStart - row.startBar;
    const sliceEndBar = overlapEnd - row.startBar;
    const sliced = sliceBarsFromNotationLine(filtered[row.lineIndex], sliceStartBar, sliceEndBar);
    if (sliced) lines.push(sliced);
  });
  return lines.length ? lines : null;
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

  // ABC chord scaffolds are usually four bars per staff line; when the even
  // split would be fractional (eg. 28 bars / 8 lines → 3.5), prefer four bars
  // per line so a notation row does not spill onto the next lyric line.
  if (!Number.isInteger(natural) && barCount % 4 === 0 && candidates.indexOf(4) >= 0) {
    if (lineCount * 4 >= barCount && (lineCount - 1) * 4 <= barCount) {
      return 4;
    }
  }

  return best;
}

export function assignLyricLinesToBarsForChart(singableLines, barCount, chordBars, options) {
  const opts = options || {};
  const lines = Array.isArray(singableLines) ? singableLines : [];
  const allBars = Array.isArray(chordBars) ? chordBars : [];
  const natural = lines.length > 0 ? barCount / lines.length : barCount;
  let scopedBarCount = barCount;
  let scopedBars = allBars;
  // Only apply the 2-bars-per-line heuristic when the caller did not already
  // choose an explicit bars-per-line (eg. chorus 4 bars/line for a full staff).
  if (opts.barsPerLyricLine == null
      && lines.length > 1
      && lines.length * 2 <= barCount
      && natural > 2) {
    scopedBarCount = lines.length * 2;
    scopedBars = allBars.slice(0, scopedBarCount);
  }
  if (opts.repeatWrap && opts.barsPerLyricLine === 2) {
    return {
      barsPerLyricLine: 2,
      assignments: assignTwoBarsPerLyricLine(lines),
    };
  }
  if (Array.isArray(opts.notationNoteLines) && opts.notationNoteLines.length > 0) {
    const notationNoteLines = filterNotationNoteLinesForAlignment(opts.notationNoteLines);
    const fromNotation = assignLyricLinesToBarsFromNotation(lines, notationNoteLines, opts);
    if (fromNotation) {
      const effectiveBars = fromNotation.reduce(function(sum, assignment) {
        return sum + (assignment.endBar - assignment.startBar + 1);
      }, 0);
      return {
        barsPerLyricLine: effectiveBars / Math.max(1, lines.length),
        assignments: fromNotation,
        fromNotation: true,
      };
    }
  }
  const barsPerLine = opts.barsPerLyricLine != null
    ? opts.barsPerLyricLine
    : detectBarsPerLyricLine(lines.length, scopedBarCount, chordChangeBarIndices(scopedBars));
  return {
    barsPerLyricLine: barsPerLine,
    assignments: assignLyricLinesToBars(lines, scopedBarCount, barsPerLine),
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
