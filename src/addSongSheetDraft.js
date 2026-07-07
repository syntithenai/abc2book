import { parseChordSheetText } from './chordProFormatUtils';
import { getPlainLyricLines } from './wLinesUtils';

export function applyEmptyMetaFromSheetDraft(draft, current) {
  const next = Object.assign({}, current || {});
  if (!String(next.title || '').trim() && draft.title) next.title = draft.title;
  if (!String(next.artist || '').trim() && draft.artist) next.artist = draft.artist;
  if (!String(next.key || '').trim() && draft.key) next.key = draft.key;
  if (!String(next.meter || '').trim() && draft.meter) next.meter = draft.meter;
  return next;
}

export function applySheetDraftMergeOptions(draft, mergeOptions, helpers) {
  const opts = mergeOptions || {};
  const result = {};
  const meta = draft.meta || {};

  if (opts.title && meta.title) result.title = meta.title;
  if (opts.composer && meta.artist) result.artist = meta.artist;
  if (opts.keyMeter) {
    if (meta.key) result.key = meta.key;
    if (meta.meter) result.meter = meta.meter;
  }
  if (Array.isArray(meta.aliases) && meta.aliases.length) {
    result.aliases = meta.aliases.slice();
  }

  if (opts.chordsLyrics && String(draft.chordText || '').trim()) {
    const parsed = parseChordSheetText(draft.chordText, {
      fallbackTitle: meta.title || draft.title || '',
    });
    const lyricLines = Array.isArray(parsed.lyricLines) ? parsed.lyricLines.filter(Boolean) : [];
    result.lyrics = lyricLines.length
      ? lyricLines.join('\n')
      : String(draft.chordText || '').trim();
  }

  if (opts.melody && String(draft.melodyAbc || '').trim() && helpers) {
    const skeletonAbc = [
      'X:1',
      'M:' + (meta.meter || draft.meter || '4/4'),
      'K:' + (meta.key || draft.key || 'C'),
      '|: z4 |]',
    ].join('\n');
    const merged = helpers.abcjsParser.mergeMelody(draft.melodyAbc, skeletonAbc);
    const noteLines = helpers.tunebook.abcTools.justNotes(merged);
    result.notes = Array.isArray(noteLines) ? noteLines.join('\n') : String(noteLines || '');
  }

  return result;
}

export function lyricsFromImportedTune(tune) {
  if (!tune) return '';
  if (Array.isArray(tune.words) && tune.words.length) {
    return tune.words.join('\n');
  }
  const plain = getPlainLyricLines(tune);
  if (plain.length) return plain.join('\n');
  return '';
}

export function notationFromImportedTune(tune, tunebook) {
  if (!tune || !tunebook) return '';
  if (tune.voices) {
    const voiceKey = Object.keys(tune.voices)[0];
    if (voiceKey && tune.voices[voiceKey] && Array.isArray(tune.voices[voiceKey].notes)) {
      return tune.voices[voiceKey].notes.join('\n');
    }
  }
  try {
    const noteLines = tunebook.abcTools.justNotes(tunebook.abcTools.json2abc(tune));
    return Array.isArray(noteLines) ? noteLines.join('\n') : String(noteLines || '');
  } catch (e) {
    return '';
  }
}
