import { parseMidiBytesToTracks } from './midiParseClient';

function roleHintForTrack(track) {
  if (track.isDrum) return 'drum';
  const name = String(track.name || '').toLowerCase();
  if (/\b(bass|bs)\b/.test(name)) return 'bass';
  if (/\b(chord|comp|harm)\b/.test(name)) return 'harmony';
  if (/\b(melody|lead|vocal|voice)\b/.test(name)) return 'melody';
  return 'unknown';
}

function trackProfileFromParsed(track) {
  const notes = Array.isArray(track.notes) ? track.notes : [];
  const pitchedMidi = notes
    .filter(function(note) { return !track.isDrum && note.midi > 0; })
    .map(function(note) { return note.midi; });
  const minPitch = pitchedMidi.length ? Math.min.apply(null, pitchedMidi) : 0;
  const maxPitch = pitchedMidi.length ? Math.max.apply(null, pitchedMidi) : 0;
  return {
    index: track.index,
    name: track.name || ('Track ' + (track.index + 1)),
    is_drum: !!track.isDrum,
    program: track.program || 0,
    note_count: notes.length,
    chord_event_count: 0,
    monophony_score: notes.length <= 1 ? 1 : 0.5,
    mean_pitch: pitchedMidi.length
      ? pitchedMidi.reduce(function(sum, midi) { return sum + midi; }, 0) / pitchedMidi.length
      : 0,
    min_pitch: minPitch,
    max_pitch: maxPitch,
    pitch_range: maxPitch - minPitch,
    notes_per_second: 0,
    role_hint: roleHintForTrack(track),
  };
}

export function buildLocalMidiImportProfile(midiBytes, fileName) {
  const parsed = parseMidiBytesToTracks(midiBytes);
  const tracks = (parsed.tracks || []).map(trackProfileFromParsed);
  const pitched = tracks.filter(function(track) {
    return !track.is_drum && track.note_count > 0;
  });
  const recommendedTrackIds = pitched.length
    ? pitched.slice(0, Math.min(4, pitched.length)).map(function(track) { return track.index; })
    : [];
  const totalPitchedNotes = pitched.reduce(function(sum, track) {
    return sum + track.note_count;
  }, 0);

  return {
    tracks: tracks,
    recommended_mode: pitched.length > 1 ? 'multi_voice' : 'melody',
    routing_hint: pitched.length > 1 ? 'multi_voice' : 'melody',
    recommended_track_ids: recommendedTrackIds.length
      ? [recommendedTrackIds[0]]
      : [],
    tempo_bpm: parsed.tempoBpm || 120,
    time_signature: '4/4',
    beats_per_bar: 4,
    estimated_key: 'C',
    source_hint: 'unknown',
    title: String(fileName || 'import').replace(/\.mid(i)?$/i, ''),
    duration_seconds: 0,
    total_pitched_notes: totalPitchedNotes,
    reject_reason: totalPitchedNotes === 0 ? 'No pitched notes found in MIDI file' : '',
  };
}
