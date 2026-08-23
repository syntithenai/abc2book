import { applyMidiCleanup, DEFAULT_CLEANUP_OPTIONS } from './midiCleanupPreview';
import { buildCleanupScorePreviewAbc } from './midiCleanupNotationPreview';
import {
  applyMidiProfileVoiceNamesToAbc,
} from './midiImportAbcEnhance';
import {
  buildScoreDirective,
  noteLengthFromRhythmDetail,
  resolveImportVoiceNotes,
  slotsPerBeatFromRhythmDetail,
} from './midiImportWizardState';
import { processSessionVoices } from './midiImportVoicePipeline';
import { sessionAsDraft, defaultVoiceFilters } from './midiImportSession';

/**
 * Build ABC from import session (per-voice filters + grid).
 */
export function buildMidiImportAbcFromSession(session) {
  if (!session || !session.midiBytes) return '';
  const processed = processSessionVoices(session);
  if (!processed.length) return '';

  const headerVoice = processed[0];
  const grid = Object.assign({}, session.sharedGrid || {}, headerVoice && headerVoice.grid || {});
  const filters = (headerVoice && headerVoice.filters) || defaultVoiceFilters();
  const meter = grid.timeSignature || '4/4';
  const beatsPerBar = parseInt(String(meter).split('/')[0], 10) || 4;
  const rhythmDetail = filters.rhythmDetail || 'standard';
  const slotsPerBeat = slotsPerBeatFromRhythmDetail(rhythmDetail);
  const noteLength = noteLengthFromRhythmDetail(rhythmDetail);

  const voices = processed.map(function(voice, index) {
    return {
      id: index + 1,
      notes: voice.notes || [],
      isDrum: voice.isDrum,
      roleHint: voice.isDrum ? 'drum' : 'melody',
      program: voice.program || 0,
      staff: voice.staff,
      system: voice.system,
      displayName: voice.displayName,
      sourceIds: voice.sourceTrackIds,
      key: (voice.grid && voice.grid.estimatedKey)
        || (session.sharedGrid && session.sharedGrid.estimatedKey)
        || 'C',
    };
  });

  let abc = buildCleanupScorePreviewAbc(voices, {
    tempoBpm: grid.tempoBpm || 120,
    meter: meter,
    key: (voices[0] && voices[0].key) || grid.estimatedKey || 'C',
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    noteLength: noteLength,
    quantStrength: filters.quantStrength != null ? filters.quantStrength : 0.7,
  });

  const scoreDirective = buildScoreDirective(voices.map(function(v) {
    return {
      staff: v.staff,
      system: v.system,
    };
  }));
  abc = applyMidiProfileVoiceNamesToAbc(abc, session.profile, {
    importVoices: voices,
    scoreDirective: scoreDirective,
    trackIds: voices.reduce(function(ids, voice) {
      return ids.concat(voice.sourceIds || []);
    }, []),
  });

  return abc;
}

export function buildLocalMidiImportResultFromSession(session) {
  const draft = sessionAsDraft(session);
  const abc = buildMidiImportAbcFromSession(session);
  return {
    abc: abc,
    musicXml: '',
    strategy: 'note_events_local',
    mode: draft.mode || 'melody',
    confidence: 0.5,
    warnings: abc
      ? ['Converted locally from MIDI import editor (per-voice filters).']
      : ['Local MIDI conversion produced no notes.'],
    diagnostics: {
      local: true,
      voiceCount: (session.voices || []).filter(function(v) { return v.enabled; }).length,
    },
    profile: session.profile || {},
    score: null,
    chordSegments: null,
    harmonyAbc: '',
    harmonyVoiceName: '',
    chords: null,
  };
}

/**
 * Build ABC from the wizard draft using local note-events (merge groups + staff).
 * Used for cleanup/preview and offline import when the resolver is unavailable.
 */
export function buildMidiImportAbcFromDraft(draft) {
  if (!draft || !draft.midiBytes) return '';
  const tempo = draft.tempoBpm || 120;
  const cleanup = draft.cleanupSkipped ? null : (draft.cleanupOptions || DEFAULT_CLEANUP_OPTIONS);
  const meter = draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4';
  const beatsPerBar = parseInt(String(meter).split('/')[0], 10) || 4;
  const rhythmDetail = draft.rhythmDetail || 'standard';
  const slotsPerBeat = draft.quantSlotsPerBeat || slotsPerBeatFromRhythmDetail(rhythmDetail);
  const noteLength = draft.noteLength || noteLengthFromRhythmDetail(rhythmDetail);

  const voices = resolveImportVoiceNotes(draft).map(function(voice) {
    const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
    return Object.assign({}, voice, {
      notes: cleaned.notes,
      name: voice.displayName,
    });
  });

  if (!voices.length) return '';

  let abc = buildCleanupScorePreviewAbc(voices, {
    tempoBpm: tempo,
    meter: meter,
    key: draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C',
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    noteLength: noteLength,
    quantStrength: draft.quantStrength != null ? draft.quantStrength : 0.7,
  });

  const scoreDirective = buildScoreDirective(voices);
  abc = applyMidiProfileVoiceNamesToAbc(abc, draft.profile, {
    importVoices: voices,
    scoreDirective: scoreDirective,
    trackIds: voices.reduce(function(ids, voice) {
      return ids.concat(voice.sourceIds || []);
    }, []),
  });

  return abc;
}

/**
 * Offline import result shaped like importMidiToAbc response.
 */
export function buildLocalMidiImportResult(draft) {
  const abc = buildMidiImportAbcFromDraft(draft);
  return {
    abc: abc,
    musicXml: '',
    strategy: 'note_events_local',
    mode: draft.mode || 'melody',
    confidence: 0.4,
    warnings: abc
      ? ['Converted locally without the media resolver (basic note-events).']
      : ['Local MIDI conversion produced no notes.'],
    diagnostics: {
      local: true,
      voiceCount: resolveImportVoiceNotes(draft).length,
    },
    profile: draft.profile || {},
    score: null,
    chordSegments: null,
    harmonyAbc: '',
    harmonyVoiceName: '',
    chords: null,
  };
}
