import { chordParserFactory, chordRendererFactory } from 'chord-symbol';
import { assignLyricLinesToBarsForChart } from './lyricBarAlignmentUtils';

const parseChord = chordParserFactory();
const renderChord = chordRendererFactory({ useShortNamings: true });

/**
 * Does a single whitespace-delimited token look like a chord symbol?
 * (e.g. "C", "Bb", "C7", "Dm/C", "Gm7", "A7")
 */
function normalizeChordToken(token) {
  return String(token).replace(/[(),.:|]/g, '').trim()
    .replace(/^([A-G])flat/i, '$1b')
    .replace(/^([A-G])sharp/i, '$1#');
}

function tokenizeLineWithOffsets(text) {
  const raw = String(text === null || text === undefined ? '' : text);
  const tokens = [];
  const re = /\S+/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Token spans for a text line, preserving character offsets.
 */
export function getTokenSpans(text) {
  return tokenizeLineWithOffsets(text);
}

/**
 * Map a character offset in a lyric line to the nearest word index.
 * Returns -1 when the line has no words.
 */
export function charOffsetToWordIndex(lyricLine, charOffset) {
  const tokens = tokenizeLineWithOffsets(lyricLine);
  if (tokens.length === 0) return -1;

  const offset = Number.isFinite(charOffset) ? charOffset : 0;
  let bestIndex = 0;
  let bestDistance = Infinity;

  tokens.forEach(function(token, index) {
    const center = token.start + ((token.end - token.start) / 2);
    const distance = Math.abs(offset - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function tokenIsChord(token) {
  if (token === null || token === undefined) return false;
  const cleaned = normalizeChordToken(token);
  if (!cleaned) return false;
  try {
    return renderChord(parseChord(cleaned)) !== null;
  } catch (e) {
    return false;
  }
}

const SECTION_HEADER_WORD = '(verse|chorus|bridge|intro|outro|pre-?chorus|refrain|coda|tag|instrumental|solo|interlude|hook)';
const SECTION_HEADER_SUFFIX = '(\\s*\\d+)?(\\s*\\([^)]*\\))?\\s*[:.]?';
const SECTION_HEADER_PREFIX = '(?:(?:guitar|bass|keyboard|piano|drum|mandolin|banjo|fiddle|harmonica|vocal?s?)\\s+)?';

function stripSectionHeaderMarkup(text) {
  return String(text || '')
    .trim()
    .replace(/^#+\s*/, '')
    // Handwritten / PDF imports often use dash prefixes ("– solo") instead of "#".
    .replace(/^[-–—−•*]\s*/, '')
    .trim();
}

function matchesSectionHeaderText(text) {
  const t = stripSectionHeaderMarkup(text);
  if (!t) return false;
  return new RegExp('^' + SECTION_HEADER_PREFIX + SECTION_HEADER_WORD + SECTION_HEADER_SUFFIX + '$', 'i').test(t);
}

/**
 * Section markers such as "[Verse 1]", "[Chorus]", "# Verse", or bare
 * "Verse 2" / "Bridge". A leading markdown-style "#" (optionally repeated) is
 * stripped before matching so "# Verse" / "## Chorus" are recognised.
 */
export function isSectionHeader(line) {
  const raw = String(line === null || line === undefined ? '' : line).trim();
  if (!raw) return false;
  if (/^\[.+\]$/.test(raw)) return true;
  return matchesSectionHeaderText(raw);
}

/**
 * Rows of repeated dashes or equals separate alternate lyric versions on one tune.
 */
export function isLyricVersionSeparator(line) {
  const t = String(line === null || line === undefined ? '' : line).trim();
  if (!t) return false;
  return /^[-=]{4,}$/.test(t);
}

/**
 * Return only the lines before the first version separator (separator excluded).
 */
export function truncateLyricLinesAtVersionSeparator(lines) {
  const result = [];
  const source = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < source.length; i++) {
    if (isLyricVersionSeparator(source[i])) break;
    result.push(source[i]);
  }
  return result;
}

/**
 * chord. Requiring every token to be a chord keeps lyric lines (which contain
 * ordinary words) from being misread as chords.
 */
function chordTokensAllParse(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (!tokenIsChord(tokens[i])) return false;
  }
  return tokens.length > 0;
}

export function isChordLine(line) {
  const t = String(line === null || line === undefined ? '' : line).trim();
  if (!t) return false;
  if (isSectionHeader(t)) return false;
  const barRepeat = t.match(/^\(([^)]+)\)\s*x\s*\d+$/i);
  if (barRepeat) {
    return chordTokensAllParse(barRepeat[1].trim().split(/\s+/));
  }
  const trailingRepeat = t.match(/^(.+?)\s+x\s+\d+$/i);
  if (trailingRepeat) {
    return chordTokensAllParse(trailingRepeat[1].trim().split(/\s+/));
  }
  return chordTokensAllParse(t.split(/\s+/));
}

/**
 * Classify each line of a lyrics/chord sheet as a blank, section header, chord
 * line, or lyric line so it can be rendered faithfully (ChordPro style).
 */
export function classifyLyricChordLines(lines) {
  return (Array.isArray(lines) ? lines : []).map(function(raw) {
    const line = raw === null || raw === undefined ? '' : String(raw);
    if (line.trim().length === 0) return { type: 'blank', text: '', tokens: [] };
    if (isSectionHeader(line)) return { type: 'header', text: line.trim(), tokens: [] };
    if (isChordLine(line)) return { type: 'chord', text: line, tokens: tokenizeLineWithOffsets(line) };
    return { type: 'lyric', text: line, tokens: tokenizeLineWithOffsets(line) };
  });
}

/**
 * Whether a set of lyric lines already carries chord lines (i.e. it is a chord
 * sheet rather than plain lyrics).
 */
export function hasChordLines(lines) {
  return classifyLyricChordLines(lines).some(function(item) { return item.type === 'chord'; });
}

/**
 * Split an array of lines into blocks separated by one or more blank lines.
 */
export function splitIntoBlocks(lines) {
  const blocks = [];
  let current = [];
  (Array.isArray(lines) ? lines : []).forEach(function(raw) {
    const line = raw === null || raw === undefined ? '' : String(raw);
    if (line.trim().length === 0) {
      if (current.length > 0) { blocks.push(current); current = []; }
    } else {
      current.push(line);
    }
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * When a blank line sits between a section header and its lyrics, splitIntoBlocks
 * leaves a header-only block. Attach that header to the following lyric block.
 */
export function coalesceSectionHeaderBlocks(blocks) {
  const merged = [];
  const source = Array.isArray(blocks) ? blocks : [];
  for (let i = 0; i < source.length; i++) {
    const block = source[i];
    const next = source[i + 1];
    if (block.length === 1 && isSectionHeader(block[0]) && next && next.length > 0 && !isSectionHeader(next[0])) {
      merged.push([block[0]].concat(next));
      i += 1;
    } else if (block.length > 0) {
      merged.push(block);
    }
  }
  return merged;
}

/**
 * Split blocks when several section headers appear back-to-back without a blank
 * line between them (eg. "# Verse 3" followed by "– solo").
 */
export function splitBlocksOnInteriorHeaders(blocks) {
  const split = [];
  (Array.isArray(blocks) ? blocks : []).forEach(function(block) {
    let current = [];
    (Array.isArray(block) ? block : []).forEach(function(line) {
      if (current.length > 0 && isSectionHeader(line)) {
        split.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length > 0) split.push(current);
  });
  return split;
}

export function normalizeLyricBlocks(lyricLines) {
  return splitBlocksOnInteriorHeaders(
    coalesceSectionHeaderBlocks(splitIntoBlocks(lyricLines))
  );
}

/**
 * For display only: when a section header (eg. "# Chorus") appears without its
 * own lyric lines, repeat the words from the first stanza of that section type.
 */
export function expandRepeatedSectionLyrics(lyricLines) {
  const blocks = normalizeLyricBlocks(lyricLines);
  const bodyByType = {};

  blocks.forEach(function(block) {
    if (!block || block.length === 0 || !isSectionHeader(block[0])) return;
    const type = normalizeSectionType(block[0]);
    const body = block.slice(1).filter(function(line) { return String(line).trim().length > 0; });
    if (type && body.length > 0 && !Object.prototype.hasOwnProperty.call(bodyByType, type)) {
      bodyByType[type] = body.slice();
    }
  });

  const result = [];
  blocks.forEach(function(block, blockIndex) {
    if (blockIndex > 0) result.push('');
    if (!block || block.length === 0) return;
    if (!isSectionHeader(block[0])) {
      block.forEach(function(line) { result.push(line); });
      return;
    }
    const type = normalizeSectionType(block[0]);
    const body = block.slice(1).filter(function(line) { return String(line).trim().length > 0; });
    result.push(block[0]);
    if (body.length > 0) {
      body.forEach(function(line) { result.push(line); });
    } else if (type && bodyByType[type]) {
      bodyByType[type].forEach(function(line) { result.push(line); });
    }
  });
  return result;
}

/**
 * Reduce a section header ("[Verse 1]", "Chorus", "Pre-Chorus 2") to a stable
 * type key so repeated sections of the same kind group together.
 */
export function normalizeSectionType(header) {
  if (!header) return null;
  const cleaned = String(header).toLowerCase().replace(/[[\]]/g, ' ').replace(/[^a-z\s-]/g, ' ').trim();
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/)[0] || '';
  if (first.indexOf('pre') === 0) return 'prechorus';
  return first || null;
}

function normalizeTextForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Imported lyric sheets often start with "Title - Artist" copied from a web
 * page. Treat that as display preface, not a lyric section, so it does not
 * consume the first chord block.
 */
export function isLeadingTitleComposerLine(line, options) {
  const normalized = normalizeTextForMatch(line);
  if (!normalized || isSectionHeader(line) || isChordLine(line)) return false;

  const title = normalizeTextForMatch(options && options.title);
  const composer = normalizeTextForMatch(options && options.composer);
  if (title && composer) {
    return normalized.indexOf(title) !== -1 && normalized.indexOf(composer) !== -1;
  }
  if (title && normalized === title) return true;
  return false;
}

/**
 * Split a rendered chord chart string (from renderChords) into per-section
 * blocks. renderChords emits a blank line wherever the melody has a double
 * barline, which is how sections (verse / chorus / bridge) are delimited.
 */
export function splitChordChartIntoBlocks(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return [];
  return String(chordChart)
    .split(/\n{2,}/)
    .map(function(block) { return block.replace(/\s+$/g, '').replace(/^\s*\n/, ''); })
    .filter(function(block) { return block.trim().length > 0; });
}

/**
 * Pull an ordered chord-change sequence from a renderChords chart block.
 * Consecutive duplicate chords are collapsed so each entry marks a change.
 */
export function extractChordSequence(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return [];
  const chords = [];
  String(chordChart).split('|').forEach(function(bar) {
    bar.trim().split(/\s+/).forEach(function(token) {
      const t = token.trim();
      if (t && tokenIsChord(t)) {
        if (chords.length === 0 || chords[chords.length - 1] !== t) {
          chords.push(t);
        }
      }
    });
  });
  return chords;
}

/** True when a renderChords chart block contains at least one chord symbol. */
export function chartBlockHasChords(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return false;
  if (extractChordSequence(chordChart).length > 0) return true;
  // Bar-only grids (|, /, ., whitespace) should read as empty even when
  // chord-symbol rejects an unusual spelling from renderChords. Slash chords
  // like Dm/C still leave letter content after stripping `/`.
  return String(chordChart).replace(/[|./\s\n]/g, '').length > 0;
}

/**
 * Drop chord-chart blocks that only contain bar lines / spacing (no chord names).
 * Within a mixed block, bar-only lines are removed too.
 */
export function sanitizeChordChartBlock(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  return String(chordChart)
    .split('\n')
    .filter(function(line) { return chartBlockHasChords(line); })
    .join('\n');
}

/**
 * Replace bars that have no chord symbols with `/` so held bars and rest-only
 * bars stay visible in block chord charts (e.g. `Fm | | Am |` → `Fm | / | Am |`).
 * Beat placeholders (`.`) and existing `/` markers count as empty.
 */
export function fillEmptyBarsWithSlash(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  return String(chordChart).split('\n').map(function(line) {
    if (!line.trim()) return line;
    const segments = line.split('|');
    return segments.map(function(segment, index) {
      // A line normally ends with '|', producing a trailing empty segment that
      // is not a real bar.
      if (index === segments.length - 1 && segment.trim() === '') return segment;
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      const hasChord = tokens.some(function(token) { return tokenIsChord(token); });
      if (hasChord) return segment;
      return ' / ';
    }).join('|');
  }).join('\n');
}

export function formatChordChartForDisplay(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  const blocks = splitChordChartIntoBlocks(chordChart)
    .map(sanitizeChordChartBlock)
    .filter(chartBlockHasChords)
    .map(fillEmptyBarsWithSlash);
  if (blocks.length === 0) return '';
  return blocks.join('\n\n');
}

/**
 * Split a rendered chord chart block into its sequence of bars, preserving the
 * bar grid (the melody lays chords into bars, so bars are the unit of musical
 * time we align lyrics against). Newlines are treated as soft wrapping and
 * flattened, because the melody's line breaks (eg. four bars per ABC line) do
 * not necessarily match the lyric line breaks (eg. two bars per sung line).
 *
 * Each returned entry is the array of chord tokens that begin in that bar; an
 * empty array means the previous chord is held through that bar.
 */
export function extractChordBars(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return [];
  const bars = [];
  String(chordChart).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const segments = line.split('|');
    segments.forEach(function(segment, index) {
      // A line normally ends with '|', producing a trailing empty segment that
      // is not a real bar.
      if (index === segments.length - 1 && segment.trim() === '') return;
      const chords = segment.trim().split(/\s+/).filter(function(token) {
        return token && tokenIsChord(token);
      });
      bars.push(chords);
    });
  });
  return bars;
}

/**
 * Merge a chord chart into clean lyric lines, placing each chord change above
 * the word it falls on (ChordPro style). Every word is kept.
 *
 * Alignment is bar-based: the chart's bars are distributed evenly across the
 * lyric lines (so a four-bar melody line spanning two sung lines splits two
 * bars to each), then within a line each bar's chord is positioned above the
 * word at that bar's proportional offset. Consecutive duplicate chords are
 * collapsed across the whole block so a held chord is not repeated and never
 * leaks onto the wrong line.
 *
 * @returns array of lines; each line is an array of { chord, text } tokens.
 */
export function mergeChordsIntoLyricLines(lyricLines, chordChart, options) {
  const opts = options || {};
  const lineWords = (Array.isArray(lyricLines) ? lyricLines : [])
    .map(function(line) { return String(line || '').trim().split(/\s+/).filter(Boolean); })
    .filter(function(words) { return words.length > 0; });
  if (lineWords.length === 0) return [];

  const bars = extractChordBars(chordChart);

  if (bars.length === 0) {
    return lineWords.map(function(words) {
      return words.map(function(word) { return { chord: '', text: word + ' ' }; });
    });
  }

  const singableLines = (Array.isArray(lyricLines) ? lyricLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(function(line) { return line.split(/\s+/).filter(Boolean).length > 0; });
  const barAssignment = assignLyricLinesToBarsForChart(singableLines, bars.length, bars);
  const barsForLine = lineWords.map(function() { return []; });
  barAssignment.assignments.forEach(function(assignment) {
    for (let barIndex = assignment.startBar; barIndex <= assignment.endBar; barIndex += 1) {
      if (bars[barIndex]) barsForLine[assignment.lineIndex].push(bars[barIndex]);
    }
  });

  // runningChord is the chord currently sounding; it carries across lines so a
  // chord held over a line break is known. Within a line, consecutive duplicate
  // chords are collapsed, but the chord sounding at the start of every lyric
  // line is always shown so each line displays its chord (a chord change lands
  // on every line where the chords actually change, eg. one chord per bar).
  let runningChord = null;
  return lineWords.map(function(words, li) {
    const lineBars = barsForLine[li];
    const wordCount = words.length;
    const barCount = lineBars.length;
    const slots = words.map(function() { return ''; });
    const anchorWordIndexForBar = typeof opts.anchorWordIndexForBar === 'function'
      ? opts.anchorWordIndexForBar
      : null;

    if (barCount > 0) {
      lineBars.forEach(function(barChords, b) {
        let wordIdx = anchorWordIndexForBar
          ? anchorWordIndexForBar({
            lineIndex: li,
            barIndex: b,
            barCount: barCount,
            wordCount: wordCount,
            words: words.slice(),
            lineText: String(lyricLines[li] || ''),
          })
          : Math.round((b * wordCount) / barCount);
        if (wordIdx >= wordCount) wordIdx = wordCount - 1;
        if (wordIdx < 0) wordIdx = 0;

        const explicit = Array.isArray(barChords) ? barChords : [];
        let toShow = [];
        if (b === 0) {
          // Start of a lyric line: always show the sounding chord (explicit
          // change here, or the chord held over from the previous line).
          toShow = explicit.length > 0 ? explicit.slice() : (runningChord ? [runningChord] : []);
        } else {
          explicit.forEach(function(chord) {
            if (chord !== runningChord) toShow.push(chord);
          });
        }

        toShow.forEach(function(chord) {
          if (!chord) return;
          slots[wordIdx] = slots[wordIdx] ? slots[wordIdx] + ' ' + chord : chord;
          runningChord = chord;
        });
        if (explicit.length > 0) runningChord = explicit[explicit.length - 1];
      });
    }

    return words.map(function(word, wi) {
      return { chord: slots[wi] || '', text: word + ' ' };
    });
  });
}

/**
 * Align melody chord blocks to clean lyric blocks.
 *
 * Lyric blocks are separated by blank lines and may begin with a [Section]
 * header. Chord blocks come from the melody, split at double barlines and
 * ordered as they appear (conventionally verse, chorus, bridge). When the
 * lyrics carry section headers we map each distinct section type to a chord
 * block by first-appearance order, so repeated sections (eg. a second verse or
 * chorus) reuse the correct chords instead of consuming the next block. Without
 * headers we fall back to a positional 1:1 mapping, except when the melody has
 * a single chord block and the lyrics have several blocks: that is the hymn /
 * folk-song pattern (one melody sung to many verses, eg. Amazing Grace), so the
 * one chord block is applied to every verse. Every lyric line is always emitted
 * so no words are dropped.
 *
 * inlineChords is true whenever a block has its own lyric words and a chart
 * to merge (including repeated verses/choruses with distinct lyrics). A
 * repeated section that carries no words of its own (eg. a chorus reference
 * that is just a header) keeps inlineChords false.
 *
 * chartRevisit is true when this lyric block reuses a chord stanza that was
 * already shown (eg. a second verse or chorus, or another hymn verse under
 * one melody chart). Structure display should show only the section title,
 * not the chord chart again — but lyrics still merge chords above each line
 * when the block has words.
 *
 * Orphan (unmapped) melody chord blocks are attached as extraChart on the
 * last lyric block that has no mapped chart (unidentified lyrics), so they
 * appear before that block's words.
 *
 * @returns array of { header, type, chart, lyricLines, inlineChords, chartRevisit, extraChart }
 */
export function alignChordBlocksToLyrics(lyricLines, chordBlocks, options) {
  const charts = Array.isArray(chordBlocks) ? chordBlocks : splitChordChartIntoBlocks(chordBlocks);
  const rawBlocks = normalizeLyricBlocks(lyricLines).slice();
  const prefaceLines = [];

  if (rawBlocks.length > 0 && rawBlocks[0].length > 0) {
    const firstLine = rawBlocks[0][0];
    const nextLine = rawBlocks[0][1] || (rawBlocks[1] && rawBlocks[1][0]) || '';
    const likelyPreface = isLeadingTitleComposerLine(firstLine, options)
      || (!options && rawBlocks[0].length === 1 && !isSectionHeader(firstLine) && isSectionHeader(nextLine));
    if (likelyPreface) {
      prefaceLines.push(firstLine);
      rawBlocks[0] = rawBlocks[0].slice(1);
      if (rawBlocks[0].length === 0) rawBlocks.shift();
    }
  }

  const blocks = rawBlocks.map(function(lines) {
    let header = null;
    let body = lines;
    if (lines.length > 0 && isSectionHeader(lines[0])) {
      header = lines[0].trim();
      body = lines.slice(1);
    }
    return { header: header, type: header ? normalizeSectionType(header) : null, lyricLines: body };
  });

  const hasTypes = blocks.some(function(b) { return b.type; });
  const chartForType = {};
  if (hasTypes) {
    const orderedTypes = [];
    blocks.forEach(function(b) {
      if (b.type && orderedTypes.indexOf(b.type) === -1) orderedTypes.push(b.type);
    });
    orderedTypes.forEach(function(type, index) {
      if (index < charts.length && chartBlockHasChords(charts[index])) {
        chartForType[type] = sanitizeChordChartBlock(charts[index]);
      }
    });
  }

  // One melody, many verses (no headers): apply the single chord block to every
  // lyric block so chords show on every verse, not just the first.
  const singleChartForAllBlocks = !hasTypes && charts.length === 1 && blocks.length > 1
    && chartBlockHasChords(charts[0])
    ? sanitizeChordChartBlock(charts[0])
    : null;

  // One verse, many melodic sections (no headers): an instrumental-style tune
  // (eg. Ashokan Farewell) whose melody splits into several chord blocks at its
  // double barlines, sung over a single block of lyrics. The verse spans the
  // whole melody, so combine every chord block and distribute the bars across
  // the verse's lines, rather than cramming the first section inline and
  // dumping the remaining sections onto the same verse as a separate chart.
  const combinedCharts = charts.map(sanitizeChordChartBlock).filter(chartBlockHasChords);
  const combinedChartForSingleBlock = !hasTypes && blocks.length === 1 && charts.length > 1 && combinedCharts.length > 0
    ? combinedCharts.join('\n\n')
    : null;

  const seenSectionTypes = Object.create(null);
  const seenCharts = Object.create(null);

  const aligned = blocks.map(function(b, index) {
    let chart = '';
    if (hasTypes) {
      if (b.type && Object.prototype.hasOwnProperty.call(chartForType, b.type)) {
        chart = chartForType[b.type];
      }
    } else if (combinedChartForSingleBlock !== null) {
      chart = combinedChartForSingleBlock;
    } else if (singleChartForAllBlocks !== null) {
      chart = singleChartForAllBlocks;
    } else if (index < charts.length) {
      chart = charts[index];
    }

    if (!chartBlockHasChords(chart)) chart = '';
    else chart = sanitizeChordChartBlock(chart);

    let chartRevisit = false;
    if (chart) {
      if (hasTypes && b.type) {
        if (seenSectionTypes[b.type]) chartRevisit = true;
        else seenSectionTypes[b.type] = true;
      } else if (singleChartForAllBlocks !== null) {
        chartRevisit = index > 0;
      } else if (seenCharts[chart]) {
        chartRevisit = true;
      } else {
        seenCharts[chart] = true;
      }
    }

    const hasWords = b.lyricLines.some(function(line) { return String(line).trim().length > 0; });
    // Merge chords above lyric lines whenever this block has words — including
    // repeated stanzas that reuse a chart (chartRevisit). Structure still uses
    // chartRevisit to suppress repeating the block chart.
    const inlineChords = !!(chart && hasWords);

    return {
      prefaceLines: index === 0 ? prefaceLines : [],
      header: b.header,
      type: b.type,
      chart: chart,
      extraChart: '',
      lyricLines: b.lyricLines,
      inlineChords: inlineChords,
      chartRevisit: chartRevisit,
    };
  });

  // Chord blocks from the melody that did not map to any lyric section are
  // shown as extraChart before the last unidentified lyric block (words with
  // no mapped chart). Fall back to the last lyric block when every block mapped.
  const mappedChartCount = hasTypes
    ? Object.keys(chartForType).length
    : (combinedChartForSingleBlock !== null
      ? charts.length
      : Math.min(charts.length, blocks.length));
  const orphanCharts = charts.slice(mappedChartCount)
    .map(sanitizeChordChartBlock)
    .filter(chartBlockHasChords);
  if (orphanCharts.length > 0 && aligned.length > 0) {
    let target = -1;
    for (let i = aligned.length - 1; i >= 0; i--) {
      const hasWords = aligned[i].lyricLines.some(function(line) {
        return String(line).trim().length > 0;
      });
      if (hasWords && !chartBlockHasChords(aligned[i].chart)) {
        target = i;
        break;
      }
    }
    if (target < 0) {
      for (let j = aligned.length - 1; j >= 0; j--) {
        if (aligned[j].lyricLines.some(function(line) {
          return String(line).trim().length > 0;
        })) {
          target = j;
          break;
        }
      }
    }
    if (target < 0) target = aligned.length - 1;
    if (target >= 0) {
      aligned[target].extraChart = orphanCharts.join('\n\n');
    }
  }

  return aligned;
}
