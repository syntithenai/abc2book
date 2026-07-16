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
 * Soft chord-line check for import quality: a majority of tokens (at least 2)
 * parse as chords. Catches lines like "C  yeah  G  Am" that fail the strict
 * every-token-is-a-chord rule.
 */
export function isMostlyChordLine(line) {
  const t = String(line === null || line === undefined ? '' : line).trim();
  if (!t) return false;
  if (isSectionHeader(t)) return false;
  if (isChordLine(t)) return true;

  let tokens = t.split(/\s+/);
  const barRepeat = t.match(/^\(([^)]+)\)\s*x\s*\d+$/i);
  if (barRepeat) tokens = barRepeat[1].trim().split(/\s+/);
  else {
    const trailingRepeat = t.match(/^(.+?)\s+x\s+\d+$/i);
    if (trailingRepeat) tokens = trailingRepeat[1].trim().split(/\s+/);
  }

  let chordCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokenIsChord(tokens[i])) chordCount += 1;
  }
  return chordCount >= 2 && chordCount * 2 > tokens.length;
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
    if (isChordLine(line) || isMostlyChordLine(line)) {
      return { type: 'chord', text: line, tokens: tokenizeLineWithOffsets(line) };
    }
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

function blockBodyLines(block) {
  if (!block) return [];
  if (Array.isArray(block.lyricLines)) return block.lyricLines;
  if (Array.isArray(block.lines)) return block.lines;
  return [];
}

function nonEmptyLineCount(block) {
  return blockBodyLines(block).filter(function(line) {
    return String(line == null ? '' : line).trim().length > 0;
  }).length;
}

function sectionTypeDisplayLabel(type) {
  if (type === 'prechorus') return 'Pre-Chorus';
  if (!type) return 'Section';
  return String(type).charAt(0).toUpperCase() + String(type).slice(1);
}

function normalizeBodyKey(block) {
  return blockBodyLines(block)
    .map(function(line) { return normalizeTextForMatch(line); })
    .filter(Boolean)
    .join('\n');
}

function sectionTypePriority(type) {
  if (type === 'verse') return 3;
  if (type === 'chorus') return 2;
  if (type === 'prechorus') return 1;
  if (type === 'bridge') return 0;
  return 0;
}

function assignInferredType(block, type, typeCounts) {
  if (!block || block.type || !type) return false;
  typeCounts[type] = (typeCounts[type] || 0) + 1;
  const ordinal = typeCounts[type];
  const label = sectionTypeDisplayLabel(type);
  block.type = type;
  block.header = ordinal === 1 ? '[' + label + ']' : '[' + label + ' ' + ordinal + ']';
  return true;
}

function seedLengthToType(lengthToType, len, type) {
  if (!type || !(len > 0)) return;
  const existing = lengthToType[len];
  if (!existing) {
    lengthToType[len] = type;
    return;
  }
  if (existing === type) return;
  if (sectionTypePriority(type) > sectionTypePriority(existing)) {
    lengthToType[len] = type;
  }
}

function applyAlternationTypes(blocks, lengths, verseLen, chorusLen, typeCounts, lengthToType) {
  lengthToType[verseLen] = 'verse';
  lengthToType[chorusLen] = 'chorus';
  blocks.forEach(function(b, i) {
    if (!b || b.type) return;
    const n = lengths[i];
    let type = lengthToType[n];
    if (!type) {
      type = 'bridge';
      lengthToType[n] = 'bridge';
    }
    assignInferredType(b, type, typeCounts);
  });
}

/**
 * Fill unlabeled lyric blocks with verse/chorus/bridge types. Never overwrites
 * existing type/header.
 *
 * Order: seed length→type from labels → lyric-body reuse → when verse+chorus
 * lengths are known and the pattern repeats, length match + bridge leftovers →
 * otherwise alternation fallback (requires return to first length after second).
 *
 * Mutates blocks in place. Accepts blocks with either lyricLines or lines.
 *
 * @returns {Array} the same blocks array
 */
export function inferSectionTypesFromLineCounts(blocks) {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;

  const lengths = blocks.map(nonEmptyLineCount);
  const typeCounts = Object.create(null);
  const lengthToType = Object.create(null);

  blocks.forEach(function(b) {
    if (b && b.type) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
  });

  // 1. Seed length → type from labeled blocks
  blocks.forEach(function(b, i) {
    if (b && b.type) seedLengthToType(lengthToType, lengths[i], b.type);
  });

  // 2. Lyric-body reuse: unlabeled stanza matching an earlier typed body
  const bodyToType = Object.create(null);
  blocks.forEach(function(b) {
    if (!b || !b.type) return;
    const key = normalizeBodyKey(b);
    if (key && !Object.prototype.hasOwnProperty.call(bodyToType, key)) {
      bodyToType[key] = b.type;
    }
  });
  blocks.forEach(function(b, i) {
    if (!b || b.type) return;
    const key = normalizeBodyKey(b);
    if (key && bodyToType[key]) {
      assignInferredType(b, bodyToType[key], typeCounts);
      seedLengthToType(lengthToType, lengths[i], b.type);
    }
  });

  // Refresh verse/chorus lengths after body reuse (no blanket length-match:
  // a single shared line count between chorus and an orphan must not force a label).
  let verseLen = null;
  let chorusLen = null;
  Object.keys(lengthToType).forEach(function(key) {
    const len = Number(key);
    const t = lengthToType[len];
    if (t === 'verse' && verseLen === null) verseLen = len;
    if (t === 'chorus' && chorusLen === null) chorusLen = len;
  });

  // When verse+chorus lengths are known and distinct, fill matching unlabeled
  // blocks and label leftover lengths as bridge — but only when the pattern
  // actually repeats (both lengths appear at least twice, or V…C…V alternation).
  // Otherwise a trailing orphan that shares the chorus line count stays unlabeled.
  if (verseLen !== null && chorusLen !== null && verseLen !== chorusLen) {
    let verseAppearances = 0;
    let chorusAppearances = 0;
    let seenChorus = false;
    let returnedToVerse = false;
    lengths.forEach(function(n) {
      if (n === verseLen) verseAppearances += 1;
      if (n === chorusLen) {
        chorusAppearances += 1;
        seenChorus = true;
      } else if (seenChorus && n === verseLen) {
        returnedToVerse = true;
      }
    });
    const patternRepeats = (verseAppearances >= 2 && chorusAppearances >= 2) || returnedToVerse;
    if (patternRepeats) {
      blocks.forEach(function(b, i) {
        if (!b || b.type) return;
        const n = lengths[i];
        if (n === verseLen) assignInferredType(b, 'verse', typeCounts);
        else if (n === chorusLen) assignInferredType(b, 'chorus', typeCounts);
        else assignInferredType(b, 'bridge', typeCounts);
      });
    } else {
      blocks.forEach(function(b, i) {
        if (!b || b.type) return;
        const n = lengths[i];
        if (n !== verseLen && n !== chorusLen) {
          assignInferredType(b, 'bridge', typeCounts);
        }
      });
    }
    return blocks;
  }

  const stillUntyped = blocks.some(function(b) { return b && !b.type; });
  if (!stillUntyped) return blocks;

  // Alternation fallback — establish missing verse/chorus lengths
  if (verseLen === null && chorusLen === null) {
    const unique = [];
    lengths.forEach(function(n) {
      if (unique.indexOf(n) === -1) unique.push(n);
    });
    if (unique.length < 2) return blocks;

    const altVerse = unique[0];
    const altChorus = unique[1];
    let seenChorus = false;
    let returnedToVerse = false;
    for (let i = 0; i < lengths.length; i++) {
      const n = lengths[i];
      if (n === altChorus) seenChorus = true;
      else if (seenChorus && n === altVerse) {
        returnedToVerse = true;
        break;
      }
    }
    if (!returnedToVerse) return blocks;
    applyAlternationTypes(blocks, lengths, altVerse, altChorus, typeCounts, lengthToType);
    return blocks;
  }

  // One role known: find the other length from unlabeled blocks
  const knownLen = verseLen !== null ? verseLen : chorusLen;
  const knownType = verseLen !== null ? 'verse' : 'chorus';
  const otherType = knownType === 'verse' ? 'chorus' : 'verse';
  let otherLen = null;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] && blocks[i].type) continue;
    if (lengths[i] !== knownLen) {
      otherLen = lengths[i];
      break;
    }
  }
  if (otherLen === null) return blocks;

  let seenOther = false;
  let returnedToKnown = false;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] === otherLen) seenOther = true;
    else if (seenOther && lengths[i] === knownLen) {
      returnedToKnown = true;
      break;
    }
  }
  if (!returnedToKnown) return blocks;

  if (otherType === 'verse') {
    applyAlternationTypes(blocks, lengths, otherLen, knownLen, typeCounts, lengthToType);
  } else {
    applyAlternationTypes(blocks, lengths, knownLen, otherLen, typeCounts, lengthToType);
  }
  return blocks;
}

/**
 * Stable fingerprint of a chord chart for matching repeated strains.
 */
export function chordChartFingerprint(chordChart) {
  if (!chartBlockHasChords(chordChart)) return '';
  return extractChordSequence(sanitizeChordChartBlock(chordChart)).join(' ');
}

/**
 * When melody charts are available, label unlabeled lyric blocks whose
 * positional chart fingerprint matches an earlier typed block's chart.
 * Never overwrites existing types.
 *
 * @returns {Array} the same blocks array
 */
export function inferSectionTypesFromChartFingerprints(blocks, charts) {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;
  if (!Array.isArray(charts) || charts.length === 0) return blocks;

  const typeCounts = Object.create(null);
  blocks.forEach(function(b) {
    if (b && b.type) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
  });

  const fpToType = Object.create(null);
  blocks.forEach(function(b, i) {
    if (!b || !b.type || i >= charts.length) return;
    const fp = chordChartFingerprint(charts[i]);
    if (fp && !Object.prototype.hasOwnProperty.call(fpToType, fp)) {
      fpToType[fp] = b.type;
    }
  });

  if (Object.keys(fpToType).length === 0) return blocks;

  blocks.forEach(function(b, i) {
    if (!b || b.type || i >= charts.length) return;
    const fp = chordChartFingerprint(charts[i]);
    if (fp && fpToType[fp]) assignInferredType(b, fpToType[fp], typeCounts);
  });

  return blocks;
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
 * True for repeat / volta tokens that appear in display chord charts
 * (e.g. `|:`, `:|`, `[1`, `1.`) and must not be treated as chords or bars.
 */
export function tokenIsChartStructureMarker(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  if (t === '|:' || t === ':|' || t === ':|:' || t === '|') return true;
  // ABC-style ending: [1 [2  or fakebook 1. 2.
  if (/^\[\d+$/.test(t)) return true;
  if (/^\d+\.$/.test(t)) return true;
  return false;
}

/**
 * Collapse accidental spaces inside repeat marks (`| :` → `|:`, `: |` → `:|`)
 * so structure charts never show a broken colon/pipe pair.
 * Also repairs a bare trailing `:` (clipped/split end-repeat) back to `:|`.
 */
export function normalizeChordChartRepeatMarks(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return chordChart || '';
  return String(chordChart)
    .replace(/:\s*\|:\s*/g, ':|:')
    .replace(/\|\s+:/g, '|:')
    .replace(/:\s+\|/g, ':|')
    // End-repeat must be ":|" — a lone trailing colon (not part of |: / :|) is broken.
    .replace(/(^|[^|]):(?!\|)(\s*)$/gm, '$1:|$2');
}

/**
 * Split a chord-chart line into bars while preserving `|:` / `:|` barlines.
 * Returns { bars, barlines } where barlines[i] closes bars[i].
 * A leading `|:` with no prior content is folded into the first real bar as a
 * `|:` prefix token so bar counts stay aligned with chord beats.
 */
export function splitChordChartLineIntoBars(line) {
  const raw = String(line === null || line === undefined ? '' : line);
  if (!raw.trim()) return { bars: [], barlines: [] };
  // Longest / spaced variants first so ": |" and "| :" count as repeat marks.
  const re = /:\s*\|:\s*|\|\s*:|:\s*\||\|/g;
  const bars = [];
  const barlines = [];
  let lastIndex = 0;
  let match;
  while ((match = re.exec(raw)) !== null) {
    bars.push(raw.slice(lastIndex, match.index));
    barlines.push(normalizeChordChartRepeatMarks(match[0]));
    lastIndex = match.index + match[0].length;
  }
  const trailing = raw.slice(lastIndex);
  if (trailing.trim() !== '') {
    bars.push(trailing);
    barlines.push('|');
  }
  // "|: C G |" → empty segment before leading |: ; fold into the next bar.
  while (bars.length > 1 && String(bars[0]).trim() === '' && barlines[0] === '|:') {
    barlines.shift();
    bars.shift();
    bars[0] = '|: ' + String(bars[0]).replace(/^\s+/, '');
  }
  return { bars: bars, barlines: barlines };
}

function chordTokensInBarSegment(segment) {
  return String(segment || '').trim().split(/\s+/).filter(function(token) {
    return token && !tokenIsChartStructureMarker(token) && tokenIsChord(token);
  });
}

/**
 * Pull an ordered chord-change sequence from a renderChords chart block.
 * Consecutive duplicate chords are collapsed so each entry marks a change.
 */
export function extractChordSequence(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return [];
  const chords = [];
  String(chordChart).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const parts = splitChordChartLineIntoBars(line);
    parts.bars.forEach(function(bar) {
      chordTokensInBarSegment(bar).forEach(function(t) {
        if (chords.length === 0 || chords[chords.length - 1] !== t) {
          chords.push(t);
        }
      });
    });
  });
  return chords;
}

/** True when a renderChords chart block contains at least one chord symbol. */
export function chartBlockHasChords(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return false;
  if (extractChordSequence(chordChart).length > 0) return true;
  // Bar-only grids (|, /, ., whitespace) and structure markers (|: :| [1)
  // should read as empty even when chord-symbol rejects an unusual spelling.
  // Slash chords like Dm/C still leave letter content after stripping `/`.
  return String(chordChart)
    .replace(/\|:|:\|:|:\||\|/g, '')
    .replace(/\[\d+/g, '')
    .replace(/\d+\./g, '')
    .replace(/[./\s\n:]/g, '')
    .length > 0;
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
 * Preserves `|:` / `:|` barlines and inline ending markers (`[1`, `1.`).
 */
export function fillEmptyBarsWithSlash(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  return String(chordChart).split('\n').map(function(line) {
    if (!line.trim()) return line;
    const parts = splitChordChartLineIntoBars(line);
    if (parts.bars.length === 0) return line;
    const out = [];
    parts.bars.forEach(function(segment, index) {
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      const structurePrefix = [];
      let i = 0;
      while (i < tokens.length && tokenIsChartStructureMarker(tokens[i])) {
        structurePrefix.push(tokens[i]);
        i += 1;
      }
      const rest = tokens.slice(i);
      const hasChord = rest.some(function(token) { return tokenIsChord(token); });
      const close = parts.barlines[index] || '|';
      // Glue close onto the bar body in one piece so join cannot split :| / |:.
      const body = hasChord
        ? tokens.join(' ')
        : structurePrefix.concat(['/']).join(' ');
      out.push(body ? (body + ' ' + close) : close);
    });
    return normalizeChordChartRepeatMarks(out.join(' ').replace(/\s+/g, ' ').trim());
  }).join('\n');
}

export function formatChordChartForDisplay(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  const blocks = splitChordChartIntoBlocks(chordChart)
    .map(sanitizeChordChartBlock)
    .filter(chartBlockHasChords)
    .map(fillEmptyBarsWithSlash)
    .map(normalizeChordChartRepeatMarks);
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
 * Repeat / ending markers (`|:`, `:|`, `[1`, …) are omitted from chord arrays.
 */
export function extractChordBars(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return [];
  const bars = [];
  String(chordChart).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const parts = splitChordChartLineIntoBars(line);
    parts.bars.forEach(function(segment) {
      bars.push(chordTokensInBarSegment(segment));
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
 * header. Chord blocks come from the melody, split at double barlines (and
 * start-repeat marks) and ordered as they appear (conventionally verse,
 * chorus, bridge). When the lyrics carry section headers we consume charts in
 * order: untyped leading verses still receive a chart (hymns often label only
 * [Chorus]), and each distinct section type reuses the chart bound on first
 * appearance so repeated verses/choruses keep the right chords. Without
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
 * When options.chordSectionLabels is set (persisted chords-editor stanza names),
 * charts are matched to lyric sections by label name/type instead of consuming
 * charts in lyric-page order.
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

  inferSectionTypesFromLineCounts(blocks);
  inferSectionTypesFromChartFingerprints(blocks, charts);

  const hasTypes = blocks.some(function(b) { return b.type; });
  // When some lyric blocks have section headers, consume melody charts in order.
  // Untyped leading verses still take a chart (hymns often label only [Chorus]),
  // and repeated types reuse the chart bound on first appearance.
  // When chordSectionLabels are provided (chords editor stanza names), match by
  // label name/type instead of consuming charts in lyric-page order.
  const chartForType = {};
  const chartByBlockIndex = {};
  let typedMappedChartCount = 0;
  const usedChartIndexes = Object.create(null);
  let usedLabelMatching = false;
  const rawLabels = options && Array.isArray(options.chordSectionLabels)
    ? options.chordSectionLabels
    : null;
  // Sounding charts omit revisits (same as rebuildChordGridFromSections).
  const soundingLabels = rawLabels
    ? rawLabels.filter(function(label) { return label && !label.chartRevisit; })
    : null;

  function stanzaNameKey(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/^#+\s*/, '')
      .replace(/^[-–—−•*]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (hasTypes && soundingLabels && soundingLabels.length > 0) {
    usedLabelMatching = true;
    const chartsByType = Object.create(null);
    const chartsByName = Object.create(null);
    soundingLabels.forEach(function(label, i) {
      if (i >= charts.length || !chartBlockHasChords(charts[i])) return;
      const chart = sanitizeChordChartBlock(charts[i]);
      const type = label.type
        || (label.header ? normalizeSectionType(label.header) : null)
        || (label.title ? normalizeSectionType('[' + String(label.title) + ']') : null);
      const nameKey = stanzaNameKey(label.header || label.title);
      if (type && !Object.prototype.hasOwnProperty.call(chartsByType, type)) {
        chartsByType[type] = { chart: chart, index: i };
      }
      if (nameKey && !Object.prototype.hasOwnProperty.call(chartsByName, nameKey)) {
        chartsByName[nameKey] = { chart: chart, index: i };
      }
    });

    blocks.forEach(function(b, index) {
      const nameKey = stanzaNameKey(b.header);
      let hit = null;
      if (b.type && Object.prototype.hasOwnProperty.call(chartsByType, b.type)) {
        hit = chartsByType[b.type];
      } else if (nameKey && Object.prototype.hasOwnProperty.call(chartsByName, nameKey)) {
        hit = chartsByName[nameKey];
      }
      if (!hit) return;
      chartByBlockIndex[index] = hit.chart;
      if (b.type) chartForType[b.type] = hit.chart;
      usedChartIndexes[hit.index] = true;
    });
    typedMappedChartCount = Object.keys(usedChartIndexes).length;
  } else if (hasTypes) {
    let nextChart = 0;
    let seenTyped = false;
    blocks.forEach(function(b, index) {
      const hasWords = b.lyricLines.some(function(line) {
        return String(line).trim().length > 0;
      });
      if (b.type && Object.prototype.hasOwnProperty.call(chartForType, b.type)) {
        chartByBlockIndex[index] = chartForType[b.type];
        seenTyped = true;
        return;
      }
      if (!hasWords && !b.type) return;
      // Leading untyped verses still take a chart (hymns often label only
      // [Chorus]). Trailing/intervening untyped blocks do not — surplus
      // charts attach as extraChart on unidentified lyrics.
      if (!b.type && seenTyped) return;
      if (nextChart < charts.length && chartBlockHasChords(charts[nextChart])) {
        const chart = sanitizeChordChartBlock(charts[nextChart]);
        if (b.type) {
          chartForType[b.type] = chart;
          seenTyped = true;
        }
        chartByBlockIndex[index] = chart;
        usedChartIndexes[nextChart] = true;
        nextChart += 1;
      }
    });
    typedMappedChartCount = nextChart;
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
      if (Object.prototype.hasOwnProperty.call(chartByBlockIndex, index)) {
        chart = chartByBlockIndex[index];
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
      } else if (hasTypes && !b.type) {
        if (seenCharts[chart]) chartRevisit = true;
        else seenCharts[chart] = true;
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
  let orphanCharts = [];
  if (usedLabelMatching) {
    charts.forEach(function(chart, index) {
      if (usedChartIndexes[index]) return;
      const cleaned = sanitizeChordChartBlock(chart);
      if (chartBlockHasChords(cleaned)) orphanCharts.push(cleaned);
    });
  } else {
    const mappedChartCount = hasTypes
      ? typedMappedChartCount
      : (combinedChartForSingleBlock !== null
        ? charts.length
        : Math.min(charts.length, blocks.length));
    orphanCharts = charts.slice(mappedChartCount)
      .map(sanitizeChordChartBlock)
      .filter(chartBlockHasChords);
  }
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
