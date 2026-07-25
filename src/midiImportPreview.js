import { applyMidiCleanup, DEFAULT_CLEANUP_OPTIONS } from './midiCleanupPreview';
import { buildCleanupScorePreviewAbc } from './midiCleanupNotationPreview';
import { parseMidiBytesToTracks, resolveCleanupPreviewVoices } from './midiParseClient';

/**
 * Build the same ABC score used in cleanup preview — shared with final preview/import.
 */
export function buildMidiImportAbcFromDraft(draft) {
  if (!draft || !draft.midiBytes) return '';
  const parsed = parseMidiBytesToTracks(draft.midiBytes);
  const tempo = draft.tempoBpm || parsed.tempoBpm || 120;
  const cleanup = draft.cleanupSkipped ? null : (draft.cleanupOptions || DEFAULT_CLEANUP_OPTIONS);
  const meter = draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4';
  const beatsPerBar = parseInt(String(meter).split('/')[0], 10) || 4;

  const voices = resolveCleanupPreviewVoices(
    parsed,
    draft.profile,
    draft.selectedTrackIds,
    draft.drumTrackModes
  ).map(function(voice) {
    const cleaned = applyMidiCleanup(voice.notes, cleanup, tempo);
    return Object.assign({}, voice, { notes: cleaned.notes });
  });

  return buildCleanupScorePreviewAbc(voices, {
    tempoBpm: tempo,
    meter: meter,
    key: draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C',
    beatsPerBar: beatsPerBar,
    slotsPerBeat: draft.quantSlotsPerBeat || 2,
    noteLength: draft.noteLength || '1/8',
  });
}
