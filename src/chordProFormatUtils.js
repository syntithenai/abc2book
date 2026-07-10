import ChordSheetJS from 'chordsheetjs';
import { classifyLyricChordLines, hasChordLines, isSectionHeader } from './chordSheetUtils';
import { buildChordSheetAlignmentFromLines, sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils';
import { setLyricLines, getLyricLines } from './wLinesUtils';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { finalizeChordSheetToTune } from './timedImportFinalizer';

const { ChordProParser, ChordsOverWordsParser, ChordProFormatter } = ChordSheetJS;

const CHORD_SHEET_EXTENSIONS = ['.cho', '.pro', '.crd', '.onsong', '.txt'];

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
    if (/^(title|artist|subtitle|key|capo|tempo|time)\s*:/i.test(trimmed)) return false;
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
  const sheetLines = sourceText.split(/\r?\n/);
  return buildChordSheetDraftFromLines(sheetLines, sourceText, options, {});
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
    composer: song.artist || song.subtitle || '',
    key: song.key || '',
    capo: song.capo,
    tempo: song.tempo,
    time: song.time || '',
  });
}

function buildSkeletonAbc(draft) {
  const lines = [
    'X:1',
    'T:' + (draft.title || 'Untitled'),
  ];
  if (draft.composer) lines.push('C:' + draft.composer);
  lines.push('M:' + (draft.meter || '4/4'));
  if (draft.tempo) lines.push('Q:1/4=' + draft.tempo);
  lines.push('K:' + (draft.key || 'C'));
  lines.push('|: z4 |]');
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
  tune.name = draft.title || tune.name || 'Untitled';
  tune.composer = draft.composer || '';
  tune.key = draft.key || tune.key;
  tune.capo = draft.capo || 0;
  tune.tempo = draft.tempo || tune.tempo;
  tune.meter = draft.meter || tune.meter;
  tune.timingScaffold = true;
  const bookName = book ? String(book).trim() : '';
  tune.books = bookName ? [bookName] : [];
  tune.meta = Object.assign({}, tune.meta || {}, {
    chordProSource: draft.chordProSource || '',
    chordSheetAlignment: draft.chordSheetAlignment || null,
  });

  finalizeChordSheetToTune({
    tune: tune,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    abc: skeletonAbc,
    chordGridText: draft.chordText || '',
    lyricLines: draft.lyricLines || [],
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
