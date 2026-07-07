import { parseChordSheetText, createTuneFromChordSheet } from './chordProFormatUtils';
import { finalizeChordSheetToTune, noteLinesHaveRealMelody } from './timedImportFinalizer';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { getLyricLines, setLyricLines } from './wLinesUtils';

function buildSkeletonAbcFromMetadata(metadata) {
  const lines = [
    'X:1',
    'T:' + (metadata.title || 'Untitled'),
  ];
  if (metadata.composer) lines.push('C:' + metadata.composer);
  lines.push('M:' + (metadata.meter || '4/4'));
  if (metadata.tempo) lines.push('Q:1/4=' + metadata.tempo);
  lines.push('K:' + (metadata.key || 'C'));
  lines.push('|: z4 |]');
  return lines.join('\n');
}

export function buildDraftFromSheetImageResult(result, options) {
  const chordText = result && result.chordSheet ? result.chordSheet.text : '';
  const melody = result && result.melody ? result.melody : null;
  let chordDraft = null;
  if (chordText) {
    chordDraft = parseChordSheetText(chordText, {
      fallbackTitle: (result && result.title) || (options && options.fallbackTitle) || '',
    });
    if (result && result.title && !chordDraft.title) chordDraft.title = result.title;
    if (result && result.artist && !chordDraft.composer) chordDraft.composer = result.artist;
  }
  if (chordDraft && result && result.chordSheet && Array.isArray(result.chordSheet.lineDetails) && result.chordSheet.lineDetails.length > 0) {
    chordDraft.chordSheetAlignment = result.chordSheet.lineDetails.slice();
  }
  if (melody && melody.meter && chordDraft && !chordDraft.meter) chordDraft.meter = melody.meter;
  if (melody && melody.key && chordDraft && !chordDraft.key) chordDraft.key = melody.key;
  return {
    chordDraft: chordDraft,
    melodyAbc: melody && melody.abc ? melody.abc : '',
    warnings: (result && result.warnings ? result.warnings.slice() : []).concat(
      chordDraft && chordDraft.warnings ? chordDraft.warnings : []
    ),
  };
}

export function createTuneFromSheetImageImport(options) {
  const {
    result,
    tunebook,
    abcjsParser,
    book,
    chordTextOverride,
    melodyAbcOverride,
    titleOverride,
    artistOverride,
    keyOverride,
    meterOverride,
    mergeOptions,
  } = options;

  if (!result || !tunebook || !abcjsParser) {
    throw new Error('Missing dependencies for sheet image import');
  }

  const merge = Object.assign({
    title: true,
    composer: true,
    chordsLyrics: true,
    melody: true,
    keyMeter: true,
  }, mergeOptions || {});

  const chordText = merge.chordsLyrics
    ? String(chordTextOverride != null ? chordTextOverride : (result.chordSheet && result.chordSheet.text) || '').trim()
    : '';
  const melodyAbc = merge.melody
    ? String(melodyAbcOverride != null ? melodyAbcOverride : (result.melody && result.melody.abc) || '').trim()
    : '';

  if (!chordText && !melodyAbc) {
    throw new Error('Nothing to import from sheet image');
  }

  const resolvedTitle = titleOverride != null
    ? String(titleOverride).trim()
    : (result.title || '');
  const resolvedArtist = artistOverride != null
    ? String(artistOverride).trim()
    : (result.artist || '');
  const resolvedKey = keyOverride != null
    ? String(keyOverride).trim()
    : ((result.melody && result.melody.key) || '');
  const resolvedMeter = meterOverride != null
    ? String(meterOverride).trim()
    : ((result.melody && result.melody.meter) || '');

  let draft = null;
  if (chordText) {
    draft = parseChordSheetText(chordText, {
      fallbackTitle: merge.title ? (resolvedTitle || '') : '',
    });
    if (merge.title && resolvedTitle) draft.title = resolvedTitle;
    else if (merge.title && result.title && !draft.title) draft.title = result.title;
    if (merge.composer && resolvedArtist) draft.composer = resolvedArtist;
    else if (merge.composer && result.artist && !draft.composer) draft.composer = result.artist;
  } else {
    draft = {
      title: merge.title ? (resolvedTitle || 'Untitled') : 'Untitled',
      composer: merge.composer ? (resolvedArtist || '') : '',
      key: 'C',
      capo: 0,
      tempo: 100,
      meter: '4/4',
      lyricLines: [],
      chordText: '',
      chordProSource: '',
      warnings: [],
      sectionCount: 0,
      barCount: 0,
    };
  }

  if (result && result.chordSheet && Array.isArray(result.chordSheet.lineDetails) && result.chordSheet.lineDetails.length > 0) {
    draft.chordSheetAlignment = result.chordSheet.lineDetails.slice();
  }

  if (merge.keyMeter && resolvedMeter) draft.meter = resolvedMeter;
  else if (merge.keyMeter && result.melody && result.melody.meter && !draft.meter) draft.meter = result.melody.meter;
  if (merge.keyMeter && resolvedKey) draft.key = resolvedKey;
  else if (merge.keyMeter && result.melody && result.melody.key && !draft.key) draft.key = result.melody.key;

  const skeletonAbc = buildSkeletonAbcFromMetadata({
    title: draft.title,
    composer: draft.composer,
    meter: draft.meter,
    key: draft.key,
    tempo: draft.tempo,
  });

  const tune = tunebook.abcTools.abc2json(skeletonAbc);
  tune.name = draft.title || tune.name || 'Untitled';
  tune.composer = draft.composer || '';
  tune.key = draft.key || tune.key;
  tune.capo = draft.capo || 0;
  tune.tempo = draft.tempo || tune.tempo;
  tune.meter = draft.meter || tune.meter;
  tune.timingScaffold = !melodyAbc;
  const bookName = book ? String(book).trim() : '';
  tune.books = bookName ? [bookName] : [];
  tune.meta = Object.assign({}, tune.meta || {}, {
    chordProSource: draft.chordProSource || chordText || '',
    chordSheetAlignment: draft.chordSheetAlignment || null,
  });

  let mergedAbc = skeletonAbc;
  if (melodyAbc) {
    mergedAbc = abcjsParser.mergeMelody(melodyAbc, mergedAbc);
    tune.timingScaffold = false;
  }

  finalizeChordSheetToTune({
    tune: tune,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    abc: mergedAbc,
    chordGridText: draft.chordText || '',
    lyricLines: draft.lyricLines || [],
  });

  if (!getLyricLines(tune).length && Array.isArray(draft.lyricLines) && draft.lyricLines.length) {
    setLyricLines(tune, draft.lyricLines);
  }

  const voiceKey = resolvePrimaryVoiceKey(tune.voices);
  const noteLines = tune.voices && tune.voices[voiceKey] ? tune.voices[voiceKey].notes : [];
  if (melodyAbc && !noteLinesHaveRealMelody(noteLines)) {
    throw new Error('Melody import did not produce notation notes');
  }

  return tune;
}

export function createTuneFromChordSheetOnly(options) {
  return createTuneFromChordSheet(options);
}
