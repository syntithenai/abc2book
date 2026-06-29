import { loadMelodyNoteSettings, loadMelodyProcessingSettings } from './melodyProcessingSettings';
import { extractMelodySourceNotes, applyMelodyNoteSettingsToDraft } from './melodyRefilterUtils';

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
      noteLength: tune && tune.noteLength ? tune.noteLength : '1/8',
    },
    existingWLines: [],
  };
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
    next.chordGridText = analysis.formatted.chordsText || next.chordGridText || '';
  }
  return next;
}
