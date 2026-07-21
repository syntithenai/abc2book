import ChordSheetJS from 'chordsheetjs';
import {
  classifyLyricChordLines,
  hasChordLines,
  isChordLine,
  isSectionHeader,
  linesHaveChordProInlineChords,
  lineHasChordProInlineChords,
} from './chordSheetUtils';
import { buildChordSheetAlignmentFromLines, sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils';
import { setLyricLines, getLyricLines } from './wLinesUtils';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { applyChordSheetToTune } from './applyChordSheetToTune';
import { getBarModel, fullBarRestAbc } from './barModel';
import { mergeBibliographicList } from './tuneBibliographicUtils';
import {
  appendChordProMetaAbcHeaders,
  extractChordProDirectives,
  isBraceTempoDirective,
  resolveChordProImportMeta,
} from './chordProMetaUtils';

const { ChordProParser, ChordsOverWordsParser } = ChordSheetJS;

export { linesHaveChordProInlineChords, lineHasChordProInlineChords };

const CHORD_SHEET_EXTENSIONS = ['.cho', '.pro', '.crd', '.onsong', '.txt'];
const PREAMBLE_SCAN_LIMIT = 15;

const PREAMBLE_FIELD_PATTERNS = [
  { field: 'title', re: /^(?:title|song)\s*:\s*(.+)$/i },
  { field: 'composer', re: /^(?:artist|by|author)\s*:\s*(.+)$/i },
  { field: 'key', re: /^(?:key|tonality)\s*:\s*(.+)$/i },
  { field: 'capo', re: /^capo(?:\s*:)?\s*(\d+)/i },
  { field: 'tempo', re: /^(?:tempo|bpm|q)\s*:\s*(.+)$/i },
  { field: 'meter', re: /^(?:time|meter)\s*:\s*(.+)$/i },
  { field: 'tuning', re: /^tuning\s*:\s*(.+)$/i },
];

/**
 * Sniff labeled metadata from a short leading window of a chords-over-words sheet.
 * Stops at the first clear section/chord/lyric body line. Only label-like forms
 * are captured; ambiguous lines stay in the body.
 */
export function extractChordSheetPreambleMeta(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const meta = {
    title: '',
    composer: '',
    key: '',
    capo: '',
    tempo: '',
    meter: '',
    tuning: '',
  };
  const consumedLineIndexes = [];
  let nonEmptySeen = 0;

  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index] == null ? '' : String(source[index]);
    const trimmed = raw.trim();
    if (!trimmed) continue;

    nonEmptySeen += 1;
    if (nonEmptySeen > PREAMBLE_SCAN_LIMIT) break;

    let matchedField = null;
    let matchedValue = '';
    for (let p = 0; p < PREAMBLE_FIELD_PATTERNS.length; p += 1) {
      const pattern = PREAMBLE_FIELD_PATTERNS[p];
      const match = trimmed.match(pattern.re);
      if (match) {
        matchedField = pattern.field;
        matchedValue = String(match[1] || '').trim();
        break;
      }
    }

    if (matchedField) {
      if (!meta[matchedField]) meta[matchedField] = matchedValue;
      consumedLineIndexes.push(index);
      continue;
    }

    // First non-meta body line ends the preamble window.
    if (isSectionHeader(trimmed) || isChordLine(trimmed) || trimmed.length > 0) {
      break;
    }
  }

  const consumedSet = {};
  consumedLineIndexes.forEach(function(i) { consumedSet[i] = true; });
  const strippedLines = source.filter(function(_line, index) {
    return !consumedSet[index];
  });

  return Object.assign({}, meta, {
    consumedLineIndexes: consumedLineIndexes,
    strippedLines: strippedLines,
  });
}

export function isChordSheetFilename(name) {
  const lower = String(name || '').toLowerCase();
  return CHORD_SHEET_EXTENSIONS.some(function(ext) { return lower.endsWith(ext); });
}

/** Derive a display title from a chord-sheet filename (e.g. `amazing-grace.pro`). */
export function titleFromChordSheetFileName(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim();
  if (!base) return '';
  if (/^(untitled|song|new[\s_-]*tune|import)$/i.test(base)) return '';
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripLeadingPreambleLabelLines(lines) {
  const source = Array.isArray(lines) ? lines.slice() : [];
  const kept = [];
  let nonEmptySeen = 0;
  for (let index = 0; index < source.length; index += 1) {
    const trimmed = String(source[index] == null ? '' : source[index]).trim();
    if (!trimmed) {
      kept.push(source[index]);
      continue;
    }
    nonEmptySeen += 1;
    if (nonEmptySeen <= PREAMBLE_SCAN_LIMIT) {
      let isPreamble = false;
      for (let p = 0; p < PREAMBLE_FIELD_PATTERNS.length; p += 1) {
        if (PREAMBLE_FIELD_PATTERNS[p].re.test(trimmed)) {
          isPreamble = true;
          break;
        }
      }
      if (isPreamble) continue;
    }
    kept.push(source[index]);
  }
  while (kept.length && !String(kept[0] || '').trim()) kept.shift();
  return kept;
}

export function normalizeOnSongText(text) {
  let normalized = String(text || '');
  normalized = normalized.replace(/\{\{([^}]+)\}\}/g, function(_match, inner) {
    return '{' + inner.trim() + '}';
  });
  return normalized;
}

export function detectChordSheetFormat(text) {
  const sample = String(text || '').trim();
  if (/\{\{[^}]+\}\}/.test(sample)) return 'onsong';
  if (/\{[a-z_]+:/i.test(sample)) return 'chordpro';
  if (linesHaveChordProInlineChords(sample.split(/\r?\n/))) return 'chordpro';
  return 'chords-over-words';
}

function parseSongFromText(text) {
  const normalized = normalizeOnSongText(text);
  const format = detectChordSheetFormat(normalized);
  try {
    if (format === 'chords-over-words') {
      return new ChordsOverWordsParser().parse(normalized);
    }
    return new ChordProParser().parse(normalized);
  } catch (e) {
    return new ChordsOverWordsParser().parse(normalized);
  }
}

function songToSheetLines(song) {
  const formatter = new ChordSheetJS.ChordsOverWordsFormatter();
  const formatted = formatter.format(song);
  return formatted.split('\n').filter(function(line, index, arr) {
    if (index === arr.length - 1 && line.trim() === '') return false;
    return true;
  });
}

function stripMetadataLines(lines) {
  return lines.filter(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return true;
    if (/^(title|artist|subtitle|composer|key|capo|tempo|time)\s*:/i.test(trimmed)) return false;
    return true;
  });
}

/**
 * ChordPro / OnSong body lines with inline `[Am]` markers kept, metadata
 * directives removed. Comment directives `{c: …}` become `[…]` headers.
 * Directive names may include hyphens (e.g. {zoom-ipad: …}).
 * Also drops malformed app/layout directives ({zoom-ipad 3.2}, unclosed {zoom-ipad:).
 */
export function extractPreservedChordProLyricLines(text) {
  const normalized = normalizeOnSongText(text);
  const out = [];
  String(normalized || '').split(/\r?\n/).forEach(function(raw) {
    const line = raw == null ? '' : String(raw);
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      return;
    }
    // Closed directive: {name}, {name: value}, or {name value}
    const metaMatch = trimmed.match(/^\{([a-z][a-z0-9_-]*)\s*(?::\s*(.*))?\}$/i)
      || trimmed.match(/^\{([a-z][a-z0-9_-]*)\s+(.+)\}$/i);
    if (metaMatch) {
      const key = String(metaMatch[1] || '').toLowerCase();
      const value = String(metaMatch[2] != null ? metaMatch[2] : '').trim();
      if (key === 'c' || key === 'comment' || key === 'highlight') {
        out.push(value ? '[' + value + ']' : '');
      }
      // Drop title/subtitle/key/capo/tempo/time/zoom-ipad/etc.
      return;
    }
    // Digit-led tempo markers e.g. {164bpm} (not matched as normal directives)
    if (isBraceTempoDirective(trimmed)) {
      return;
    }
    // Unclosed / truncated directive line (e.g. "{zoom-ipad:" alone)
    if (/^\{[a-z][a-z0-9_-]*(\s*:|\s|$)/i.test(trimmed) && trimmed.indexOf('}') === -1) {
      return;
    }
    out.push(line);
  });
  // Trim leading/trailing blank lines only
  while (out.length && !String(out[0]).trim()) out.shift();
  while (out.length && !String(out[out.length - 1]).trim()) out.pop();
  return out;
}

function buildChordSheetDraftFromLines(sheetLines, sourceText, options, metadata) {
  const meta = metadata || {};
  const preservePlacement = !options || options.preservePlacement !== false;
  const lyricLines = preservePlacement
    ? (Array.isArray(sheetLines) ? sheetLines.slice() : [])
    : sheetLinesToLyricLines(sheetLines);
  const chordText = sheetLinesToWizardChords(sheetLines);
  const warnings = Array.isArray(meta.warnings) ? meta.warnings.slice() : [];

  if (!lyricLines.length && !chordText.trim()) {
    const resolved = meta.resolved || {};
    const hasMeta = !!(
      resolved.title
      || meta.title
      || (options && options.fallbackTitle)
    );
    if (!hasMeta) {
      throw new Error('No lyrics or chords found in chord sheet');
    }
  }

  if (/\{text(fill|color)/i.test(sourceText)) {
    warnings.push('Color directives are not preserved on import.');
  }

  const resolved = meta.resolved || {}
  return {
    title: resolved.title || meta.title || (options && options.fallbackTitle) || '',
    composer: resolved.composer != null ? resolved.composer : (meta.composer || ''),
    artists: Array.isArray(resolved.artists) ? resolved.artists : [],
    aliases: Array.isArray(resolved.aliases) ? resolved.aliases : [],
    genre: resolved.genre || '',
    discography: resolved.discography || '',
    tags: Array.isArray(resolved.tags) ? resolved.tags : [],
    backgroundInfo: resolved.backgroundInfo || '',
    lyricsScrollDurationSec: resolved.lyricsScrollDurationSec || 0,
    key: resolved.key || meta.key || '',
    capo: resolved.capo != null
      ? resolved.capo
      : (meta.capo != null && meta.capo !== '' ? parseInt(meta.capo, 10) || 0 : 0),
    tempo: resolved.tempo || (meta.tempo ? parseInt(meta.tempo, 10) || 100 : 100),
    meter: resolved.meter || meta.time || meta.meter || '4/4',
    tuning: resolved.tuning || meta.tuning || '',
    lyricLines: lyricLines,
    chordText: chordText,
    chordProSource: sourceText,
    chordSheetAlignment: (function() {
      try {
        return buildChordSheetAlignmentFromLines(sheetLines);
      } catch (e) {
        warnings.push('Chord alignment could not be computed for this file.');
        return [];
      }
    })(),
    warnings: warnings,
    sectionCount: sheetLines.filter(function(line) { return isSectionHeader(line); }).length,
    barCount: chordText ? chordText.split('\n').filter(function(line) { return line.trim(); }).length : 0,
    preservePlacement: preservePlacement,
  };
}

function parseChordOverWordsSheetText(sourceText, options) {
  const allLines = sourceText.split(/\r?\n/);
  const preamble = extractChordSheetPreambleMeta(allLines);
  const sheetLines = preamble.strippedLines;
  const parseOptions = options || {};
  const fallbackTitle = parseOptions.fallbackTitle || titleFromChordSheetFileName(parseOptions.fileName);
  const resolved = resolveChordProImportMeta({
    preamble: preamble,
    directives: {},
    fallbackTitle: fallbackTitle,
  });
  return buildChordSheetDraftFromLines(sheetLines, sourceText, parseOptions, {
    resolved: resolved,
    title: resolved.title,
    composer: resolved.composer,
    key: resolved.key,
    capo: resolved.capo,
    tempo: resolved.tempo,
    meter: resolved.meter,
    tuning: resolved.tuning,
  });
}

export function parseChordSheetText(text, options) {
  const sourceText = String(text || '');
  if (!sourceText.trim()) {
    throw new Error('Chord sheet is empty');
  }

  const preservePlacement = !options || options.preservePlacement !== false;
  const format = detectChordSheetFormat(sourceText);
  if (format === 'chords-over-words') {
    return parseChordOverWordsSheetText(sourceText, options);
  }

  const normalized = normalizeOnSongText(sourceText);
  const allLines = sourceText.split(/\r?\n/);
  const preamble = extractChordSheetPreambleMeta(allLines);
  const song = parseSongFromText(normalized);
  const directives = extractChordProDirectives(normalized);
  let sheetLines = [];
  try {
    sheetLines = stripMetadataLines(songToSheetLines(song));
  } catch (e) {
    sheetLines = [];
  }
  const parseOptions = options || {};
  const fallbackTitle = parseOptions.fallbackTitle || titleFromChordSheetFileName(parseOptions.fileName);
  const resolved = resolveChordProImportMeta({
    song: song,
    directives: directives,
    preamble: preamble,
    fallbackTitle: fallbackTitle,
  });
  const draft = buildChordSheetDraftFromLines(sheetLines, sourceText, parseOptions, {
    resolved: resolved,
    title: resolved.title,
    composer: resolved.composer,
    key: resolved.key,
    capo: resolved.capo,
    tempo: resolved.tempo,
    meter: resolved.meter,
  });
  if (preservePlacement) {
    const preserved = stripLeadingPreambleLabelLines(extractPreservedChordProLyricLines(sourceText));
    if (preserved.length) {
      draft.lyricLines = preserved;
    }
  }
  return draft;
}

function buildSkeletonAbc(draft) {
  const meter = draft.meter || '4/4';
  const model = getBarModel(meter, draft.noteLength || null);
  const lines = [
    'X:1',
    'T:' + (draft.title || 'Untitled'),
  ];
  appendChordProMetaAbcHeaders(lines, draft);
  lines.push('M:' + model.meter);
  lines.push('L:' + model.noteLength);
  if (draft.tempo) lines.push('Q:1/4=' + draft.tempo);
  lines.push('K:' + (draft.key || 'C'));
  lines.push(fullBarRestAbc(model.unitSlotsPerBar));
  return lines.join('\n');
}

export function createTuneFromChordSheet(options) {
  const draft = options.draft;
  const tunebook = options.tunebook;
  const abcjsParser = options.abcjsParser;
  const book = options.book;

  if (!draft || !tunebook || !abcjsParser) {
    throw new Error('Missing dependencies for chord sheet import');
  }

  const skeletonAbc = buildSkeletonAbc(draft);
  const tune = tunebook.abcTools.abc2json(skeletonAbc);
  tune.timingScaffold = true;
  const bookName = book ? String(book).trim() : '';
  tune.books = bookName ? [bookName] : [];

  applyChordSheetToTune(tune, {
    chordGridText: draft.chordText || '',
    lyricLines: draft.lyricLines || [],
    chordSheetAlignment: draft.chordSheetAlignment || null,
    meta: {
      name: draft.title || 'Untitled',
      title: draft.title || 'Untitled',
      composer: draft.composer || '',
      key: draft.key || '',
      capo: draft.capo || 0,
      tempo: draft.tempo || '',
      meter: draft.meter || '',
      chordProSource: draft.chordProSource || '',
    },
    mergeMode: 'create',
    abcjsParser: abcjsParser,
    tunebook: tunebook,
    abc: skeletonAbc,
    forceFinalize: true,
  });

  if (Array.isArray(draft.artists) && draft.artists.length) {
    tune.artists = mergeBibliographicList(tune.artists, draft.artists);
  }
  if (Array.isArray(draft.aliases) && draft.aliases.length) {
    tune.aliases = mergeBibliographicList(tune.aliases, draft.aliases);
  }
  if (draft.genre && !tune.genre) tune.genre = draft.genre;
  if (draft.discography) {
    tune.meta = tune.meta || {};
    if (!tune.meta.D) tune.meta.D = draft.discography;
  }
  if (Array.isArray(draft.tags) && draft.tags.length) {
    tune.tags = mergeBibliographicList(tune.tags, draft.tags);
  }
  if (draft.backgroundInfo) {
    const existing = typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo.trim() : '';
    tune.backgroundInfo = existing
      ? (existing + '\n\n' + draft.backgroundInfo)
      : draft.backgroundInfo;
  }
  if (draft.lyricsScrollDurationSec > 0) {
    tune.lyricsScrollDurationSec = draft.lyricsScrollDurationSec;
  }

  if (!getLyricLines(tune).length && Array.isArray(draft.lyricLines) && draft.lyricLines.length) {
    setLyricLines(tune, draft.lyricLines);
  }

  return tune;
}

export function tuneHasChordSheetContent(tune) {
  if (!tune) return false;
  const lines = getLyricLines(tune);
  if (lines.some(function(line) { return String(line || '').trim().length > 0; })) return true;
  if (hasChordLines(lines)) return true;
  const voiceKey = tune.voices ? resolvePrimaryVoiceKey(tune.voices) : '1';
  const notes = tune.voices && tune.voices[voiceKey] ? tune.voices[voiceKey].notes : [];
  return Array.isArray(notes) && notes.some(function(line) {
    return String(line || '').replace(/[|z\s]/gi, '').length > 0;
  });
}

function buildHeaderDirectives(tune) {
  const lines = [];
  if (tune.name) lines.push('{title: ' + tune.name + '}');
  if (tune.composer) lines.push('{subtitle: ' + tune.composer + '}');
  if (tune.key) lines.push('{key: ' + tune.key + '}');
  if (tune.capo) lines.push('{capo: ' + tune.capo + '}');
  if (tune.tempo) lines.push('{tempo: ' + tune.tempo + '}');
  if (tune.meter) lines.push('{time: ' + tune.meter + '}');
  return lines.join('\n');
}

function wLinesToChordProBody(lines) {
  const source = Array.isArray(lines) ? lines : [];
  // Already ChordPro-inline: pass through (section headers stay as [Chorus]).
  if (linesHaveChordProInlineChords(source)) {
    return source.map(function(line) {
      return line == null ? '' : String(line);
    }).join('\n');
  }

  const classified = classifyLyricChordLines(lines);
  const body = [];
  let pendingChords = null;

  classified.forEach(function(item) {
    if (item.type === 'blank') {
      if (pendingChords) {
        body.push(pendingChords);
        pendingChords = null;
      }
      body.push('');
      return;
    }
    if (item.type === 'header') {
      if (pendingChords) {
        body.push(pendingChords);
        pendingChords = null;
      }
      const headerText = item.text.replace(/^\[|\]$/g, '').replace(/^#+\s*/, '').trim();
      body.push('{c: ' + headerText + '}');
      return;
    }
    if (item.type === 'chord') {
      pendingChords = item.text;
      return;
    }
    if (item.type === 'lyric') {
      const words = String(item.text || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      if (pendingChords) {
        const chords = pendingChords.split(/\s+/).filter(Boolean);
        let chordIndex = 0;
        const inline = words.map(function(word) {
          const chord = chords[chordIndex] || '';
          if (chordIndex < chords.length - 1) chordIndex += 1;
          return chord ? '[' + chord + ']' + word : word;
        }).join(' ');
        body.push(inline);
        pendingChords = null;
      } else {
        body.push(item.text);
      }
    }
  });

  if (pendingChords) body.push(pendingChords);
  return body.join('\n');
}

export function exportTuneToChordPro(tune) {
  if (!tune) return '';
  if (tune.meta && tune.meta.chordProSource && String(tune.meta.chordProSource).trim()) {
    return String(tune.meta.chordProSource);
  }
  const lines = getLyricLines(tune);
  const header = buildHeaderDirectives(tune);
  const body = wLinesToChordProBody(lines);
  if (!body.trim()) {
    throw new Error('Tune has no chord sheet content to export');
  }
  return header + (header ? '\n' : '') + body + '\n';
}

export function exportTuneToOnSong(tune) {
  const chordPro = exportTuneToChordPro(tune);
  const lines = chordPro.split('\n').map(function(line) {
    const trimmed = line.trim();
    const metaMatch = trimmed.match(/^\{([a-z_]+):\s*(.+)\}$/i);
    if (metaMatch) {
      return '{{' + metaMatch[1] + ':' + metaMatch[2] + '}}';
    }
    return line;
  });
  return lines.join('\n');
}
