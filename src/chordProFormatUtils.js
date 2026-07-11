import ChordSheetJS from 'chordsheetjs';
import { classifyLyricChordLines, hasChordLines, isChordLine, isSectionHeader } from './chordSheetUtils';
import { buildChordSheetAlignmentFromLines, sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils';
import { setLyricLines, getLyricLines } from './wLinesUtils';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { applyChordSheetToTune } from './applyChordSheetToTune';
import { getBarModel, fullBarRestAbc } from './barModel';

const { ChordProParser, ChordsOverWordsParser, ChordProFormatter } = ChordSheetJS;

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
  if (textHasChordProInlineChords(sample)) return 'chordpro';
  return 'chords-over-words';
}

function textHasChordProInlineChords(text) {
  return String(text || '').split(/\r?\n/).some(function(raw) {
    const line = String(raw || '').trim();
    if (!line) return false;
    if (isSectionHeader(line)) return false;
    return /\[[A-G][#b]?[^\]]*\]/.test(line);
  });
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

function buildChordSheetDraftFromLines(sheetLines, sourceText, options, metadata) {
  const meta = metadata || {};
  const lyricLines = sheetLinesToLyricLines(sheetLines);
  const chordText = sheetLinesToWizardChords(sheetLines);
  const warnings = Array.isArray(meta.warnings) ? meta.warnings.slice() : [];

  if (!lyricLines.length && !chordText.trim()) {
    throw new Error('No lyrics or chords found in chord sheet');
  }

  if (/\{text(fill|color)/i.test(sourceText)) {
    warnings.push('Color directives are not preserved on import.');
  }

  return {
    title: meta.title || (options && options.fallbackTitle) || '',
    composer: meta.composer || '',
    key: meta.key || '',
    capo: meta.capo != null && meta.capo !== '' ? parseInt(meta.capo, 10) || 0 : 0,
    tempo: meta.tempo ? parseInt(meta.tempo, 10) || 100 : 100,
    meter: meta.time || meta.meter || '4/4',
    tuning: meta.tuning || '',
    lyricLines: lyricLines,
    chordText: chordText,
    chordProSource: sourceText,
    chordSheetAlignment: buildChordSheetAlignmentFromLines(sheetLines),
    warnings: warnings,
    sectionCount: sheetLines.filter(function(line) { return isSectionHeader(line); }).length,
    barCount: chordText ? chordText.split('\n').filter(function(line) { return line.trim(); }).length : 0,
  };
}

function parseChordOverWordsSheetText(sourceText, options) {
  const allLines = sourceText.split(/\r?\n/);
  const preamble = extractChordSheetPreambleMeta(allLines);
  const sheetLines = preamble.strippedLines;
  return buildChordSheetDraftFromLines(sheetLines, sourceText, options, {
    title: preamble.title,
    composer: preamble.composer,
    key: preamble.key,
    capo: preamble.capo,
    tempo: preamble.tempo,
    meter: preamble.meter,
    tuning: preamble.tuning,
  });
}

export function parseChordSheetText(text, options) {
  const sourceText = String(text || '');
  if (!sourceText.trim()) {
    throw new Error('Chord sheet is empty');
  }

  const format = detectChordSheetFormat(sourceText);
  if (format === 'chords-over-words') {
    return parseChordOverWordsSheetText(sourceText, options);
  }

  const song = parseSongFromText(sourceText);
  const sheetLines = stripMetadataLines(songToSheetLines(song));
  return buildChordSheetDraftFromLines(sheetLines, sourceText, options, {
    title: song.title || '',
    composer: song.composer || song.artist || song.subtitle || '',
    key: song.key || '',
    capo: song.capo,
    tempo: song.tempo,
    time: song.time || '',
  });
}

function buildSkeletonAbc(draft) {
  const meter = draft.meter || '4/4';
  const model = getBarModel(meter, draft.noteLength || null);
  const lines = [
    'X:1',
    'T:' + (draft.title || 'Untitled'),
  ];
  if (draft.composer) lines.push('C:' + draft.composer);
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
