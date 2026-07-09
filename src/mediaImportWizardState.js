import { loadMelodyNoteSettings, loadMelodyProcessingSettings } from './melodyProcessingSettings';
import { extractMelodySourceNotes, applyMelodyNoteSettingsToDraft } from './melodyRefilterUtils';
import { formatMediaAnalysisForTune, tuneHasTempo } from './mediaAnalysisClient';
import { saveTimedMediaDraft } from './timedMediaCache';
import { needsComposerDiscovery } from './composerDiscoveryUtils';
import { applyGeneratedBackgroundInfo } from './viewModeUtils';

export function mergeLookupTuneMetadata(metadata, tune) {
  if (!tune) return metadata || {};
  const next = Object.assign({}, metadata || {});
  if (tune.name && !next.name) next.name = tune.name;
  if (tune.composer && !next.composer) next.composer = tune.composer;
  if (tune.key && !next.key) next.key = tune.key;
  if (tune.meter && !next.meter) next.meter = tune.meter;
  if (tune.noteLength && !next.noteLength) next.noteLength = tune.noteLength;
  if (tune.genre && !next.genre) next.genre = tune.genre;
  if (tune.tempo != null && tune.tempo !== '' && !tuneHasTempo({ tempo: next.tempo })) {
    next.tempo = String(tune.tempo);
  }
  return next;
}

export function createWizardDraft(tune) {
  const processingSettings = loadMelodyProcessingSettings();
  return {
    analyzed: false,
    analysisVersion: 0,
    rawAnalysis: null,
    timedLyrics: null,
    timedChords: null,
    timedMelody: null,
    melodySourceNotes: [],
    melodyAbcText: '',
    melodyNotesText: '',
    existingMelodyNotesText: '',
    analyzedMelodyNotesText: '',
    lookupMelodyNotesText: '',
    lookupNotationSource: '',
    baseTuneAbc: '',
    chordGridText: '',
    existingChordGridText: '',
    analyzedChordGridText: '',
    lookupChordGridText: '',
    lookupBackgroundInfo: '',
    lookupBackgroundSource: '',
    explicitImports: true,
    skipLyricsImport: false,
    lyricsExplicitlyImported: false,
    processingSettings: {
      musicType: processingSettings.musicType,
      applyAudioFilters: processingSettings.applyAudioFilters !== false,
      enableMeterChanges: false,
    },
    melodyNoteSettings: loadMelodyNoteSettings(),
    sections: [],
    lyricRows: [],
    mergedLyricLines: [],
    metadata: {
      name: tune && tune.name ? tune.name : '',
      composer: tune && tune.composer ? tune.composer : '',
      meter: tune && tune.meter ? tune.meter : '4/4',
      key: tune && tune.key ? tune.key : '',
      tempo: tune && tune.tempo ? tune.tempo : '',
      noteLength: tune && tune.noteLength ? tune.noteLength : '1/8',
      backgroundInfo: tune && tune.backgroundInfo ? tune.backgroundInfo : '',
      genre: tune && tune.genre ? tune.genre : '',
    },
    existingWLines: [],
    lyricLines: [],
    lookupLyricLines: [],
    lookupLyricSource: '',
  };
}

export function draftHasFinishableContent(draft) {
  if (!draft) return false;
  if (draft.skipLyricsImport) {
    const hasChords = !!(draft.chordGridText && draft.chordGridText.trim());
    const hasNotation = !!(draft.melodyNotesText && draft.melodyNotesText.trim());
    return hasChords || hasNotation;
  }
  const lyricLines = draft.lyricLines || draft.mergedLyricLines || draft.existingWLines || [];
  const hasLyrics = lyricLines.some(function(line) { return String(line || '').trim(); });
  const hasChords = !!(draft.chordGridText && draft.chordGridText.trim());
  const hasNotation = !!(draft.melodyNotesText && draft.melodyNotesText.trim());
  return hasLyrics || hasChords || hasNotation;
}

export function reformatAnalysisForDraft(draft, analysis, tune, tunebook) {
  if (!analysis || !analysis.raw) return null;
  const includeMeterChanges = !!(draft.processingSettings && draft.processingSettings.enableMeterChanges);
  return formatMediaAnalysisForTune(analysis.raw, tune, tunebook, { includeMeterChanges: includeMeterChanges });
}

export function applyAnalysisToDraft(draft, analysis, tunebook) {
  if (!draft || !analysis) return draft;
  const next = Object.assign({}, draft);
  next.analyzed = true;
  next.analysisVersion = analysis.version || 0;
  next.rawAnalysis = analysis.raw || null;
  if (analysis.timed) {
    next.timedLyrics = analysis.timed.timedLyrics || null;
    next.timedChords = analysis.timed.timedChords || null;
    next.timedMelody = analysis.timed.timedMelody || null;
  }
  const rawMelody = analysis.raw && analysis.raw.melody ? analysis.raw.melody : null;
  next.melodySourceNotes = extractMelodySourceNotes(rawMelody, next.timedMelody);
  const refiltered = applyMelodyNoteSettingsToDraft(
    next,
    next.melodyNoteSettings || loadMelodyNoteSettings(),
    tunebook
  );
  Object.assign(next, refiltered);
  const preservedMelody = draft.melodyNotesText || '';
  if (analysis.formatted) {
    const formatted = reformatAnalysisForDraft(next, analysis, null, tunebook) || analysis.formatted;
    next.analyzedChordGridText = formatted.chordsText || next.analyzedChordGridText || '';
    const analyzedMelody = refiltered.melodyNotesText
      || formatted.melodyText
      || next.analyzedMelodyNotesText
      || '';
    if (analyzedMelody) {
      next.analyzedMelodyNotesText = analyzedMelody;
      next.melodyAbcText = refiltered.melodyAbcText || analyzedMelody;
    }
  }
  next.melodyNotesText = preservedMelody;
  return next;
}

export async function persistMediaImportLookupResults(tuneId, results, tune, tunebook) {
  if (!tuneId || !results) return;

  const draft = {};
  if (results.lookupChordGridText && String(results.lookupChordGridText).trim()) {
    draft.chordGridText = String(results.lookupChordGridText).trim();
  }
  if (Array.isArray(results.lookupLyricLines) && results.lookupLyricLines.length) {
    draft.transcriptionText = results.lookupLyricLines.join('\n');
  }
  if (Array.isArray(results.lookupComposerCandidates) && results.lookupComposerCandidates.length) {
    draft.lookupComposerCandidates = results.lookupComposerCandidates;
  }
  if (Object.keys(draft).length) {
    await saveTimedMediaDraft(tuneId, draft);
  }

  if (!tune || !tunebook || typeof tunebook.saveTune !== 'function') return;

  const nextTune = Object.assign({}, tune);
  let changed = false;
  if (results.lookupBackgroundInfo && String(results.lookupBackgroundInfo).trim()
    && !String(nextTune.backgroundInfo || '').trim()) {
    applyGeneratedBackgroundInfo(nextTune, results.lookupBackgroundInfo);
    changed = true;
  }
  if (results.lookupArtist && String(results.lookupArtist).trim()
    && needsComposerDiscovery(nextTune.composer)
    && !(Array.isArray(results.lookupComposerCandidates) && results.lookupComposerCandidates.length)) {
    nextTune.composer = String(results.lookupArtist).trim();
    changed = true;
  }
  if (changed) {
    tunebook.saveTune(nextTune);
  }
}
