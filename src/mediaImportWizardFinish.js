import { clearTimedMediaDraft } from './timedMediaCache';
import { finalizeMediaTimedImport } from './timedImportFinalizer';
import { applyGeneratedBackgroundInfo } from './viewModeUtils';
import { mergeBibliographicList } from './tuneBibliographicUtils';

export function finishMediaImportWizard(options) {
  const {
    tune,
    tunebook,
    abcjsParser,
    draft,
    skipSave,
  } = options;

  if (!tune || !draft || !tunebook || !abcjsParser) {
    throw new Error('Missing data required to finish the media import wizard');
  }

  const metadata = draft.metadata || {};
  if (metadata.name) tune.name = metadata.name;
  if (metadata.composer) tune.composer = metadata.composer;
  if (metadata.meter) tune.meter = metadata.meter;
  if (metadata.key) tune.key = metadata.key;
  if (metadata.tempo) tune.tempo = metadata.tempo;
  if (metadata.noteLength) tune.noteLength = metadata.noteLength;
  if (metadata.backgroundInfo) applyGeneratedBackgroundInfo(tune, metadata.backgroundInfo);
  if (metadata.genre) {
    if (!Array.isArray(tune.genres)) tune.genres = [];
    tune.genres = mergeBibliographicList(tune.genres, metadata.genre);
  }

  const abcTools = tunebook.abcTools;
  const baseAbc = draft.baseTuneAbc && draft.baseTuneAbc.trim()
    ? draft.baseTuneAbc
    : abcTools.json2abc(tune);

  const baseJson = abcTools.abc2json(baseAbc);
  if (metadata.meter) baseJson.meter = metadata.meter;
  if (metadata.key) baseJson.key = metadata.key;
  if (metadata.tempo) baseJson.tempo = metadata.tempo;
  if (metadata.noteLength) baseJson.noteLength = metadata.noteLength;
  if (metadata.name) baseJson.name = metadata.name;
  if (metadata.composer) baseJson.composer = metadata.composer;
  if (metadata.backgroundInfo) applyGeneratedBackgroundInfo(baseJson, metadata.backgroundInfo);
  if (metadata.genre) {
    if (!Array.isArray(baseJson.genres)) baseJson.genres = [];
    baseJson.genres = mergeBibliographicList(baseJson.genres, metadata.genre);
  }

  finalizeMediaTimedImport({
    tune: tune,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    draft: draft,
    baseJson: baseJson,
  });

  if (tune.id) {
    clearTimedMediaDraft(tune.id);
  }

  if (skipSave) {
    return tune;
  }

  return tunebook.saveTune(tune, false, { historyLabel: 'Import from media', immediate: true });
}
