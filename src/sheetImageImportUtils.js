import { parseChordSheetText, createTuneFromChordSheet } from './chordProFormatUtils';
import { finalizeChordSheetToTune, noteLinesHaveRealMelody } from './timedImportFinalizer';
import { resolvePrimaryVoiceKey } from './abcVoiceUtils';
import { getLyricLines, setLyricLines } from './wLinesUtils';
import { normalizeSheetFormat, sheetFormatIsTextOnly, sheetFormatNeedsMelody } from './sheetImageFormats';

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

function metaFromResult(result) {
  const meta = result && result.meta && typeof result.meta === 'object' ? result.meta : null;
  return {
    title: (meta && meta.title) || (result && result.title) || '',
    artist: (meta && meta.artist) || (result && result.artist) || '',
    composer: (meta && meta.composer) || (meta && meta.artist) || (result && result.artist) || '',
    key: (meta && meta.key) || '',
    capo: meta && meta.capo != null ? meta.capo : null,
    sourceFormat: (meta && meta.sourceFormat)
      || (result && (result.sheetFormat || result.pageType))
      || '',
  };
}

export function buildDraftFromSheetImageResult(result, options) {
  const chordText = result && result.chordSheet ? result.chordSheet.text : '';
  const melody = result && result.melody ? result.melody : null;
  const sheetMeta = metaFromResult(result);
  const format = normalizeSheetFormat(result && (result.sheetFormat || result.pageType));
  let chordDraft = null;
  if (chordText) {
    chordDraft = parseChordSheetText(chordText, {
      fallbackTitle: sheetMeta.title || (options && options.fallbackTitle) || '',
    });
    if (sheetMeta.title && !chordDraft.title) chordDraft.title = sheetMeta.title;
    if (sheetMeta.composer && !chordDraft.composer) chordDraft.composer = sheetMeta.composer;
    if (sheetMeta.key && !chordDraft.key) chordDraft.key = sheetMeta.key;
    if (sheetMeta.capo != null && !chordDraft.capo) chordDraft.capo = sheetMeta.capo;
  }
  if (chordDraft && result && result.chordSheet && Array.isArray(result.chordSheet.lineDetails) && result.chordSheet.lineDetails.length > 0) {
    chordDraft.chordSheetAlignment = result.chordSheet.lineDetails.slice();
  }
  if (melody && melody.meter && chordDraft && !chordDraft.meter) chordDraft.meter = melody.meter;
  if (melody && melody.key && chordDraft && !chordDraft.key) chordDraft.key = melody.key;
  return {
    chordDraft: chordDraft,
    melodyAbc: (!sheetFormatIsTextOnly(format) && melody && melody.abc) ? melody.abc : '',
    sheetFormat: format,
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

  const format = normalizeSheetFormat(result.sheetFormat || result.pageType);
  const textOnly = sheetFormatIsTextOnly(format);
  const sheetMeta = metaFromResult(result);

  const merge = Object.assign({
    title: true,
    composer: true,
    chordsLyrics: true,
    melody: sheetFormatNeedsMelody(format),
    keyMeter: true,
  }, mergeOptions || {});

  const chordText = merge.chordsLyrics
    ? String(chordTextOverride != null ? chordTextOverride : (result.chordSheet && result.chordSheet.text) || '').trim()
    : '';
  const melodyAbc = merge.melody && !textOnly
    ? String(melodyAbcOverride != null ? melodyAbcOverride : (result.melody && result.melody.abc) || '').trim()
    : '';

  if (!chordText && !melodyAbc) {
    throw new Error('Nothing to import from sheet image');
  }

  const resolvedTitle = titleOverride != null
    ? String(titleOverride).trim()
    : (sheetMeta.title || '');
  const resolvedArtist = artistOverride != null
    ? String(artistOverride).trim()
    : (sheetMeta.composer || sheetMeta.artist || '');
  const resolvedKey = keyOverride != null
    ? String(keyOverride).trim()
    : (sheetMeta.key || (result.melody && result.melody.key) || '');
  const resolvedMeter = meterOverride != null
    ? String(meterOverride).trim()
    : ((result.melody && result.melody.meter) || '');

  let draft = null;
  if (chordText) {
    draft = parseChordSheetText(chordText, {
      fallbackTitle: merge.title ? (resolvedTitle || '') : '',
    });
    if (merge.title && resolvedTitle) draft.title = resolvedTitle;
    else if (merge.title && sheetMeta.title && !draft.title) draft.title = sheetMeta.title;
    if (merge.composer && resolvedArtist) draft.composer = resolvedArtist;
    else if (merge.composer && sheetMeta.composer && !draft.composer) draft.composer = sheetMeta.composer;
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
  if (sheetMeta.capo != null && !draft.capo) draft.capo = sheetMeta.capo;

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
    sheetFormat: format,
    sourceFormat: sheetMeta.sourceFormat || format,
  });
  tune.sheetFormat = format;
  tune.pageType = format;

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
