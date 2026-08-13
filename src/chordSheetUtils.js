import { chordParserFactory, chordRendererFactory } from 'chord-symbol';
import {
  assignLyricLinesToBarsForChart,
  assignLyricLinesToBarsForStanzaGroups,
  splitMelodyNoteLinesByStrain,
  buildNotationLineBarMap,
  filterNotationNoteLinesForAlignment,
  strainLyricsUseRepeatDoubling,
  notationNoteLinesForChart,
  notationNoteLinesForStrainIndex,
  extractBarsFromMelodyText,
} from './lyricBarAlignmentUtils';
import { splitMelodyStrainsWithBarlines } from './melodyStrainSplit';
import { getBarModel, defaultNoteLengthForMeter, normalizeMeter } from './barModel';
import {
  resolveLyricBeatAnchorWordIndex,
  lyricBeatAnchorWordIndices,
  beatAnchorsForBar,
  wordIndicesForChordsOnBeatAnchors,
} from './lyricBeatMarkers';

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

const SECTION_HEADER_WORD = '(verse|chorus|bridge|intro|outro|pre-?chorus|refrain|coda|tag|instrumental|solo|interlude|hook|v\\d+)';
// Optional stanza number, parenthetical note, and/or meter (eg. "3/4") after the type.
// Meter is matched before bare digits so "bridge 3/4" is not eaten as "bridge 3".
const SECTION_HEADER_SUFFIX = '(\\s+\\d{1,2}\\/\\d{1,2})?(\\s*\\d+)?(\\s*\\([^)]*\\))?\\s*[:.]?';
const SECTION_HEADER_PREFIX = '(?:(?:guitar|bass|keyboard|piano|drum|mandolin|banjo|fiddle|harmonica|vocal?s?)\\s+)?';

function stripSectionHeaderMarkup(text) {
  return String(text || '')
    .trim()
    .replace(/^#+\s*/, '')
    // Handwritten / PDF imports often use dash prefixes ("– solo") instead of "#".
    .replace(/^[-–—−•*]\s*/, '')
    // Parenthetical repeat markers such as "(chorus)" between stanzas.
    .replace(/^\(([^)]+)\)$/, '$1')
    .trim();
}

function matchesSectionHeaderText(text) {
  const t = stripSectionHeaderMarkup(text);
  if (!t) return false;
  return new RegExp('^' + SECTION_HEADER_PREFIX + SECTION_HEADER_WORD + SECTION_HEADER_SUFFIX + '$', 'i').test(t);
}

/** Bar / beat placeholders in grids like `||C . . | F . . |` or `D | / |`. */
export function isChordStructureToken(token) {
  const t = String(token == null ? '' : token).trim();
  if (!t) return true;
  if (t === '/') return true;
  return /^[|.:]+$/.test(t);
}

/**
 * True when bracket contents look like a single chord token (e.g. Am, F#m7).
 * Used so lone `[Am]` is not mistaken for a section header.
 */
export function isBracketChordOnly(line) {
  const raw = String(line === null || line === undefined ? '' : line).trim();
  const match = raw.match(/^\[([^\]]+)\]$/);
  if (!match) return false;
  return tokenIsChord(match[1].trim());
}

/**
 * Section markers such as "[Verse 1]", "[Chorus]", "(Outro)", "# Verse", or bare
 * "Verse 2" / "Bridge". A leading markdown-style "#" (optionally repeated) is
 * stripped before matching so "# Verse" / "## Chorus" are recognised.
 *
 * A line that is only text in round brackets (optional surrounding whitespace)
 * is always a section header. Lone chord brackets like `[Am]` / `[F#m7]` are not.
 */
export function isSectionHeader(line) {
  const raw = String(line === null || line === undefined ? '' : line).trim();
  if (!raw) return false;
  if (isBracketChordOnly(raw)) return false;
  if (/^\[.+\]$/.test(raw)) return true;
  // Lone "(Label)" lines — any non-empty parenthetical text on its own line.
  if (/^\([^)]+\)$/.test(raw)) return true;
  if (/^#+\s+\S/.test(raw)) return true;
  return matchesSectionHeaderText(raw);
}

/** Inline ABC signature tokens in chord charts — not chord symbols. */
const INLINE_KEY_RE = /^\[K:\s*[^\]]+\]$/i;
const INLINE_METER_RE = /^\[M:\s*[^\]]+\]$/i;
const INLINE_TEMPO_RE = /^\[Q:\s*[^\]]+\]$/i;

export function isInlineSignatureToken(token) {
  const t = String(token == null ? '' : token).trim();
  if (!t) return false;
  return INLINE_KEY_RE.test(t) || INLINE_METER_RE.test(t) || INLINE_TEMPO_RE.test(t);
}

/** Ordered inline [M:…] meters found in chart text (body or full chart). */
export function inlineMeterTokensInChart(chart) {
  const tokens = [];
  const re = /\[M:\s*([^\]]+)\]/gi;
  const text = String(chart == null ? '' : chart);
  let match;
  while ((match = re.exec(text)) !== null) {
    tokens.push(normalizeMeter(match[1].trim()));
  }
  return tokens;
}

/**
 * Ensure a structure chart block starts with [M:…] for the tune/header meter
 * when no leading meter marker is already present.
 */
export function ensureLeadingMeterMarker(chart, meter) {
  const text = String(chart == null ? '' : chart).trim();
  if (!text) return text;
  const normalized = meter ? normalizeMeter(meter) : '';
  if (!normalized) return text;
  if (/^\[M:\s*[^\]]+\]/i.test(text)) return text;
  return '[M:' + normalized + '] ' + text;
}

/**
 * Parse one structure/chord-chart display line into text, meter, and repeat
 * segments for compact UI rendering.
 * @returns {Array<{type:'text'|'meter'|'repeat', text?:string, num?:string, den?:string, label?:string}>}
 */
export function parseChordChartDisplayLine(line) {
  const raw = String(line == null ? '' : line);
  if (!raw) return [];
  const parts = [];
  const re = /\[M:\s*([^\]]+)\]|:\|:|\|:|:\||\|\]|\[\d+|\d+\./gi;
  let last = 0;
  let match;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', text: raw.slice(last, match.index) });
    }
    const token = match[0];
    if (/^\[M:/i.test(token)) {
      const inner = String(match[1] || '').trim();
      const slash = inner.lastIndexOf('/');
      const num = slash > 0 ? inner.slice(0, slash).trim() : inner;
      const den = slash > 0 ? inner.slice(slash + 1).trim() : '';
      parts.push({
        type: 'meter',
        label: inner || token,
        num: num,
        den: den,
        text: token,
      });
    } else {
      parts.push({ type: 'repeat', text: token });
    }
    last = match.index + token.length;
  }
  if (last < raw.length) {
    parts.push({ type: 'text', text: raw.slice(last) });
  }
  return parts;
}

/** True when inline [M:…] tokens differ between two chart strings. */
export function inlineMeterSignatureChanged(beforeChart, afterChart) {
  const before = inlineMeterTokensInChart(beforeChart).join('\0');
  const after = inlineMeterTokensInChart(afterChart).join('\0');
  return before !== after;
}

/**
 * Normalize a stanza/section name for matching (case/bracket insensitive).
 */
export function normalizeStanzaNameKey(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/^\(([^)]+)\)$/, '$1')
    .replace(/^#+\s*/, '')
    .replace(/^[-–—−•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token overlap similarity for fuzzy stanza name matching (0–1).
 */
export function stanzaNameSimilarity(a, b) {
  const left = normalizeStanzaNameKey(a);
  const right = normalizeStanzaNameKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    return 0.85 + ratio * 0.14;
  }
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = right.split(/\s+/).filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;
  let hits = 0;
  leftTokens.forEach(function(token) {
    if (rightTokens.indexOf(token) >= 0) hits += 1;
  });
  return hits / Math.max(leftTokens.length, rightTokens.length);
}

/**
 * Pick best stanza name match from candidates above minScore.
 */
export function bestStanzaNameMatch(needle, candidates, options) {
  const opts = options || {};
  const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0.85;
  const list = Array.isArray(candidates) ? candidates : [];
  let best = null;
  let bestScore = 0;
  list.forEach(function(candidate, index) {
    const score = stanzaNameSimilarity(needle, candidate.label || candidate.name || candidate);
    if (score >= minScore && score > bestScore) {
      bestScore = score;
      best = { index: index, score: score, candidate: candidate };
    }
  });
  return best;
}

/**
 * True when a grid token is a section title marker (# Title or [Title] section header).
 */
export function isSectionMarkerToken(token) {
  const raw = String(token == null ? '' : token).trim();
  if (!raw) return false;
  if (tokenIsChord(raw)) return false;
  if (isInlineSignatureToken(raw)) return false;
  if (tokenIsChartStructureMarker(raw)) return false;
  if (/^#+\s+/.test(raw) && isSectionHeader(raw)) return true;
  if (/^\[.+\]$/.test(raw) && isSectionHeader(raw)) return true;
  return isSectionHeader(raw);
}

/**
 * True when an ABC quoted chord name is a section label (e.g. [Verse 1]).
 */
export function isSectionMarkerChordName(name) {
  const raw = String(name == null ? '' : name).trim();
  if (!raw) return false;
  const inner = raw.replace(/^"+|"+$/g, '').trim();
  if (tokenIsChord(inner)) return false;
  if (/^\[.+\]$/.test(inner)) return isSectionHeader(inner);
  return isSectionHeader(inner);
}

/**
 * Format section title as editor chart header line (# Title).
 */
export function sectionMarkerChartLine(header) {
  const raw = String(header == null ? '' : header).trim();
  if (!raw) return '';
  if (/^#+\s+/.test(raw)) return raw;
  if (/^\[.+\]$/.test(raw)) {
    const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
    return '# ' + inner;
  }
  if (/^\([^)]+\)$/.test(raw)) {
    const inner = raw.replace(/^\(/, '').replace(/\)$/, '').trim();
    return inner ? '# ' + inner : '';
  }
  return '# ' + raw;
}

/**
 * Bracket form for ABC section marker chord name ([Title]).
 */
export function sectionMarkerAbcChordName(header) {
  const raw = String(header == null ? '' : header).trim();
  if (!raw) return '';
  if (/^\[.+\]$/.test(raw)) return raw;
  if (/^#+\s+/.test(raw)) {
    const inner = raw.replace(/^#+\s*/, '').trim();
    return inner ? '[' + inner + ']' : '';
  }
  if (/^\([^)]+\)$/.test(raw)) {
    const inner = raw.replace(/^\(/, '').replace(/\)$/, '').trim();
    return inner ? '[' + inner + ']' : '';
  }
  return '[' + raw + ']';
}

/**
 * True when melody ABC text already contains a section-label quoted chord for header.
 */
export function melodyTextHasSectionMarkerChord(melodyText, header) {
  const text = String(melodyText == null ? '' : melodyText);
  const expected = sectionMarkerAbcChordName(header);
  if (!expected) return false;
  const expectedKey = normalizeStanzaNameKey(expected);
  const re = /"([^"]*)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (!isSectionMarkerChordName(match[1])) continue;
    const marker = sectionMarkerAbcChordName(match[1]);
    if (marker === expected) return true;
    if (expectedKey && normalizeStanzaNameKey(marker) === expectedKey) return true;
  }
  return false;
}

/**
 * First section-label quoted chord in melody text, as normalized bracket header.
 */
export function firstSectionMarkerHeaderInMelodyText(melodyText) {
  const text = String(melodyText == null ? '' : melodyText);
  const re = /"([^"]*)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (!isSectionMarkerChordName(match[1])) continue;
    const header = sectionMarkerAbcChordName(match[1]);
    if (header) return header;
  }
  return '';
}

/**
 * Split optional first-line # section marker from chart body.
 */
export function splitChartHeaderAndBody(chart) {
  const text = String(chart == null ? '' : chart);
  const lines = text.split('\n');
  if (!lines.length) return { headerLine: '', body: '' };
  const first = String(lines[0] || '').trim();
  if (first && (isSectionMarkerToken(first) || (/^#+\s+/.test(first) && isSectionHeader(first)))) {
    return {
      headerLine: first,
      body: lines.slice(1).join('\n').replace(/^\n+/, ''),
    };
  }
  return { headerLine: '', body: text };
}

export function joinChartHeaderAndBody(headerLine, body) {
  const header = String(headerLine == null ? '' : headerLine).trim();
  const chartBody = String(body == null ? '' : body).trim();
  if (!header) return chartBody;
  if (!chartBody) return header;
  return header + '\n' + chartBody;
}

/**
 * Rebalance chart bars to unitSlotsPerBar pulse slots per effective meter.
 * @returns {{ chart: string, droppedChords: string[] }}
 */
export function rebalanceChartPulseSlots(chart, defaultMeter, noteLength) {
  const meterFallback = defaultMeter || '4/4';
  const lengthFallback = noteLength || defaultNoteLengthForMeter(meterFallback);
  const droppedChords = [];
  const split = splitChartHeaderAndBody(chart);
  let currentMeter = meterFallback;
  let currentLength = lengthFallback;

  function slotsForMeter(m) {
    return getBarModel(m, currentLength).unitSlotsPerBar;
  }

  function normalizeBarTokens(barText, meter) {
    const targetSlots = slotsForMeter(meter);
    const tokens = String(barText || '').trim().split(/\s+/).filter(Boolean);
    const meta = [];
    const slots = [];

    tokens.forEach(function(token) {
      if (INLINE_METER_RE.test(token)) {
        currentMeter = token.replace(/^\[M:\s*/i, '').replace(/\]$/, '').trim();
        meta.push(token);
      } else if (INLINE_KEY_RE.test(token) || INLINE_TEMPO_RE.test(token)) {
        meta.push(token);
      } else if (isSectionMarkerToken(token)) {
        meta.push(token);
      } else if (tokenIsChartStructureMarker(token)) {
        meta.push(token);
      } else if (token === '.' || token === '/') {
        slots.push(null);
      } else if (tokenIsChord(token)) {
        slots.push(token);
      } else if (token.replace(/\./g, '').trim() === '') {
        slots.push(null);
      }
    });

    if (slots.length > targetSlots) {
      for (let i = targetSlots; i < slots.length; i += 1) {
        if (slots[i]) droppedChords.push(slots[i]);
      }
      slots.length = targetSlots;
    } else if (slots.length < targetSlots) {
      while (slots.length < targetSlots) slots.push(null);
    }

    const out = meta.slice();
    slots.forEach(function(chord) {
      out.push(chord || '.');
    });
    return out.join(' ');
  }

  const bodyLines = String(split.body || '').split('\n');
  const outLines = bodyLines.map(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return line;
    const parts = splitChordChartLineIntoBars(trimmed);
    const segments = [];
    parts.bars.forEach(function(bar, i) {
      const meterMatch = /\[M:\s*([^\]]+)\]/i.exec(bar);
      if (meterMatch) {
        currentMeter = meterMatch[1].trim();
      }
      let segment = normalizeBarTokens(bar, currentMeter);
      const close = parts.barlines[i] || '|';
      if (close === '|:') {
        segment = '|: ' + segment;
      }
      segments.push(segment);
    });
    return segments.join(' | ') + (segments.length ? ' |' : '');
  });

  const body = outLines.join('\n').trim();
  return {
    chart: joinChartHeaderAndBody(split.headerLine, body),
    droppedChords: droppedChords,
  };
}

/**
 * Expand legacy beat-level bars (4 tokens in 4/4) to full pulse-slot grids.
 */
export function expandLegacyBeatSlotsInChart(chart, defaultMeter, noteLength) {
  const split = splitChartHeaderAndBody(chart);
  const meterFallback = defaultMeter || '4/4';
  const lengthFallback = noteLength || defaultNoteLengthForMeter(meterFallback);
  let currentMeter = meterFallback;

  function expandBarTokens(barText) {
    const model = getBarModel(currentMeter, lengthFallback);
    const unitSlots = model.unitSlotsPerBar;
    const beatCount = model.beatCount;
    const beatUnitSlots = model.beatUnitSlots;
    if (unitSlots <= beatCount) return barText;

    const meta = [];
    const tokens = [];
    String(barText || '').trim().split(/\s+/).filter(Boolean).forEach(function(token) {
      if (INLINE_METER_RE.test(token)) {
        currentMeter = token.replace(/^\[M:\s*/i, '').replace(/\]$/, '').trim();
        meta.push(token);
      } else if (INLINE_KEY_RE.test(token) || INLINE_TEMPO_RE.test(token)) {
        meta.push(token);
      } else if (isSectionMarkerToken(token)) {
        meta.push(token);
      } else if (tokenIsChartStructureMarker(token)) {
        meta.push(token);
      } else {
        tokens.push(token);
      }
    });

    if (tokens.length !== beatCount) return barText;

    const slots = new Array(unitSlots);
    for (let i = 0; i < unitSlots; i += 1) slots[i] = '.';
    tokens.forEach(function(token, index) {
      const pulse = index * beatUnitSlots;
      if (pulse < unitSlots) slots[pulse] = token;
    });
    const body = slots.join(' ');
    return meta.length ? meta.join(' ') + ' ' + body : body;
  }

  const bodyLines = String(split.body || '').split('\n');
  const outLines = bodyLines.map(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return line;
    const parts = splitChordChartLineIntoBars(trimmed);
    const segments = [];
    parts.bars.forEach(function(bar, i) {
      const meterMatch = /\[M:\s*([^\]]+)\]/i.exec(bar);
      if (meterMatch) {
        currentMeter = meterMatch[1].trim();
      }
      let segment = expandBarTokens(bar);
      const close = parts.barlines[i] || '|';
      if (close === '|:') {
        segment = '|: ' + segment;
      }
      segments.push(segment);
    });
    return segments.join(' | ') + (segments.length ? ' |' : '');
  });

  const body = outLines.join('\n').trim();
  return joinChartHeaderAndBody(split.headerLine, body);
}

/**
 * Remove adjacent duplicate inline signature tokens at the chart start.
 */
export function dedupeLeadingInlineSignatureDuplicates(chart) {
  let text = String(chart == null ? '' : chart).trim();
  let prev = null;
  while (true) {
    const match = /^(\[(?:K|M|Q):[^\]]+\])\s+(\[(?:K|M|Q):[^\]]+\])/i.exec(text);
    if (!match || match[1].toUpperCase() !== match[2].toUpperCase()) break;
    text = match[1] + text.slice(match[0].length);
    if (prev === text) break;
    prev = text;
  }
  return text;
}

/** Remove section-label quoted chords from staff preview ABC (display only). */
export function stripSectionMarkerChordsFromDisplayAbc(abcText) {
  return String(abcText || '').replace(/"([^"]+)"/g, function(match, inner) {
    return isSectionMarkerChordName(inner) ? '' : match;
  });
}

/** ChordPro-style inline chord marker: [Am], [F#m7], [C/G], … */
const CHORDPRO_INLINE_CHORD_RE = /\[([A-G][#b]?[^\]\n]*)\]/g;

/**
 * True when a single line contains ChordPro inline chords like `[Am]word`
 * (not a bare section header).
 */
export function lineHasChordProInlineChords(line) {
  const raw = String(line === null || line === undefined ? '' : line);
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isSectionHeader(trimmed)) return false;
  CHORDPRO_INLINE_CHORD_RE.lastIndex = 0;
  let match;
  while ((match = CHORDPRO_INLINE_CHORD_RE.exec(raw)) !== null) {
    const inner = String(match[1] || '').trim();
    if (tokenIsChord(inner)) return true;
  }
  return false;
}

/**
 * True when any lyric line embeds ChordPro `[Am]lyric` markers.
 */
export function linesHaveChordProInlineChords(lines) {
  return (Array.isArray(lines) ? lines : []).some(lineHasChordProInlineChords);
}

/**
 * Tokenize a ChordPro lyric line into ChordProLines tokens
 * `{ chord, text }` (chord floats above the following lyric fragment).
 *
 * Example: `[G]Amazing grace how [C]sweet` →
 *   [{ chord: 'G', text: 'Amazing grace how ' }, { chord: 'C', text: 'sweet' }]
 */
export function parseChordProInlineLyricLine(line) {
  const raw = String(line === null || line === undefined ? '' : line);
  if (!raw) return [];
  if (isSectionHeader(raw.trim())) {
    return [{ chord: '', text: raw.trim() }];
  }

  const tokens = [];
  let lastIndex = 0;
  let pendingChord = '';
  CHORDPRO_INLINE_CHORD_RE.lastIndex = 0;
  let match;
  while ((match = CHORDPRO_INLINE_CHORD_RE.exec(raw)) !== null) {
    const inner = String(match[1] || '').trim();
    const isChord = tokenIsChord(inner);
    if (!isChord) continue;

    const before = raw.slice(lastIndex, match.index);
    if (before || pendingChord) {
      tokens.push({ chord: pendingChord, text: before });
      pendingChord = '';
    } else if (tokens.length === 0 && match.index === 0) {
      // Chord at start: attach to following text in next push.
    }
    pendingChord = inner;
    lastIndex = match.index + match[0].length;
  }

  const trailing = raw.slice(lastIndex);
  if (pendingChord || trailing) {
    tokens.push({ chord: pendingChord, text: trailing });
  }

  if (tokens.length === 0) {
    return [{ chord: '', text: raw }];
  }
  return tokens;
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
 * Require every non-structure token to be a chord (lyrics must not pass).
 * Barlines and beat dots are ignored so grids like `||C . . | F . . |` count.
 */
function chordTokensAllParse(tokens) {
  let chordCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (isChordStructureToken(tokens[i])) continue;
    if (!tokenIsChord(tokens[i])) return false;
    chordCount += 1;
  }
  return chordCount > 0;
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
 * every-token-is-a-chord rule. Structure tokens (|, .) are ignored.
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
  let contentCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (isChordStructureToken(tokens[i])) continue;
    contentCount += 1;
    if (tokenIsChord(tokens[i])) chordCount += 1;
  }
  return chordCount >= 2 && chordCount * 2 > contentCount;
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
 * Lyric lines carry embedded chord placement (COW rows or ChordPro `[Am]`).
 */
export function hasLyricEmbeddedChords(lines) {
  return hasChordLines(lines) || linesHaveChordProInlineChords(lines);
}

/**
 * Remove chord-only lines and inline ChordPro `[Am]` markers from lyric text.
 */
export function stripChordsFromLyricLines(lines) {
  const source = Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/);
  const result = [];
  classifyLyricChordLines(source).forEach(function(item) {
    if (item.type === 'chord') return;
    if (item.type === 'blank') {
      result.push('');
      return;
    }
    if (item.type === 'header') {
      result.push(item.text);
      return;
    }
    const plain = parseChordProInlineLyricLine(item.text)
      .map(function(token) { return token.text; })
      .join('');
    if (!plain.trim() && item.text.trim()) return;
    result.push(plain);
  });
  return result;
}

/**
 * True when the source uses two consecutive blank lines somewhere (stanza
 * separator in double-spaced verse sheets).
 */
function sourceUsesDoubleBlankStanzas(lines) {
  const source = Array.isArray(lines) ? lines : [];
  let start = 0;
  let end = source.length;
  while (start < end && !String(source[start] == null ? '' : source[start]).trim()) start += 1;
  while (end > start && !String(source[end - 1] == null ? '' : source[end - 1]).trim()) end -= 1;
  let blankRun = 0;
  for (let i = start; i < end; i++) {
    const line = source[i] === null || source[i] === undefined ? '' : String(source[i]);
    if (line.trim().length === 0) {
      blankRun += 1;
      if (blankRun >= 2) return true;
    } else {
      blankRun = 0;
    }
  }
  return false;
}

/**
 * Legacy UG/ChordPro sheets run verse lines together without blanks between them.
 */
function hasConsecutiveNonemptyLyricLines(lines) {
  const source = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < source.length - 1; i++) {
    const line = String(source[i] == null ? '' : source[i]).trim();
    const next = String(source[i + 1] == null ? '' : source[i + 1]).trim();
    if (line && next && !isSectionHeader(line) && !isSectionHeader(next)) {
      return true;
    }
  }
  return false;
}

/**
 * Per-line double spacing: most non-header lines are immediately followed by a blank.
 */
function sourceUsesPerLineDoubleSpacing(lines) {
  const source = Array.isArray(lines) ? lines : [];
  let followedByBlank = 0;
  let followedByNonempty = 0;
  for (let i = 0; i < source.length - 1; i++) {
    const line = String(source[i] == null ? '' : source[i]).trim();
    if (!line || isSectionHeader(line)) continue;
    const next = String(source[i + 1] == null ? '' : source[i + 1]).trim();
    if (!next) followedByBlank += 1;
    else followedByNonempty += 1;
  }
  if (followedByBlank < 2) return false;
  // Three or more line-blank pairs suggests multi-line stanzas doubled per line.
  if (followedByBlank >= 3) return true;
  // Two line-blank pairs with no consecutive lines is usually separate one-line verses.
  if (followedByBlank === 2 && followedByNonempty === 0) return false;
  return followedByBlank > followedByNonempty;
}

/**
 * Whether single blank lines are soft spacing inside a verse rather than stanza breaks.
 */
export function shouldSoftJoinSingleBlanks(lines) {
  const source = Array.isArray(lines) ? lines : [];
  // Multi-line stanzas (consecutive nonempty lyric lines) plus section headers:
  // single blanks are stanza breaks. A stray double blank after a title/meta
  // line must not soft-join and glue unlabeled verses onto # Chorus bodies.
  if (hasConsecutiveNonemptyLyricLines(source) && sourceHasSectionHeader(source)) {
    return false;
  }
  if (sourceUsesDoubleBlankStanzas(source)) return true;
  if (hasConsecutiveNonemptyLyricLines(source)) return false;
  return sourceUsesPerLineDoubleSpacing(source);
}

function sourceHasSectionHeader(lines) {
  const source = Array.isArray(lines) ? lines : [];
  for (let i = 0; i < source.length; i++) {
    if (isSectionHeader(source[i])) return true;
  }
  return false;
}

/**
 * Split an array of lines into blocks.
 * When the sheet uses double blank lines between stanzas, a single blank is
 * treated as soft spacing inside a verse (dropped). Otherwise any blank still
 * starts a new block (legacy ChordPro / UG style).
 */
function isNonLyricMetadataLine(line) {
  const t = String(line == null ? '' : line).trim();
  if (!t) return false;
  return /^https?:\/\//i.test(t);
}

export function splitIntoBlocks(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const softSingleBlanks = shouldSoftJoinSingleBlanks(source);
  const blocks = [];
  let current = [];
  let blankRun = 0;

  source.forEach(function(raw) {
    const line = raw === null || raw === undefined ? '' : String(raw);
    if (isNonLyricMetadataLine(line)) return;
    if (line.trim().length === 0) {
      blankRun += 1;
      if (!softSingleBlanks) {
        if (current.length > 0) {
          blocks.push(current);
          current = [];
        }
        return;
      }
      if (blankRun >= 2 && current.length > 0) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    blankRun = 0;
    current.push(line);
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * When a blank line sits between a section header and its lyrics, splitIntoBlocks
 * leaves a header-only block. Attach that header to the following lyric block.
 */
function isRepeatSectionHeader(header) {
  const type = normalizeSectionType(header);
  return type === 'chorus' || type === 'refrain';
}

/** Bare "(chorus)" / "[Chorus]" markers between stanzas — not "Chorus 1" with following lyrics. */
function isBareRepeatSectionHeader(header) {
  if (!isRepeatSectionHeader(header)) return false;
  const stripped = stripSectionHeaderMarkup(header).toLowerCase();
  return !/\b\d+\b/.test(stripped);
}

export function coalesceSectionHeaderBlocks(blocks) {
  const merged = [];
  const source = Array.isArray(blocks) ? blocks : [];
  for (let i = 0; i < source.length; i++) {
    const block = source[i];
    const next = source[i + 1];
    if (block.length === 1 && isSectionHeader(block[0]) && next && next.length > 0 && !isSectionHeader(next[0])
        && !isBareRepeatSectionHeader(block[0])) {
      merged.push([block[0]].concat(next));
      i += 1;
    } else if (block.length > 0) {
      merged.push(block);
    }
  }
  return merged;
}

/**
 * Attach chord-only rows to the nearest lyric block so they do not stand alone.
 */
export function mergeChordOnlyRowsIntoBlocks(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const result = [];

  function blockIsChordOnly(lines) {
    const body = (Array.isArray(lines) ? lines : []).filter(function(line) {
      return String(line || '').trim().length > 0 && !isSectionHeader(line);
    });
    if (!body.length) return false;
    return body.every(function(line) {
      const classified = classifyLyricChordLines([line])[0];
      return classified && classified.type === 'chord';
    });
  }

  source.forEach(function(block) {
    const lines = Array.isArray(block) ? block.slice() : [];
    if (!lines.length) return;
    if (blockIsChordOnly(lines) && result.length > 0) {
      const prev = result[result.length - 1];
      lines.forEach(function(line) {
        if (String(line || '').trim()) prev.push(line);
      });
      return;
    }
    result.push(lines);
  });

  for (let i = 0; i < result.length - 1; i++) {
    if (!blockIsChordOnly(result[i])) continue;
    result[i + 1] = result[i].concat(result[i + 1]);
    result.splice(i, 1);
    i -= 1;
  }

  return result;
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

function stanzaMatchesAt(normalizedBody, stanza, offset) {
  if (offset + stanza.length > normalizedBody.length) return false;
  for (let j = 0; j < stanza.length; j++) {
    if (normalizedBody[offset + j] !== stanza[j]) return false;
  }
  return true;
}

/**
 * When an earlier stanza (typically the chorus) is repeated later in the text
 * without blank lines around it, split it out of the surrounding block so it
 * behaves like a blank-line-separated stanza.
 */
export function splitEmbeddedRepeatedStanzas(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const seen = [];
  const result = [];

  function registerStanza(bodyLines) {
    const key = bodyLines.map(normalizeTextForMatch);
    if (key.length >= 2 && key.every(Boolean)) seen.push(key);
  }

  source.forEach(function(block) {
    const lines = Array.isArray(block) ? block : [];
    let header = null;
    let body = lines;
    if (lines.length > 0 && isSectionHeader(lines[0])) {
      header = lines[0];
      body = lines.slice(1);
    }
    const normalized = body.map(normalizeTextForMatch);

    const segments = [];
    let cursor = 0;
    let i = 0;
    while (i < normalized.length) {
      let matchLen = 0;
      for (let s = 0; s < seen.length; s++) {
        if (seen[s].length > matchLen && stanzaMatchesAt(normalized, seen[s], i)) {
          matchLen = seen[s].length;
        }
      }
      // A match spanning the whole block is already its own stanza.
      if (matchLen > 0 && !(i === 0 && matchLen === body.length)) {
        if (i > cursor) segments.push(body.slice(cursor, i));
        segments.push(body.slice(i, i + matchLen));
        i += matchLen;
        cursor = i;
      } else {
        i += 1;
      }
    }
    if (cursor < body.length) segments.push(body.slice(cursor));

    if (segments.length <= 1 && cursor === 0) {
      result.push(block);
      registerStanza(body);
      return;
    }
    segments.forEach(function(segment, index) {
      result.push(index === 0 && header ? [header].concat(segment) : segment);
      registerStanza(segment);
    });
  });

  return result;
}

/**
 * Chorus / refrain / hook sections commonly alternate with unlabeled verses.
 * Do not swallow those verses across blank lines into the preceding chorus.
 * Mid-paragraph blanks still merge inside verse (and similar) sections.
 */
function absorbsMidVerseContinuations(header) {
  const type = normalizeSectionType(header);
  return type !== 'chorus' && type !== 'refrain' && type !== 'hook';
}

/**
 * When lyrics use section headers, blank lines mid-verse should not start a new
 * stanza. Absorb unlabeled blocks that sit before a later labeled section into
 * the preceding labeled block (paragraph breaks inside Verse).
 * Chorus/refrain/hook sections do not absorb — unlabeled stanzas after a blank
 * stay separate so verse/chorus alternation can be inferred.
 * Only sections that already have body lines absorb continuations — wordless
 * "(chorus)" / "# Chorus" markers stay empty for repeat expansion.
 * Trailing unlabeled blocks with no later header stay separate (orphan outro).
 */
export function mergeMidVerseContinuations(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const hasHeader = source.some(function(block) {
    return block && block.length > 0 && isSectionHeader(block[0]);
  });
  if (!hasHeader || source.length < 2) {
    return source.map(function(block) {
      return Array.isArray(block) ? block.slice() : [];
    });
  }

  function blockHasHeader(block) {
    return block && block.length > 0 && isSectionHeader(block[0]);
  }

  function hasLaterHeader(fromIndex) {
    for (let k = fromIndex; k < source.length; k++) {
      if (blockHasHeader(source[k])) return true;
    }
    return false;
  }

  const result = [];
  let i = 0;
  while (i < source.length) {
    const block = Array.isArray(source[i]) ? source[i].slice() : [];
    result.push(block);
    // Only sections that already have lyric lines absorb paragraph breaks.
    // Wordless "(chorus)" / "# Chorus" markers must stay empty for expand/repeat.
    // Chorus bodies never absorb — that would glue following unlabeled verses in.
    if (blockHasHeader(block) && block.length > 1 && absorbsMidVerseContinuations(block[0])) {
      let j = i + 1;
      while (j < source.length && !blockHasHeader(source[j]) && hasLaterHeader(j)) {
        const continuation = Array.isArray(source[j]) ? source[j] : [];
        continuation.forEach(function(line) {
          block.push(line);
        });
        j += 1;
      }
      i = j;
      continue;
    }
    i += 1;
  }
  return result;
}

export function normalizeLyricBlocks(lyricLines) {
  return splitEmbeddedRepeatedStanzas(splitBlocksOnInteriorHeaders(
    mergeMidVerseContinuations(
      mergeChordOnlyRowsIntoBlocks(
        coalesceSectionHeaderBlocks(splitIntoBlocks(lyricLines))
      )
    )
  ));
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
const KNOWN_SECTION_TYPES = {
  verse: true,
  chorus: true,
  bridge: true,
  intro: true,
  outro: true,
  prechorus: true,
  refrain: true,
  coda: true,
  tag: true,
  instrumental: true,
  solo: true,
  interlude: true,
  hook: true,
};

export function normalizeSectionType(header) {
  if (!header) return null;
  const stripped = stripSectionHeaderMarkup(String(header));
  const cleaned = stripped.toLowerCase().replace(/[[\]]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').trim();
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/)[0] || '';
  if (first.indexOf('pre') === 0) return 'prechorus';
  // Verse / Verse 2 / Verse2 / v1 / v2 → same stanza type so they share a chart.
  if (/^v\d+$/i.test(first)) return 'verse';
  if (/^verse\d*$/i.test(first)) return 'verse';
  if (KNOWN_SECTION_TYPES[first]) return first;
  // Slug fallback like "verse-2" from odd punctuation still counts as verse.
  if (/^verse([-\s]?\d+)?$/i.test(cleaned.replace(/\s+/g, '-'))) return 'verse';
  return cleaned.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || null;
}

/**
 * Soft-wrap a chord grid so bars run down the page (default 8 bars per line).
 * Preserves blank lines as section breaks (`||` strain separators).
 */
export function wrapChordGridBars(chordGridText, barsPerLine) {
  const perLine = Math.max(1, parseInt(barsPerLine, 10) || 8);
  const source = String(chordGridText == null ? '' : chordGridText);
  if (!source.trim()) return '';

  function wrapSection(sectionText) {
    const trimmed = String(sectionText || '').trim();
    if (!trimmed) return '';
    // Split on barlines while keeping content; count closed bars.
    const parts = trimmed.split('|').map(function(part) { return part.trim(); });
    // Trailing empty from ending |
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    if (parts.length === 0) return '';
    const lines = [];
    for (let i = 0; i < parts.length; i += perLine) {
      const chunk = parts.slice(i, i + perLine);
      lines.push(chunk.join(' | ') + ' |');
    }
    return lines.join('\n');
  }

  return source
    .split(/\n\s*\n/)
    .map(wrapSection)
    .filter(Boolean)
    .join('\n\n');
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

/**
 * Single-line bibliographic title/composer leftovers must not become [Bridge]
 * when verse/chorus lengths are already known from labeled stanzas.
 */
function isTitleOrMetaLeftoverBlock(block) {
  const body = blockBodyLines(block).filter(function(line) {
    return String(line == null ? '' : line).trim().length > 0;
  });
  if (body.length !== 1) return false;
  return isLeadingTitleComposerLine(body[0], { firstBlockLineCount: 1 });
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

function ordinalForInferredType(blocks, blockIndex, type) {
  const used = Object.create(null);
  (Array.isArray(blocks) ? blocks : []).forEach(function(b, i) {
    if (!b || b.type !== type || i === blockIndex) return;
    const header = String(b.header || '');
    const numMatch = header.match(/\b(\d+)\s*\]/);
    if (numMatch) {
      used[parseInt(numMatch[1], 10)] = true;
    } else if (header) {
      used[1] = true;
    }
  });
  let ordinal = 1;
  while (used[ordinal]) ordinal += 1;
  return ordinal;
}

function assignInferredType(blocks, blockIndex, type) {
  const block = Array.isArray(blocks) ? blocks[blockIndex] : null;
  if (!block || block.type || !type) return false;
  const ordinal = ordinalForInferredType(blocks, blockIndex, type);
  const label = sectionTypeDisplayLabel(type);
  block.type = type;
  block.header = ordinal === 1 ? '[' + label + ']' : '[' + label + ' ' + ordinal + ']';
  return true;
}

function collectGrowingVerseLengths(lengths, verseLen, chorusLen) {
  const growing = Object.create(null);
  if (!(verseLen > 0) || !(chorusLen > 0)) return growing;
  growing[verseLen] = true;
  let lastVerse = verseLen;
  for (let i = 0; i < lengths.length - 1; i++) {
    if (lengths[i] !== chorusLen) continue;
    const nextLen = lengths[i + 1];
    if (nextLen === chorusLen) continue;
    if (nextLen === lastVerse + 1) {
      growing[nextLen] = true;
      lastVerse = nextLen;
    } else if (growing[nextLen]) {
      lastVerse = nextLen;
    }
  }
  return Object.keys(growing).length > 2 ? growing : Object.create(null);
}

function inferChorusFirstFromMarkers(blocks, lengths, lengthToType) {
  if (!Array.isArray(blocks) || blocks.length < 3) return false;
  const first = blocks[0];
  const second = blocks[1];
  const marker = blocks[2];
  if (!first || first.type || !second || second.type) return false;
  if (lengths[0] !== lengths[1] || !(lengths[0] > 0)) return false;
  if (!marker || marker.type !== 'chorus' || nonEmptyLineCount(marker) > 0) return false;
  first.type = 'chorus';
  first.header = '[Chorus]';
  assignInferredType(blocks, 1, 'verse');
  seedLengthToType(lengthToType, lengths[1], 'verse');
  return true;
}

function inferVersesAfterChorusMarkers(blocks, lengths) {
  let verseLen = null;
  blocks.forEach(function(b, i) {
    if (b && b.type === 'verse' && verseLen === null) verseLen = lengths[i];
  });
  if (!(verseLen > 0)) return;
  blocks.forEach(function(b, i) {
    if (!b || b.type) return;
    if (lengths[i] === verseLen) assignInferredType(blocks, i, 'verse');
  });
}

/**
 * When at least one chorus has an explicit section header, label remaining
 * untyped blocks as verses. If a verse is already labeled, only fill untyped
 * blocks that match that verse's line count (so Verse 2 headers still allow
 * unlabeled Verse 1 / Verse 3 to be claimed).
 */
function inferVersesWhenChorusIsLabeled(blocks) {
  const hasLabeledChorus = blocks.some(function(b) {
    return b && b.type === 'chorus' && isSectionHeader(String(b.header || '').trim());
  });
  if (!hasLabeledChorus) return;

  let verseLen = null;
  blocks.forEach(function(b) {
    if (!b || b.type !== 'verse') return;
    const n = nonEmptyLineCount(b);
    if (n > 0 && verseLen == null) verseLen = n;
  });

  blocks.forEach(function(b, i) {
    if (!b || b.type) return;
    const n = nonEmptyLineCount(b);
    if (n <= 0) return;
    if (verseLen == null || n === verseLen) {
      assignInferredType(blocks, i, 'verse');
    }
  });
}

function finishSectionTypeInference(blocks, lengths, chorusFirstApplied) {
  if (chorusFirstApplied) inferVersesAfterChorusMarkers(blocks, lengths);
  inferVersesWhenChorusIsLabeled(blocks);
  return blocks;
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

function applyAlternationTypes(blocks, lengths, verseLen, chorusLen, lengthToType) {
  lengthToType[verseLen] = 'verse';
  lengthToType[chorusLen] = 'chorus';
  const growingVerseLengths = collectGrowingVerseLengths(lengths, verseLen, chorusLen);
  blocks.forEach(function(b, i) {
    if (!b || b.type) return;
    const n = lengths[i];
    let type = lengthToType[n];
    if (!type && growingVerseLengths[n]) type = 'verse';
    if (!type) {
      if (isTitleOrMetaLeftoverBlock(b)) return;
      type = 'bridge';
      lengthToType[n] = 'bridge';
    }
    assignInferredType(blocks, i, type);
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
  const lengthToType = Object.create(null);
  let chorusFirstApplied = false;

  blocks.forEach(function(b, i) {
    if (b && b.type) seedLengthToType(lengthToType, lengths[i], b.type);
  });

  if (inferChorusFirstFromMarkers(blocks, lengths, lengthToType)) {
    chorusFirstApplied = true;
  }

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
      assignInferredType(blocks, i, bodyToType[key]);
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
  if (verseLen === null && chorusLen !== null) {
    const hasLabeledChorus = blocks.some(function(b) {
      return b && b.type === 'chorus' && isSectionHeader(String(b.header || '').trim());
    });
    const hasLabeledVerse = blocks.some(function(b) {
      return b && b.type === 'verse' && isSectionHeader(String(b.header || '').trim());
    });
    if (hasLabeledChorus && !hasLabeledVerse) {
      const untypedCounts = Object.create(null);
      blocks.forEach(function(b, i) {
        if (!b || b.type || lengths[i] === chorusLen) return;
        untypedCounts[lengths[i]] = (untypedCounts[lengths[i]] || 0) + 1;
      });
      let bestLen = null;
      let bestCount = 0;
      Object.keys(untypedCounts).forEach(function(key) {
        const count = untypedCounts[key];
        if (count > bestCount) {
          bestCount = count;
          bestLen = Number(key);
        }
      });
      if (bestLen != null) {
        verseLen = bestLen;
        seedLengthToType(lengthToType, bestLen, 'verse');
      }
    }
  }

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
    const growingVerseLengths = collectGrowingVerseLengths(lengths, verseLen, chorusLen);
    if (Object.keys(growingVerseLengths).length > 0) {
      blocks.forEach(function(b, i) {
        if (!b || b.type) return;
        const n = lengths[i];
        if (growingVerseLengths[n]) assignInferredType(blocks, i, 'verse');
        else if (n === chorusLen) assignInferredType(blocks, i, 'chorus');
      });
      return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
    }
    const patternRepeats = (verseAppearances >= 2 && chorusAppearances >= 2) || returnedToVerse;
    if (patternRepeats) {
      blocks.forEach(function(b, i) {
        if (!b || b.type) return;
        const n = lengths[i];
        if (n === verseLen) assignInferredType(blocks, i, 'verse');
        else if (n === chorusLen) assignInferredType(blocks, i, 'chorus');
        else if (!isTitleOrMetaLeftoverBlock(b)) assignInferredType(blocks, i, 'bridge');
      });
    } else {
      blocks.forEach(function(b, i) {
        if (!b || b.type) return;
        const n = lengths[i];
        if (n !== verseLen && n !== chorusLen && !isTitleOrMetaLeftoverBlock(b)) {
          assignInferredType(blocks, i, 'bridge');
        }
      });
    }
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
  }

  const stillUntyped = blocks.some(function(b) { return b && !b.type; });
  if (!stillUntyped) {
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
  }

  // Alternation fallback — establish missing verse/chorus lengths
  if (verseLen === null && chorusLen === null) {
    const unique = [];
    lengths.forEach(function(n) {
      if (unique.indexOf(n) === -1) unique.push(n);
    });
    if (unique.length < 2) return blocks;

    // Chorus is usually shorter than the verse: when the first stanza is the
    // shorter of the two alternating lengths, treat it as the chorus.
    const firstIsShorter = unique[0] < unique[1];
    const altVerse = firstIsShorter ? unique[1] : unique[0];
    const altChorus = firstIsShorter ? unique[0] : unique[1];
    let seenSecond = false;
    let returnedToFirst = false;
    for (let i = 0; i < lengths.length; i++) {
      const n = lengths[i];
      if (n === unique[1]) seenSecond = true;
      else if (seenSecond && n === unique[0]) {
        returnedToFirst = true;
        break;
      }
    }
    if (!returnedToFirst) {
      return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
    }
    applyAlternationTypes(blocks, lengths, altVerse, altChorus, lengthToType);
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
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
  if (otherLen === null) {
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
  }

  let otherCount = 0;
  let knownCount = 0;
  lengths.forEach(function(n) {
    if (n === otherLen) otherCount += 1;
    if (n === knownLen) knownCount += 1;
  });
  // One untyped stanza before the only labeled section (common in hymns) stays unlabeled.
  if (otherCount < 2 && knownCount < 2) {
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
  }

  let seenOther = false;
  let returnedToKnown = false;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] === otherLen) seenOther = true;
    else if (seenOther && lengths[i] === knownLen) {
      returnedToKnown = true;
      break;
    }
  }
  if (!returnedToKnown) {
    return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
  }

  if (otherType === 'verse') {
    applyAlternationTypes(blocks, lengths, otherLen, knownLen, lengthToType);
  } else {
    applyAlternationTypes(blocks, lengths, knownLen, otherLen, lengthToType);
  }
  return finishSectionTypeInference(blocks, lengths, chorusFirstApplied);
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
    if (fp && fpToType[fp]) assignInferredType(blocks, i, fpToType[fp]);
  });

  return blocks;
}

function normalizeTextForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BIBLIOGRAPHIC_YEAR_RE = /\b(?:19|20)\d{2}\b/;

/**
 * Freeform "Title - Artist 2020" / "Title by Artist (2019)" / "Title, Artist, 2015"
 * metadata often pasted as the first lyric line.
 */
function looksLikeTitleComposerDateLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.length > 140) return false;
  if (!BIBLIOGRAPHIC_YEAR_RE.test(raw)) return false;
  if (/\s+-\s+/.test(raw) || /\s+by\s+/i.test(raw)) return true;
  if (/,\s*.+\s*,/.test(raw)) return true;
  if (/\(\s*(?:19|20)\d{2}\s*\)\s*$/.test(raw)) return true;
  if (/\b(?:19|20)\d{2}\s*$/.test(raw)) {
    const before = raw.replace(/\s*\(?\b(?:19|20)\d{2}\)?\s*$/, '').trim();
    const words = before.split(/\s+/).filter(Boolean);
    return words.length >= 3 && words.length <= 12;
  }
  return false;
}

/**
 * Imported lyric sheets often start with "Title - Artist" / "Title Artist 2020"
 * copied from a web page. Treat that as display preface, not a lyric section,
 * so it does not consume the first chord block.
 *
 * When `firstBlockLineCount === 1`, the line is whitespace-separated from the
 * rest of the lyrics (or sits alone before a section header).
 */
export function isLeadingTitleComposerLine(line, options) {
  const normalized = normalizeTextForMatch(line);
  if (!normalized || isSectionHeader(line) || isChordLine(line)) return false;

  const title = normalizeTextForMatch(options && options.title);
  const composer = normalizeTextForMatch(options && options.composer);
  const blockLines = options && options.firstBlockLineCount;
  const singleLinePreface = typeof blockLines !== 'number' || blockLines === 1;
  const hasYear = BIBLIOGRAPHIC_YEAR_RE.test(String(line || ''));

  if (title && composer) {
    if (normalized.indexOf(title) !== -1 && normalized.indexOf(composer) !== -1) {
      return true;
    }
  }
  if (title && normalized === title) {
    if (typeof blockLines === 'number' && blockLines > 1) return false;
    return true;
  }
  if (singleLinePreface) {
    if (title && normalized.indexOf(title) !== -1 && (composer
      ? normalized.indexOf(composer) !== -1
      : hasYear)) {
      return true;
    }
    if (looksLikeTitleComposerDateLine(line)) return true;
  }
  return false;
}

/**
 * Drop a leading bibliographic preface line when it is separated from the rest
 * of the lyrics by blank whitespace.
 */
export function stripLeadingBibliographicLyricPreface(lyricLines, options) {
  const lines = Array.isArray(lyricLines) ? lyricLines.slice() : [];
  let i = 0;
  while (i < lines.length && !String(lines[i] || '').trim()) i += 1;
  if (i >= lines.length) return lines;
  const firstIdx = i;
  const firstLine = lines[firstIdx];
  i += 1;
  let blankCount = 0;
  while (i < lines.length && !String(lines[i] || '').trim()) {
    blankCount += 1;
    i += 1;
  }
  if (blankCount === 0 || i >= lines.length) return lines;
  if (!isLeadingTitleComposerLine(firstLine, Object.assign({}, options || {}, {
    firstBlockLineCount: 1,
  }))) {
    return lines;
  }
  return lines.slice(i);
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
  if (t === '|:' || t === ':|' || t === ':|:' || t === '|]' || t === '|') return true;
  // ABC-style ending: [1 [2  or fakebook 1. 2.
  if (/^\[\d+$/.test(t)) return true;
  if (/^\d+\.$/.test(t)) return true;
  return false;
}

/** True when a chart contains repeat or ABC volta structure markers. */
export function chartHasStructureMarkers(chordChart) {
  return /\|:|:\||:\|:|\|\]|\[\d+|\d+\./.test(String(chordChart || ''));
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
    // Collapse "| :" → "|:" only when it is a start-repeat, not "| :|" (bar close + end-repeat).
    // Otherwise "Dm | | | :|" becomes "Dm | | |:|" and display shows "Dm | / | / |: / |".
    .replace(/\|\s+:(?!\|)/g, '|:')
    .replace(/:\s+\|/g, ':|')
    .replace(/\|\s+\]/g, '|]')
    // End-repeat must be ":|" — a lone trailing colon (not part of |: / :|) is broken.
    .replace(/(^|[^|]):(?!\|)(\s*)$/gm, '$1:|$2');
}

function normalizeStructureBarline(barline) {
  const close = normalizeChordChartRepeatMarks(String(barline || '|'));
  if (close === '|]') return '|]';
  if (close === ':|') return ':|';
  if (close === ':|:') return ':|:';
  if (close === '|:') return '|:';
  return '|';
}

function chartLineFromBarSpecs(barSpecs) {
  if (!Array.isArray(barSpecs) || barSpecs.length === 0) return '';
  return barSpecs.map(function(spec) {
    const prefix = Array.isArray(spec.prefix) ? spec.prefix : [];
    const tokens = Array.isArray(spec.tokens) ? spec.tokens : [];
    const body = prefix.concat(tokens).filter(Boolean).join(' ');
    const close = normalizeStructureBarline(spec.close);
    return body ? body + ' ' + close : close;
  }).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Remove repeat / volta markers from a chord chart while preserving bar grid.
 */
export function stripChartStructureMarkers(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return chordChart || '';
  const split = splitChartHeaderAndBody(chordChart);
  const strippedLines = String(split.body || '').split('\n').map(function(line) {
    if (!line.trim()) return '';
    const parts = splitChordChartLineIntoBars(line);
    const barSpecs = parts.bars.map(function(segment, index) {
      const tokens = segment.trim().split(/\s+/).filter(function(token) {
        return token && !tokenIsChartStructureMarker(token);
      });
      return {
        prefix: [],
        tokens: tokens,
        close: '|',
      };
    });
    return normalizeChordChartRepeatMarks(chartLineFromBarSpecs(barSpecs));
  }).filter(function(line) { return line.trim(); });
  const body = strippedLines.join('\n');
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, body) : body;
}

/**
 * Parse repeat / ABC volta layout from a decorated chord chart.
 * @returns {{ strainStartBarline: string|null, strainEndBarline: string|null, endingMarkers: object[], hasRepeatOpen: boolean, hasRepeatClose: boolean }}
 */
export function parseChartStructureMarkers(chordChart) {
  const result = {
    strainStartBarline: null,
    strainEndBarline: null,
    endingMarkers: [],
    hasRepeatOpen: false,
    hasRepeatClose: false,
  };
  if (!chordChart || !String(chordChart).trim()) return result;

  const split = splitChartHeaderAndBody(chordChart);
  let barIndex = 0;
  String(split.body || '').split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const parts = splitChordChartLineIntoBars(line);
    parts.bars.forEach(function(segment, index) {
      const close = normalizeStructureBarline(parts.barlines[index] || '|');
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      if (tokens.indexOf('|:') >= 0 || close === '|:') {
        result.hasRepeatOpen = true;
        if (!result.strainStartBarline) result.strainStartBarline = '|:';
      }
      tokens.forEach(function(token) {
        const voltaMatch = /^\[(\d+)$/.exec(token);
        if (voltaMatch) {
          result.endingMarkers.push({
            label: parseInt(voltaMatch[1], 10),
            barIndex: barIndex,
            close: null,
          });
        }
      });
      if (result.endingMarkers.length > 0) {
        const lastEnding = result.endingMarkers[result.endingMarkers.length - 1];
        if (lastEnding.barIndex === barIndex && (close === ':|' || close === '|]')) {
          lastEnding.close = close;
        }
      }
      if (close === ':|') {
        result.hasRepeatClose = true;
        if (result.endingMarkers.length === 0
          || result.endingMarkers[result.endingMarkers.length - 1].barIndex !== barIndex) {
          result.strainEndBarline = ':|';
        }
      }
      if (close === '|]' && result.endingMarkers.length > 0) {
        const lastEnding = result.endingMarkers[result.endingMarkers.length - 1];
        if (lastEnding.barIndex === barIndex) {
          lastEnding.close = '|]';
        }
      }
      barIndex += 1;
    });
  });
  return result;
}

/**
 * Rebuild a structured chart using chord bars from a marker-free chart.
 */
export function rebuildStructuredChartWithChords(structuredChart, cleanChart) {
  const structuredText = String(structuredChart || '').trim();
  const cleanBars = extractChordBars(cleanChart);
  if (!structuredText) return stripChartStructureMarkers(cleanChart);
  let barIdx = 0;
  const lines = [];
  String(structuredText).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const parts = splitChordChartLineIntoBars(line);
    const barSpecs = parts.bars.map(function(segment, index) {
      const close = normalizeStructureBarline(parts.barlines[index] || '|');
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      const prefix = tokens.filter(function(token) { return tokenIsChartStructureMarker(token); });
      const cleanTokens = barIdx < cleanBars.length ? cleanBars[barIdx] : [];
      barIdx += 1;
      return { prefix: prefix, tokens: cleanTokens, close: close };
    });
    lines.push(normalizeChordChartRepeatMarks(chartLineFromBarSpecs(barSpecs)));
  });
  if (barIdx !== cleanBars.length) {
    return decorateChartWithRepeatMarks(cleanChart, parseChartStructureMarkers(structuredChart));
  }
  return lines.join('\n');
}

/**
 * Insert repeat / volta markers onto a marker-free chart using block metadata.
 */
export function decorateChartWithRepeatMarks(cleanChart, meta) {
  const chart = String(cleanChart || '').trim();
  if (!chart) return '';
  const split = splitChartHeaderAndBody(chart);
  const barArrays = [];
  String(split.body || chart).split('\n').forEach(function(line) {
    if (!line.trim()) return;
    extractChordBars(line).forEach(function(tokens) { barArrays.push(tokens); });
  });
  if (barArrays.length === 0) return chart;

  const m = meta || {};
  const endings = Array.isArray(m.endingMarkers) ? m.endingMarkers : [];
  const endingByBar = {};
  endings.forEach(function(ending) {
    if (ending && ending.barIndex != null) endingByBar[ending.barIndex] = ending;
  });

  const barSpecs = barArrays.map(function(tokens, index) {
    const prefix = [];
    if (index === 0 && m.strainStartBarline === '|:') {
      prefix.push('|:');
    }
    const ending = endingByBar[index];
    if (ending && ending.label != null) {
      prefix.push('[' + String(ending.label));
    }
    let close = '|';
    if (ending && ending.close) {
      close = ending.close;
    } else if (index === barArrays.length - 1 && m.strainEndBarline === ':|') {
      close = ':|';
    }
    return { prefix: prefix, tokens: tokens, close: close };
  });
  const body = normalizeChordChartRepeatMarks(chartLineFromBarSpecs(barSpecs));
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, body) : body;
}

/**
 * Textarea value for the chords editor: ABC repeat/volta notation when available.
 */
export function formatSectionChartForEditor(section, options) {
  if (!section) return '';
  const opts = options || {};
  const header = section.header || section.lyricSectionHeader || '';
  const cleanChart = String(section.chart || '');
  const displayChart = String(opts.displayChart || section.displayChart || '');
  const needsDecoration = (displayChart && chartHasStructureMarkers(displayChart))
    || chartHasStructureMarkers(cleanChart)
    || section.strainStartBarline === '|:'
    || section.strainEndBarline === ':|'
    || (Array.isArray(section.endingMarkers) && section.endingMarkers.length > 0);
  let body = '';

  if (!needsDecoration) {
    body = normalizeChordChartRepeatMarks(cleanChart);
  } else if (displayChart && chartHasStructureMarkers(displayChart)) {
    body = rebuildStructuredChartWithChords(displayChart, cleanChart);
  } else if (chartHasStructureMarkers(cleanChart)) {
    body = normalizeChordChartRepeatMarks(cleanChart);
  } else {
    body = decorateChartWithRepeatMarks(cleanChart, {
      strainStartBarline: section.strainStartBarline,
      strainEndBarline: section.strainEndBarline,
      endingMarkers: section.endingMarkers || [],
    });
  }

  if (header && (section.notationMarkerWritten || section.writeNotationMarker)) {
    return sectionMarkerChartLine(header) + (body ? '\n' + body : '');
  }
  return body;
}

/**
 * Parse editor chart text: strip structure markers for merge, capture metadata.
 */
export function parseSectionChartFromEditor(text) {
  const split = splitChartHeaderAndBody(text);
  const normalized = normalizeChordChartRepeatMarks(split.body || text);
  const structure = parseChartStructureMarkers(normalized);
  const cleanBody = stripChartStructureMarkers(normalized);
  const cleanChart = split.headerLine
    ? joinChartHeaderAndBody(split.headerLine, cleanBody)
    : cleanBody;
  return {
    cleanChart: cleanChart,
    cleanBody: cleanBody,
    structureMarkers: structure,
    strainStartBarline: structure.strainStartBarline,
    strainEndBarline: structure.strainEndBarline,
    endingMarkers: structure.endingMarkers.slice(),
    headerLine: split.headerLine,
  };
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
  // "| :" must not steal the colon from "| :|" (bar close + end-repeat).
  const re = /:\s*\|:\s*|\|\s*:(?!\|)|:\s*\||\|\]|:\|:|\|/g;
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
    return token
      && !tokenIsChartStructureMarker(token)
      && !isInlineSignatureToken(token)
      && !isSectionMarkerToken(token)
      && tokenIsChord(token);
  });
}

/**
 * Pulse-slot tokens for one chart bar segment, including `.` placeholders.
 * Used when syncing quoted chords to melody at sub-beat positions.
 */
export function extractChartBarSlotTokens(barSegment) {
  const tokens = []
  String(barSegment || '').trim().split(/\s+/).filter(Boolean).forEach(function(token) {
    if (INLINE_METER_RE.test(token) || INLINE_KEY_RE.test(token) || INLINE_TEMPO_RE.test(token)) {
      return
    }
    if (isSectionMarkerToken(token) || tokenIsChartStructureMarker(token)) {
      return
    }
    if (token === '.' || token === '/') {
      tokens.push('.')
      return
    }
    if (tokenIsChord(token)) {
      tokens.push(String(token).replace(/"/g, ''))
      return
    }
    if (String(token).replace(/\./g, '').trim() === '') {
      tokens.push('.')
    }
  })
  return tokens
}

/**
 * Extract per-bar pulse-slot grids from a chord chart (dots preserved).
 */
export function extractChartBarSlotGrids(chordChart) {
  const bars = []
  if (!chordChart || !String(chordChart).trim()) return bars
  String(chordChart).split('\n').forEach(function(line) {
    if (!line.trim()) return
    const parts = splitChordChartLineIntoBars(line)
    parts.bars.forEach(function(segment) {
      bars.push(extractChartBarSlotTokens(segment))
    })
  })
  return bars
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

/** Unique chord symbols from a chart, for diagram toolbar buttons (excludes /, ., bars, markers). */
export function buildUniqueChordsMap(chordChart) {
  const uniqueChords = {};
  extractChordSequence(chordChart).forEach(function(token) {
    uniqueChords[token] = true;
  });
  return uniqueChords;
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

function tokenIsHeldChartPlaceholder(token) {
  return token === '.' || token === '/';
}

/**
 * Collapse unit/pulse slots into beat slots for structure display.
 * Structure charts use beats only (not quaver pulses).
 */
export function collapseSoundingToBeats(sounding, beatCount) {
  const slots = Array.isArray(sounding) ? sounding : [];
  const beats = Math.max(1, parseInt(beatCount, 10) || slots.length);
  if (slots.length <= beats) return slots.slice();
  if (slots.length % beats !== 0) return slots.slice();
  const beatUnitSlots = slots.length / beats;
  const out = [];
  let carry = '';
  for (let b = 0; b < beats; b += 1) {
    let beatChord = '';
    for (let u = 0; u < beatUnitSlots; u += 1) {
      const sc = slots[b * beatUnitSlots + u];
      if (sc) beatChord = sc;
    }
    if (beatChord) carry = beatChord;
    out.push(carry);
  }
  return out;
}

/**
 * When a chart line has more slots than beats (pulse-level editor grid), infer
 * beat count so structure display stays at beat resolution.
 */
export function inferBeatCountForDisplay(slotCount) {
  const count = Math.max(1, parseInt(slotCount, 10) || 1);
  if (count <= 4) return count;
  const candidates = [4, 3, 2, 6, 5, 7];
  for (let i = 0; i < candidates.length; i += 1) {
    const beats = candidates[i];
    if (count % beats === 0) {
      const ratio = count / beats;
      if (ratio >= 2 && ratio <= 4) return beats;
    }
  }
  return count;
}

/**
 * Format one bar of beat-level sounding chords for structure display.
 * Equal-duration chord spans collapse to chord names only (`G F`).
 * Use `/` only when hold lengths differ and rhythm detail is needed (`G / / A`).
 *
 * @param {string[]} sounding - chord label per beat (may include '')
 * @returns {{ tokens: string[], barEndChord: string }}
 */
export function formatBeatSoundingForDisplay(sounding) {
  const slots = Array.isArray(sounding) ? sounding : [];
  let barEndChord = '';
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    if (slots[i]) {
      barEndChord = slots[i];
      break;
    }
  }
  const active = slots.filter(Boolean);
  if (active.length === 0) {
    return { tokens: [], barEndChord: barEndChord };
  }
  const spans = [];
  for (let k = 0; k < slots.length; k += 1) {
    const sc = slots[k];
    if (!sc) continue;
    if (spans.length === 0 || spans[spans.length - 1].chord !== sc) {
      spans.push({ chord: sc, length: 1 });
    } else {
      spans[spans.length - 1].length += 1;
    }
  }
  if (spans.length === 0) {
    return { tokens: [], barEndChord: barEndChord };
  }
  if (spans.length === 1) {
    return { tokens: [spans[0].chord], barEndChord: barEndChord || spans[0].chord };
  }
  const spanLen = spans[0].length;
  const equalSpans = spans.every(function(span) { return span.length === spanLen; });
  if (equalSpans) {
    return {
      tokens: spans.map(function(span) { return span.chord; }),
      barEndChord: barEndChord,
    };
  }
  const tokens = [];
  spans.forEach(function(span) {
    tokens.push(span.chord);
    for (let h = 1; h < span.length; h += 1) {
      tokens.push('/');
    }
  });
  return { tokens: tokens, barEndChord: barEndChord };
}

/**
 * Peel leading repeat/volta markers and inline [M:]/[K:]/[Q:] so they are not
 * counted as beat slots. Updates currentMeter when a leading [M:] is seen.
 */
function peelLeadingChartBarPrefix(rawTokens, currentMeter) {
  const prefix = [];
  let i = 0;
  let meter = currentMeter || null;
  while (i < rawTokens.length) {
    const token = rawTokens[i];
    if (tokenIsChartStructureMarker(token)) {
      prefix.push(token);
      i += 1;
      continue;
    }
    if (isInlineSignatureToken(token)) {
      prefix.push(token);
      const meterMatch = String(token).trim().match(/^\[M:\s*([^\]]+)\]$/i);
      if (meterMatch) meter = normalizeMeter(meterMatch[1].trim());
      i += 1;
      continue;
    }
    break;
  }
  return { prefix: prefix, bodyTokens: rawTokens.slice(i), meter: meter };
}

/**
 * Expand held chords (dots or carried harmony) into beat-level structure display
 * (e.g. `D . . . | . . A .` → `D | D A |`; uneven `D . . . A` → `D / / A`).
 */
export function expandHeldChordsForDisplay(chordChart) {
  if (!chordChart || !String(chordChart).trim()) return '';
  let lastBarEndChord = '';
  let currentMeter = null;
  return String(chordChart).split('\n').map(function(line) {
    if (!line.trim()) return line;
    const parts = splitChordChartLineIntoBars(line);
    const out = [];
    parts.bars.forEach(function(segment, index) {
      const rawTokens = segment.trim().split(/\s+/).filter(Boolean);
      const peeled = peelLeadingChartBarPrefix(rawTokens, currentMeter);
      currentMeter = peeled.meter;
      const structurePrefix = peeled.prefix;
      // Skip any mid-bar signature tokens so they cannot inflate slot counts.
      const bodyTokens = peeled.bodyTokens.filter(function(token) {
        if (!isInlineSignatureToken(token)) return true;
        const meterMatch = String(token).trim().match(/^\[M:\s*([^\]]+)\]$/i);
        if (meterMatch) currentMeter = normalizeMeter(meterMatch[1].trim());
        return false;
      });
      let carry = lastBarEndChord;
      let hadExplicitChord = false;
      const unitSounding = bodyTokens.map(function(token) {
        if (tokenIsChord(token)) {
          hadExplicitChord = true;
          carry = token;
          return token;
        }
        if (tokenIsHeldChartPlaceholder(token) && carry) {
          return carry;
        }
        return '';
      });
      let beatCount = inferBeatCountForDisplay(unitSounding.length);
      if (currentMeter) {
        const modelBeats = getBarModel(currentMeter).beatCount;
        if (modelBeats > 0
            && (unitSounding.length === modelBeats
              || (unitSounding.length > modelBeats && unitSounding.length % modelBeats === 0))) {
          beatCount = modelBeats;
        }
      }
      const beatSounding = collapseSoundingToBeats(unitSounding, beatCount);
      const formatted = formatBeatSoundingForDisplay(beatSounding);
      if (!hadExplicitChord
          && formatted.tokens.length === 1
          && formatted.tokens[0] === lastBarEndChord) {
        formatted.tokens = [];
      }
      lastBarEndChord = formatted.barEndChord || lastBarEndChord;
      const close = parts.barlines[index] || '|';
      const body = structurePrefix.concat(formatted.tokens).join(' ');
      out.push(body ? (body + ' ' + close) : close);
    });
    return normalizeChordChartRepeatMarks(out.join(' ').replace(/\s+/g, ' ').trim());
  }).join('\n');
}

/**
 * Replace bars that have no chord symbols with `/` so held bars and rest-only
 * bars stay visible in block chord charts (e.g. `Fm | | Am |` → `Fm | / | Am |`).
 * Beat placeholders (`.`) and existing `/` markers count as empty.
 * Preserves `|:` / `:|` barlines, inline ending markers (`[1`, `1.`), and
 * inline [M:]/[K:]/[Q:] signature tokens.
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
      const peeled = peelLeadingChartBarPrefix(tokens, null);
      const structurePrefix = peeled.prefix;
      const rest = peeled.bodyTokens;
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
    .map(expandHeldChordsForDisplay)
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
      return words.map(function(word) {
        return { chord: '', text: word + ' ' };
      });
    });
  }

  const singableLines = (Array.isArray(lyricLines) ? lyricLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(function(line) { return line.split(/\s+/).filter(Boolean).length > 0; });
  const mergeOpts = Object.assign({}, opts);
  const stanzaAssignments = assignLyricLinesToBarsForStanzaGroups(lyricLines, bars, mergeOpts);
  const barAssignment = stanzaAssignments
    ? { assignments: stanzaAssignments }
    : assignLyricLinesToBarsForChart(singableLines, bars.length, bars, mergeOpts);
  const barsForLine = lineWords.map(function() { return []; });
  barAssignment.assignments.forEach(function(assignment) {
    for (let barIndex = assignment.startBar; barIndex <= assignment.endBar; barIndex += 1) {
      const idx = bars.length > 0 ? barIndex % bars.length : barIndex;
      if (bars[idx]) barsForLine[assignment.lineIndex].push(bars[idx]);
    }
  });

  // runningChord is the chord currently sounding; it carries across lines so a
  // chord held over a line break is known. Within a line, consecutive duplicate
  // chords are collapsed, but the chord sounding at the start of every lyric
  // line is always shown so each line displays its chord (a chord change lands
  // on every line where the chords actually change, eg. one chord per bar).
  // Mid-bar changes (F C in one bar) advance the scan so later chords in the
  // same bar are not dropped. When lyric `/` beat markers are present, those
  // chords land on the markers (including mid-bar `/` anchors); otherwise they
  // spread across successive words.
  let runningChord = null;
  return lineWords.map(function(words, li) {
    const lineBars = barsForLine[li];
    const wordCount = words.length;
    const barCount = lineBars.length;
    const slots = words.map(function() { return ''; });
    const anchorWordIndexForBar = typeof opts.anchorWordIndexForBar === 'function'
      ? opts.anchorWordIndexForBar
      : null;
    const lineBeatAnchors = lyricBeatAnchorWordIndices(words);
    let writeCursor = 0;

    if (barCount > 0) {
      lineBars.forEach(function(barChords, b) {
        const anchorInfo = {
          lineIndex: li,
          barIndex: b,
          barCount: barCount,
          wordCount: wordCount,
          words: words.slice(),
          lineText: String(lyricLines[li] || ''),
        };
        let wordIdx;
        if (anchorWordIndexForBar) {
          wordIdx = anchorWordIndexForBar(anchorInfo);
        } else {
          const beatIdx = resolveLyricBeatAnchorWordIndex(anchorInfo);
          wordIdx = beatIdx != null
            ? beatIdx
            : Math.round((b * wordCount) / barCount);
        }
        if (wordIdx >= wordCount) wordIdx = wordCount - 1;
        if (wordIdx < 0) wordIdx = 0;

        const explicit = Array.isArray(barChords) ? barChords : [];
        let toShow = [];
        if (b === 0) {
          // Start of a lyric line: always show the sounding chord (explicit
          // change here, or the chord held over from the previous line).
          toShow = explicit.length > 0 ? explicit.slice() : (runningChord ? [runningChord] : []);
        } else {
          let scan = runningChord;
          explicit.forEach(function(chord) {
            if (!chord) return;
            if (chord !== scan) {
              toShow.push(chord);
              scan = chord;
            }
          });
        }

        const placeable = toShow.filter(Boolean);
        if (placeable.length === 0) {
          if (explicit.length > 0) runningChord = explicit[explicit.length - 1];
          return;
        }

        const barBeatAnchors = !anchorWordIndexForBar && lineBeatAnchors.length > 0
          ? beatAnchorsForBar(b, barCount, lineBeatAnchors)
          : [];
        const chordSlots = wordIndicesForChordsOnBeatAnchors(
          placeable.length,
          barBeatAnchors,
          Math.max(wordIdx, writeCursor),
          wordCount
        );

        placeable.forEach(function(chord, ci) {
          let slot = chordSlots[ci];
          if (slot == null || slot < 0) slot = Math.max(wordIdx, writeCursor);
          if (slot >= wordCount) slot = wordCount - 1;
          if (slots[slot] && slots[slot] !== chord) {
            let found = -1;
            for (let wi = slot; wi < wordCount; wi += 1) {
              if (!slots[wi]) { found = wi; break; }
            }
            if (found < 0) {
              for (let wi = slot; wi >= 0; wi -= 1) {
                if (!slots[wi]) { found = wi; break; }
              }
            }
            if (found >= 0) slot = found;
          }
          if (slots[slot] && slots[slot] !== chord) {
            slots[slot] = slots[slot] + ' ' + chord;
          } else {
            slots[slot] = chord;
          }
          runningChord = chord;
          writeCursor = slot + 1;
        });
        if (explicit.length > 0) runningChord = explicit[explicit.length - 1];
      });
    }

    return words.map(function(word, wi) {
      // Keep lyric `/` beat markers in token text so "To Lyrics" / ChordPro
      // writes can round-trip them. Display views strip markers separately.
      return { chord: slots[wi] || '', text: word + ' ' };
    });
  });
}

/**
 * Align melody chord blocks to clean lyric blocks.
 *
 * Lyric blocks are separated by blank lines and may begin with a [Section]
 * header. Chord blocks come from the melody, split at double barlines (and
 * start-repeat marks) and ordered as they appear. When the lyrics carry
 * section headers, charts are assigned in lyric-page order: the first time a
 * section appears it takes the next melody strain, and later repeats reuse
 * that chart. Untyped leading verses still receive a chart (hymns often label
 * only [Chorus]). Without headers we fall back to a positional 1:1 mapping,
 * except when the melody has a single chord block and the lyrics have several
 * blocks: that is the hymn / folk-song pattern (one melody sung to many
 * verses, eg. Amazing Grace), so the one chord block is applied to every
 * verse. Every lyric line is always emitted so no words are dropped.
 *
 * inlineChords is true whenever a block has its own lyric words and a chart
 * to merge (including repeated verses/choruses with distinct lyrics). A
 * repeated section that carries no words of its own (eg. a chorus reference
 * that is just a header) keeps inlineChords false.
 *
 * chartRevisit is true when this lyric block reuses a section type that already
 * showed its chord chart earlier (including Verse 2 / chorus repeats, or another
 * hymn verse under one melody chart). Structure / block-chart display should show
 * only the section title, not the chord chart again — but lyrics still merge
 * chords above each line when the block has words (chords-from-notation path).
 *
 * Orphan (unmapped) melody chord blocks are attached as extraChart on the
 * last lyric block that has no mapped chart (unidentified lyrics), so they
 * appear before that block's words.
 *
 * Chord charts map to lyric sections by lyric-page order of first appearance
 * (and melody strains when available). Persisted chordSectionLabels are ignored
 * for matching — section names come from lyric markers only.
 *
 * @returns array of { header, type, chart, lyricLines, inlineChords, chartRevisit, extraChart }
 */
export function chordSectionLabelsUsableForMatching(labels) {
  // Legacy helper: label-based chart matching is retired. Always false so
  // callers fall through to lyric-order / strain assignment.
  void labels;
  return false;
}

function countSingableLyricLines(lyricLines) {
  const lines = Array.isArray(lyricLines) ? lyricLines : [];
  return lines.filter(function(line) {
    return String(line == null ? '' : line).trim().length > 0;
  }).length;
}

/**
 * When a lyric block spans two melodic strains (eg. 8 lines = two 4-line quatrains),
 * return the line index where the second strain begins.
 */
export function dualSectionHalfLineCount(lyricLines) {
  const n = countSingableLyricLines(lyricLines);
  if (n >= 8 && n % 4 === 0) return n / 2;
  if (n >= 6 && n % 2 === 0) return n / 2;
  if (n >= 5) return Math.floor(n / 2);
  return 0;
}

function blockUsesDualSectionCharts(block, charts, hasTypes) {
  if (hasTypes || !Array.isArray(charts) || charts.length < 2) return false;
  if (dualSectionHalfLineCount(block.lyricLines) < 2) return false;
  return chartBlockHasChords(charts[0]) && chartBlockHasChords(charts[1]);
}

function scopedChartForLineCount(chart, lineCount) {
  if (!chart || lineCount <= 0) return chart;
  const split = splitChartHeaderAndBody(chart);
  const bars = extractChordBars(split.body || chart);
  const scopeBars = Math.min(bars.length, lineCount * 2);
  if (scopeBars >= bars.length) return chart;
  const scopedBody = bars.slice(0, scopeBars).map(function(bar) {
    return (Array.isArray(bar) ? bar : []).join(' ');
  }).join(' | ') + ' |';
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, scopedBody) : scopedBody;
}

/**
 * Insert chord-only rows for chart bars not covered by lyric line assignments.
 */
export function ensureChordCompleteness(tokenLines, chart, singableLines, mergeOpts) {
  const lines = Array.isArray(tokenLines) ? tokenLines.slice() : [];
  const bars = extractChordBars(chart);
  if (bars.length === 0) return lines;

  const singable = (Array.isArray(singableLines) ? singableLines : [])
    .map(function(line) { return String(line || '').trim(); })
    .filter(function(line) { return line.split(/\s+/).filter(Boolean).length > 0; });
  if (singable.length === 0) return lines;

  const opts = mergeOpts || {};
  const stanzaAssignments = assignLyricLinesToBarsForStanzaGroups(singableLines, bars, opts);
  const barAssignment = stanzaAssignments
    ? { assignments: stanzaAssignments }
    : assignLyricLinesToBarsForChart(singable, bars.length, bars, opts);

  const covered = bars.map(function() { return false; });
  barAssignment.assignments.forEach(function(assignment) {
    for (let bi = assignment.startBar; bi <= assignment.endBar; bi++) {
      if (bi >= 0 && bi < covered.length) covered[bi] = true;
    }
  });

  const result = [];
  let lyricLineIndex = 0;
  barAssignment.assignments.forEach(function(assignment) {
    if (lyricLineIndex < lines.length) {
      result.push(lines[lyricLineIndex]);
      lyricLineIndex += 1;
      return;
    }
    const chordTokens = [];
    for (let bi = assignment.startBar; bi <= assignment.endBar; bi++) {
      (bars[bi] || []).filter(Boolean).forEach(function(chord) {
        if (chordTokens.indexOf(chord) < 0) chordTokens.push(chord);
      });
    }
    if (chordTokens.length) {
      result.push([{ chord: chordTokens.join(' '), text: '' }]);
    }
  });

  for (let bi = 0; bi < bars.length; bi++) {
    if (covered[bi]) continue;
    const chordTokens = (bars[bi] || []).filter(Boolean);
    if (chordTokens.length) {
      result.push([{ chord: chordTokens.join(' '), text: '' }]);
      covered[bi] = true;
    }
  }

  while (lyricLineIndex < lines.length) {
    result.push(lines[lyricLineIndex]);
    lyricLineIndex += 1;
  }

  return result.length ? result : lines;
}

/**
 * Serialize chord-bar arrays into a chart block (wraps every four bars).
 */
export function chartTextFromBarArrays(barArrays) {
  if (!Array.isArray(barArrays) || barArrays.length === 0) return '';
  return barArrays.map(function(bar) {
    const t = (Array.isArray(bar) ? bar : []).filter(Boolean).join(' ').trim();
    return t ? t + ' |' : '. |';
  }).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * When rendered chord blocks span multiple melody strains (eg. verse+chorus in
 * one 8-bar block), slice charts to one block per strain bar count.
 */
export function expandChartsToStrainSlices(charts, noteLines) {
  const chartList = Array.isArray(charts) ? charts : [];
  const strains = splitMelodyStrainsWithBarlines(noteLines);
  if (strains.length <= 1) return chartList;

  const strainBarCounts = strains.map(function(strain) {
    return extractBarsFromMelodyText(strain.text).length;
  });
  const totalStrainBars = strainBarCounts.reduce(function(sum, count) {
    return sum + count;
  }, 0);
  if (!totalStrainBars) return chartList;

  if (chartList.length === strains.length) return chartList;

  const allBars = [];
  chartList.forEach(function(chart) {
    extractChordBars(chart).forEach(function(bar) {
      allBars.push(bar);
    });
  });
  if (allBars.length < totalStrainBars) return chartList;

  const slices = [];
  let offset = 0;
  strainBarCounts.forEach(function(count) {
    const slice = allBars.slice(offset, offset + count);
    offset += count;
    if (slice.length) slices.push(chartTextFromBarArrays(slice));
  });
  if (slices.length === strains.length) return slices;

  // Rebuild from the full bar stream when partial slicing produced the wrong count.
  if (allBars.length >= totalStrainBars) {
    const rebuilt = [];
    let off = 0;
    strainBarCounts.forEach(function(count) {
      const slice = allBars.slice(off, off + count);
      off += count;
      if (slice.length) rebuilt.push(chartTextFromBarArrays(slice));
    });
    if (rebuilt.length === strains.length) return rebuilt;
  }

  return chartList;
}

/**
 * How many later lyric blocks introduce a section type that still needs its
 * own strain (typed, has words, not already claimed).
 */
function countFutureTypesNeedingStrain(blocks, fromIndex, chartForType) {
  const claimed = Object.create(null);
  Object.keys(chartForType || {}).forEach(function(type) {
    claimed[type] = true;
  });
  let needed = 0;
  for (let j = fromIndex + 1; j < blocks.length; j++) {
    const later = blocks[j];
    if (!later || !later.type || claimed[later.type]) continue;
    const hasWords = later.lyricLines.some(function(line) {
      return String(line).trim().length > 0;
    });
    if (!hasWords) continue;
    claimed[later.type] = true;
    needed += 1;
  }
  return needed;
}

/**
 * Prefer an earlier chart for this block when the lyric body matches a prior
 * stanza, or when the same typed section (same line count) already appeared.
 * Declines reuse when a remaining strain looks like a new section and later
 * typed blocks still need a chart.
 */
function findPriorChartForBlock(blocks, blockIndex, chartByBlockIndex, strainCharts, strainCursor, chartForType) {
  const block = blocks[blockIndex];
  if (!block) return null;
  const bodyKey = normalizeBodyKey(block);
  if (bodyKey) {
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (normalizeBodyKey(blocks[i]) === bodyKey && chartByBlockIndex[i]) {
        return chartByBlockIndex[i];
      }
    }
  }
  if (!block.type) return null;
  const lineCount = nonEmptyLineCount(block);
  let priorChart = null;
  for (let i = blockIndex - 1; i >= 0; i--) {
    if (blocks[i].type !== block.type
        || nonEmptyLineCount(blocks[i]) !== lineCount
        || !chartByBlockIndex[i]) {
      continue;
    }
    priorChart = chartByBlockIndex[i];
    break;
  }
  if (!priorChart) return null;

  if (!strainCharts || strainCursor >= strainCharts.length) return priorChart;

  const nextBars = extractChordBars(strainCharts[strainCursor]).length;
  const priorBars = extractChordBars(priorChart).length;
  if (nextBars === priorBars) return priorChart;

  const remaining = strainCharts.length - strainCursor;
  const futureNeeded = countFutureTypesNeedingStrain(blocks, blockIndex, chartForType);
  if (remaining <= futureNeeded) return priorChart;
  return null;
}

function copyStrainIndexFromPriorChart(blocks, index, chart, chartByBlockIndex, blockStrainIndex) {
  for (let pi = index - 1; pi >= 0; pi--) {
    if (chartByBlockIndex[pi] === chart && blockStrainIndex[pi] != null) {
      blockStrainIndex[index] = blockStrainIndex[pi];
      return;
    }
  }
}

/**
 * Assign melody strains to lyric blocks in lyric-page order.
 *
 * First appearance of a section takes the next unused strain; later repeats
 * reuse that chart. Untyped stanzas that match the opening verse's line count
 * (or that would leave too few strains for later typed sections) reuse the
 * verse chart instead of stealing chorus/bridge/pre-chorus strains.
 */
function assignChartsWithStrainAwareness(blocks, strainCharts, chartByBlockIndex, chartForType, blockStrainIndex) {
  let strainCursor = 0;
  let firstVerseLineCount = null;
  const strainIndexForType = Object.create(null);

  function bindType(type, chart, strainIndex) {
    if (!type || !chart) return;
    if (!chartForType[type]) chartForType[type] = chart;
    if (strainIndex != null && strainIndexForType[type] == null) {
      strainIndexForType[type] = strainIndex;
    }
  }

  function claimAsVerse(block, chart, strainIndex) {
    if (!block.type) {
      block.type = 'verse';
      if (!block.header) block.header = '[Verse]';
    }
    bindType('verse', chart, strainIndex);
    const n = nonEmptyLineCount(block);
    if (n > 0 && firstVerseLineCount == null) firstVerseLineCount = n;
  }

  blocks.forEach(function(b, index) {
    const hasWords = b.lyricLines.some(function(line) {
      return String(line).trim().length > 0;
    });
    if (!hasWords && !b.type) return;

    const lineCount = nonEmptyLineCount(b);
    if (b.type === 'verse' && lineCount > 0 && firstVerseLineCount == null) {
      firstVerseLineCount = lineCount;
    }

    // Already-seen section type: reuse in lyric order.
    if (b.type && Object.prototype.hasOwnProperty.call(chartForType, b.type)) {
      chartByBlockIndex[index] = chartForType[b.type];
      if (strainIndexForType[b.type] != null) {
        blockStrainIndex[index] = strainIndexForType[b.type];
      } else {
        copyStrainIndexFromPriorChart(blocks, index, chartForType[b.type], chartByBlockIndex, blockStrainIndex);
      }
      return;
    }

    const priorChart = findPriorChartForBlock(
      blocks, index, chartByBlockIndex, strainCharts, strainCursor, chartForType
    );
    if (priorChart) {
      chartByBlockIndex[index] = priorChart;
      copyStrainIndexFromPriorChart(blocks, index, priorChart, chartByBlockIndex, blockStrainIndex);
      if (b.type) bindType(b.type, priorChart, blockStrainIndex[index]);
      return;
    }

    // Header-only typed marker whose chart was bound earlier.
    if (!hasWords && b.type && chartForType[b.type]) {
      chartByBlockIndex[index] = chartForType[b.type];
      return;
    }

    // Untyped stanza that looks like the opening verse — reuse, don't take a new strain.
    if (!b.type && hasWords && chartForType.verse
        && firstVerseLineCount != null && lineCount === firstVerseLineCount) {
      chartByBlockIndex[index] = chartForType.verse;
      blockStrainIndex[index] = strainIndexForType.verse != null ? strainIndexForType.verse : 0;
      claimAsVerse(b, chartForType.verse, blockStrainIndex[index]);
      return;
    }

    // Untyped stanza must not consume the last strains still needed by later
    // typed sections (chorus / bridge / pre-chorus).
    if (!b.type && hasWords && chartForType.verse) {
      const remaining = strainCharts.length - strainCursor;
      const futureNeeded = countFutureTypesNeedingStrain(blocks, index, chartForType);
      if (remaining <= futureNeeded) {
        chartByBlockIndex[index] = chartForType.verse;
        blockStrainIndex[index] = strainIndexForType.verse != null ? strainIndexForType.verse : 0;
        claimAsVerse(b, chartForType.verse, blockStrainIndex[index]);
        return;
      }
    }

    if (strainCursor < strainCharts.length) {
      const chart = sanitizeChordChartBlock(strainCharts[strainCursor]);
      chartByBlockIndex[index] = chart;
      blockStrainIndex[index] = strainCursor;
      if (b.type) {
        bindType(b.type, chart, strainCursor);
        if (b.type === 'verse' && lineCount > 0 && firstVerseLineCount == null) {
          firstVerseLineCount = lineCount;
        }
      } else if (hasWords) {
        claimAsVerse(b, chart, strainCursor);
      }
      strainCursor += 1;
    }
  });
}

function mergeOptsForLines(chart, melodyNoteLines, lineCount, options) {
  const filteredMelody = filterNotationNoteLinesForAlignment(melodyNoteLines);
  const opts = options || {};
  let scopedMelody = null;
  if (opts.strainIndex != null && filteredMelody.length) {
    scopedMelody = notationNoteLinesForStrainIndex(filteredMelody, opts.strainIndex);
  }

  const fullChartBarCount = extractChordBars(chart).length;
  // Even split across lyric lines (eg. chorus 8 bars / 2 lines → 4 bars/line =
  // one full notation staff line). Keep the full chart; do not scope to 2 bars.
  const evenBarsPerLine = (lineCount > 0 && fullChartBarCount > 0 && fullChartBarCount % lineCount === 0)
    ? fullChartBarCount / lineCount
    : 0;
  const notationMatchesLines = !!(scopedMelody
    && lineCount > 0
    && scopedMelody.length === lineCount);
  const useEvenSplit = evenBarsPerLine >= 1
    && (notationMatchesLines || evenBarsPerLine >= 2 || fullChartBarCount === lineCount);

  const scopedChart = (useEvenSplit || notationMatchesLines)
    ? chart
    : scopedChartForLineCount(chart, lineCount);
  const chartBarCount = extractChordBars(scopedChart).length;

  if (!scopedMelody) {
    scopedMelody = notationNoteLinesForChart(filteredMelody, chartBarCount) || filteredMelody;
  }
  const useTwoBarsPerLine = !useEvenSplit
    && !notationMatchesLines
    && lineCount > 0
    && lineCount * 2 <= chartBarCount
    && chartBarCount / lineCount >= 2;
  const useOneBarPerLine = lineCount > 0 && chartBarCount === lineCount;
  const useRepeatDoubling = !useEvenSplit
    && !notationMatchesLines
    && strainLyricsUseRepeatDoubling(scopedMelody, lineCount)
    && lineCount * 2 <= chartBarCount * 2;
  const mergeOpts = Object.assign({}, options || {});
  if (opts.strainIndex != null && scopedMelody && scopedMelody.length) {
    const strainBarTotal = scopedMelody.reduce(function(sum, line) {
      return sum + extractBarsFromMelodyText(line).length;
    }, 0);
    if (strainBarTotal === chartBarCount || notationMatchesLines || useEvenSplit) {
      mergeOpts.strainScopedNotation = true;
    } else {
      scopedMelody = notationNoteLinesForChart(filteredMelody, chartBarCount) || [];
    }
  }
  if (useEvenSplit && evenBarsPerLine > 0) {
    mergeOpts.barsPerLyricLine = evenBarsPerLine;
    if (scopedMelody && scopedMelody.length) {
      mergeOpts.notationNoteLines = scopedMelody;
    }
  } else if (useTwoBarsPerLine || useRepeatDoubling) {
    mergeOpts.barsPerLyricLine = 2;
    if (useRepeatDoubling) mergeOpts.repeatWrap = true;
  } else if (useOneBarPerLine) {
    mergeOpts.barsPerLyricLine = 1;
  } else if (scopedMelody.length) {
    mergeOpts.notationNoteLines = scopedMelody;
  }
  return { chart: scopedChart, mergeOpts: mergeOpts };
}

function splitJoinedChartSections(chart) {
  return String(chart || '').split(/\n\s*\n/)
    .map(function(part) { return sanitizeChordChartBlock(part); })
    .filter(chartBlockHasChords);
}

/**
 * Merge inline chords for one aligned lyric block (per-line chord rows).
 */
export function mergeAlignedLyricBlockChords(block, melodyNoteLines, options) {
  if (!block || !block.inlineChords || !chartBlockHasChords(block.chart)) return null;

  const sections = (block.chartSections && block.chartSections.length > 1)
    ? block.chartSections.slice()
    : splitJoinedChartSections(block.chart);
  const half = dualSectionHalfLineCount(block.lyricLines);
  if (sections.length >= 2 && half > 0) {
    const firstLines = block.lyricLines.slice(0, half);
    const secondLines = block.lyricLines.slice(half);
    const firstCount = countSingableLyricLines(firstLines);
    const secondCount = countSingableLyricLines(secondLines);
    const first = mergeOptsForLines(sections[0], melodyNoteLines, firstCount, options);
    const second = mergeOptsForLines(sections[1], melodyNoteLines, secondCount, options);
    const merged = mergeChordsIntoLyricLines(firstLines, first.chart, first.mergeOpts)
      .concat(mergeChordsIntoLyricLines(secondLines, second.chart, second.mergeOpts));
    return ensureChordCompleteness(merged, block.chart, block.lyricLines, first.mergeOpts);
  }

  const lineCount = countSingableLyricLines(block.lyricLines);
  const mergeOptions = Object.assign({}, options || {});
  if (block.melodyStrainIndex != null) mergeOptions.strainIndex = block.melodyStrainIndex;
  const scoped = mergeOptsForLines(block.chart, melodyNoteLines, lineCount, mergeOptions);
  const merged = mergeChordsIntoLyricLines(block.lyricLines, scoped.chart, scoped.mergeOpts);
  return ensureChordCompleteness(merged, scoped.chart, block.lyricLines, scoped.mergeOpts);
}

export function alignChordBlocksToLyrics(lyricLines, chordBlocks, options) {
  const charts = Array.isArray(chordBlocks) ? chordBlocks : splitChordChartIntoBlocks(chordBlocks);
  const melodyNoteLines = options && Array.isArray(options.melodyNoteLines)
    ? filterNotationNoteLinesForAlignment(options.melodyNoteLines)
    : null;
  let strainCharts = melodyNoteLines && melodyNoteLines.length
    ? expandChartsToStrainSlices(charts, melodyNoteLines)
    : null;
  if (strainCharts && melodyNoteLines && melodyNoteLines.length) {
    const strainCount = splitMelodyStrainsWithBarlines(melodyNoteLines).length;
    if (strainCount > 1 && strainCharts.length !== strainCount) {
      const expanded = expandChartsToStrainSlices(charts, melodyNoteLines);
      if (expanded.length === strainCount) strainCharts = expanded;
    }
  }
  const sourceLines = Array.isArray(lyricLines) ? lyricLines : [];
  const strippedLines = stripLeadingBibliographicLyricPreface(sourceLines, options);
  const prefaceLines = [];
  if (strippedLines.length < sourceLines.length) {
    sourceLines.slice(0, sourceLines.length - strippedLines.length).forEach(function(line) {
      if (String(line || '').trim()) prefaceLines.push(line);
    });
  }
  // Strip before block split so a double blank after the title cannot enable
  // soft-join and glue unlabeled verses onto chorus bodies.
  const rawBlocks = normalizeLyricBlocks(strippedLines).slice();

  if (rawBlocks.length > 0 && rawBlocks[0].length > 0) {
    const firstLine = rawBlocks[0][0];
    const nextLine = rawBlocks[0][1] || (rawBlocks[1] && rawBlocks[1][0]) || '';
    // Single-line / blank-separated preface, or meta line immediately before [Verse].
    const prefaceBlockCount = (rawBlocks[0].length === 1 || isSectionHeader(nextLine))
      ? 1
      : rawBlocks[0].length;
    const likelyPreface = isLeadingTitleComposerLine(firstLine, Object.assign({}, options, {
      firstBlockLineCount: prefaceBlockCount,
    }))
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

  const hasTypes = blocks.some(function(b) { return b.type; });
  // When lyric blocks have section headers, assign melody charts in lyric-page
  // order (first appearance of a type takes the next strain; repeats reuse).
  // Untyped leading verses still take a chart (hymns often label only [Chorus]).
  // chordSectionLabels are intentionally ignored — names come from lyrics only.
  const chartForType = {};
  const chartByBlockIndex = {};
  const blockStrainIndex = {};
  let typedMappedChartCount = 0;
  const usedChartIndexes = Object.create(null);
  const useStrainChartAssignment = !!(strainCharts && strainCharts.length > 1);

  if (hasTypes) {
    if (useStrainChartAssignment) {
      assignChartsWithStrainAwareness(blocks, strainCharts, chartByBlockIndex, chartForType, blockStrainIndex);
      typedMappedChartCount = strainCharts.length;
    } else {
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
  }

  // One melody, many verses (no headers): apply the single chord block to every
  // lyric block so chords show on every verse, not just the first.
  const singleChartForAllBlocks = !hasTypes && charts.length === 1 && blocks.length > 1
    && chartBlockHasChords(charts[0])
    ? sanitizeChordChartBlock(charts[0])
    : null;

  function joinChartsForInlineMerge(chartList) {
    return chartList.map(sanitizeChordChartBlock).filter(chartBlockHasChords).join('\n\n');
  }

  function blockNeedsJoinedCharts(block) {
    if (hasTypes || charts.length < 2) return false;
    return countSingableLyricLines(block.lyricLines) >= 7;
  }

  const joinedChartsForMultiStrain = !hasTypes && charts.length > 1
    ? joinChartsForInlineMerge(charts)
    : null;

  const combinedCharts = charts.map(sanitizeChordChartBlock).filter(chartBlockHasChords);
  const combinedChartForSingleBlock = !hasTypes && blocks.length === 1 && charts.length > 1 && combinedCharts.length > 0
    ? combinedCharts.join('\n\n')
    : null;

  const seenSectionTypes = Object.create(null);
  const seenCharts = Object.create(null);

  const aligned = blocks.map(function(b, index) {
    let chart = '';
    let extraChart = '';
    if (hasTypes) {
      if (Object.prototype.hasOwnProperty.call(chartByBlockIndex, index)) {
        chart = chartByBlockIndex[index];
      }
    } else if (combinedChartForSingleBlock !== null) {
      chart = combinedChartForSingleBlock;
    } else if (blockNeedsJoinedCharts(b) && joinedChartsForMultiStrain) {
      chart = joinedChartsForMultiStrain;
    } else if (singleChartForAllBlocks !== null) {
      chart = singleChartForAllBlocks;
    } else if (index < charts.length) {
      chart = charts[index];
    } else if (charts.length > 0) {
      chart = charts[index % charts.length];
    }

    if (!chartBlockHasChords(chart)) chart = '';
    else chart = sanitizeChordChartBlock(chart);
    if (!chartBlockHasChords(extraChart)) extraChart = '';
    else extraChart = sanitizeChordChartBlock(extraChart);

    let chartRevisit = false;
    if (chart) {
      if (hasTypes && b.type) {
        // First occurrence of each section type shows chords; later stanzas of
        // the same type (Verse 2, chorus repeats, etc.) are revisits — even when
        // the chord sequence differs — so structured layout keeps one chart each.
        if (seenSectionTypes[b.type]) {
          chartRevisit = true;
        } else {
          seenSectionTypes[b.type] = true;
        }
      } else if (hasTypes && !b.type) {
        if (seenCharts[chart]) chartRevisit = true;
        else seenCharts[chart] = true;
      } else if (singleChartForAllBlocks !== null) {
        chartRevisit = index > 0;
      } else if (index >= charts.length && charts.length > 0) {
        chartRevisit = true;
      } else if (seenCharts[chart]) {
        chartRevisit = true;
      } else {
        seenCharts[chart] = true;
      }
    }

    const hasWords = b.lyricLines.some(function(line) { return String(line).trim().length > 0; });
    let inlineChords = false;
    let chartSections = null;
    if (hasWords) {
      inlineChords = !!(chart && chartBlockHasChords(chart));
      if (blockNeedsJoinedCharts(b) && charts.length > 1) {
        chartSections = charts.map(sanitizeChordChartBlock).filter(chartBlockHasChords);
      }
    }

    return {
      prefaceLines: index === 0 ? prefaceLines : [],
      header: b.header,
      type: b.type,
      chart: chart,
      extraChart: extraChart,
      chartSections: chartSections,
      lyricLines: b.lyricLines,
      inlineChords: inlineChords,
      chartRevisit: chartRevisit,
      melodyStrainIndex: blockStrainIndex[index] != null ? blockStrainIndex[index] : null,
    };
  });

  // Chord blocks from the melody that did not map to any lyric section are
  // shown as extraChart before the last unidentified lyric block (words with
  // no mapped chart). Fall back to the last lyric block when every block mapped.
  const mappedChartCount = hasTypes
    ? typedMappedChartCount
    : (combinedChartForSingleBlock !== null || joinedChartsForMultiStrain
      ? charts.length
      : Math.min(charts.length, blocks.length));
  let orphanCharts = charts.slice(mappedChartCount)
    .map(sanitizeChordChartBlock)
    .filter(chartBlockHasChords);
  if (orphanCharts.length > 0) {
    const assignedFingerprints = Object.create(null);
    aligned.forEach(function(block) {
      if (chartBlockHasChords(block.chart)) {
        assignedFingerprints[chordChartFingerprint(block.chart)] = true;
      }
    });
    orphanCharts = orphanCharts.filter(function(chart) {
      const fp = chordChartFingerprint(chart);
      if (fp && assignedFingerprints[fp]) return false;
      const keys = Object.keys(assignedFingerprints);
      for (let ki = 0; ki < keys.length; ki++) {
        const assignedFp = keys[ki];
        if (assignedFp && fp && fp.length > assignedFp.length && fp.indexOf(assignedFp) === 0) {
          return false;
        }
      }
      return true;
    });
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
