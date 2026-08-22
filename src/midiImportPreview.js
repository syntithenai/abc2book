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
