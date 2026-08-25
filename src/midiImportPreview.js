import { applyMidiCleanup, DEFAULT_CLEANUP_OPTIONS } from './midiCleanupPreview';
import { buildCleanupScorePreviewAbc } from './midiCleanupNotationPreview';
import {
  applyMidiProfileVoiceNamesToAbc,
} from './midiImportAbcEnhance';
import {
  buildScoreDirective,
  noteLengthFromRhythmDetail,
  noteLengthFromSlotsPerBeat,
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
  // Snap/grid drives import quantization (same as piano-roll + wizard options).
  const slotsPerBeat = session.previewSnapSlotsPerBeat
    || slotsPerBeatFromRhythmDetail(filters.rhythmDetail || 'standard');
  const noteLength = noteLengthFromSlotsPerBeat(slotsPerBeat);
  const quantOn = filters.quantize !== false;
  const quantStrength = !quantOn
    ? 0
    : (filters.quantStrength != null ? filters.quantStrength : 1);

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
      allowChords: voice.filters ? voice.filters.allowChords !== false : true,
    };
  });

  let abc = buildCleanupScorePreviewAbc(voices, {
    tempoBpm: grid.tempoBpm || 120,
    meter: meter,
    key: (voices[0] && voices[0].key) || grid.estimatedKey || 'C',
    beatsPerBar: beatsPerBar,
    slotsPerBeat: slotsPerBeat,
    noteLength: noteLength,
    quantStrength: quantStrength,
    ticksPerBeat: (session.fileMeta && session.fileMeta.ticksPerBeat)
      || (session.profile && session.profile.ticks_per_beat)
      || 0,
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
  const noteLength = draft.noteLength
    || noteLengthFromSlotsPerBeat(slotsPerBeat)
    || noteLengthFromRhythmDetail(rhythmDetail);
  const quantStrength = draft.quantStrength != null ? draft.quantStrength : 1;

  const voices = resolveImportVoiceNotes(draft).map(function(voice) {
    const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
    return Object.assign({}, voice, {
      notes: cleaned.notes,
      name: voice.displayName,
      allowChords: draft.allowChords !== false,
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
    quantStrength: quantStrength,
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
