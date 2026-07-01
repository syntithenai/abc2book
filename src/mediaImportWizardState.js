import { loadMelodyNoteSettings, loadMelodyProcessingSettings } from './melodyProcessingSettings';
import { extractMelodySourceNotes, applyMelodyNoteSettingsToDraft } from './melodyRefilterUtils';
import { formatMediaAnalysisForTune } from './mediaAnalysisClient';

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
    baseTuneAbc: '',
    chordGridText: '',
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
    },
    existingWLines: [],
    lyricLines: [],
    lookupLyricLines: [],
  };
}

export function draftHasFinishableContent(draft) {
  if (!draft) return false;
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
  if (analysis.formatted) {
    const formatted = reformatAnalysisForDraft(next, analysis, null, tunebook) || analysis.formatted;
    next.chordGridText = formatted.chordsText || next.chordGridText || '';
    if (!next.melodyNotesEdited) {
      next.melodyNotesText = formatted.melodyText || next.melodyNotesText || '';
      next.melodyAbcText = formatted.melodyText || next.melodyAbcText || '';
    }
  }
  return next;
}
