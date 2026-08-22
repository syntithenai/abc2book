import { parseMidiBytesToTracks } from './midiParseClient';

function roleHintForTrack(track) {
  if (track.isDrum) return 'drum';
  const name = String(track.name || '').toLowerCase();
  if (/\b(bass|bs)\b/.test(name)) return 'bass';
  if (/\b(chord|comp|harm|pad|guitar|piano)\b/.test(name)) return 'harmony';
  if (/\b(melody|lead|vocal|voice|soprano|alto|tenor)\b/.test(name)) return 'melody';
  const mean = track._meanPitch;
  if (mean && mean < 52) return 'bass';
  if (mean && mean > 67) return 'melody';
  return 'unknown';
}

function trackProfileFromParsed(track) {
  const notes = Array.isArray(track.notes) ? track.notes : [];
  const pitchedMidi = notes
    .filter(function(note) { return !track.isDrum && note.midi > 0; })
    .map(function(note) { return note.midi; });
  const minPitch = pitchedMidi.length ? Math.min.apply(null, pitchedMidi) : 0;
  const maxPitch = pitchedMidi.length ? Math.max.apply(null, pitchedMidi) : 0;
  const meanPitch = pitchedMidi.length
    ? pitchedMidi.reduce(function(sum, midi) { return sum + midi; }, 0) / pitchedMidi.length
    : 0;
  const enriched = Object.assign({}, track, { _meanPitch: meanPitch });
  return {
    index: track.index,
    smf_track_index: track.smfTrackIndex != null ? track.smfTrackIndex : track.index,
    channel: track.channel != null ? track.channel : 0,
    voice_id: track.voiceId || ('t' + track.index + '-c' + (track.channel != null ? track.channel : 0)),
    name: track.name || ('Track ' + (track.index + 1)),
    is_drum: !!track.isDrum,
    program: track.program || 0,
    note_count: notes.length,
    chord_event_count: 0,
    monophony_score: notes.length <= 1 ? 1 : 0.5,
    mean_pitch: meanPitch,
    min_pitch: minPitch,
    max_pitch: maxPitch,
    pitch_range: maxPitch - minPitch,
    notes_per_second: 0,
    role_hint: roleHintForTrack(enriched),
  };
}

function recommendTrackIds(pitched) {
  if (!pitched.length) return [];
  const byRole = function(role) {
    return pitched.filter(function(t) { return t.role_hint === role; });
  };
  const melody = byRole('melody');
  const bass = byRole('bass');
  const harmony = byRole('harmony');
  const ranked = pitched.slice().sort(function(a, b) {
    return (b.note_count || 0) - (a.note_count || 0);
  });
  const topCount = ranked[0].note_count || 1;
  const minNotes = Math.max(20, Math.floor(topCount * 0.01));
  const picks = [];

  function add(track) {
    if (!track) return;
    if (picks.indexOf(track.index) >= 0) return;
    if ((track.note_count || 0) < minNotes && picks.length) return;
    picks.push(track.index);
  }

  if (melody.length) {
    add(melody.sort(function(a, b) { return b.monophony_score - a.monophony_score; })[0]);
  } else {
    add(ranked[0]);
  }
  if (bass.length) add(bass[0]);
  if (harmony.length) add(harmony[0]);
  if (picks.length < 2 && ranked.length > 1) {
    ranked.forEach(function(track) { add(track); });
  }
  return picks.slice(0, Math.max(1, Math.min(4, picks.length || 1)));
}

export function buildLocalMidiImportProfile(midiBytes, fileName) {
  const parsed = parseMidiBytesToTracks(midiBytes);
  const tracks = (parsed.tracks || []).map(trackProfileFromParsed);
  const pitched = tracks.filter(function(track) {
    return !track.is_drum && track.note_count > 0;
  });
  const recommendedTrackIds = recommendTrackIds(pitched);
  const totalPitchedNotes = pitched.reduce(function(sum, track) {
    return sum + track.note_count;
  }, 0);

  return {
    tracks: tracks,
    recommended_mode: recommendedTrackIds.length > 1 ? 'multi_voice' : 'melody',
    routing_hint: recommendedTrackIds.length > 1 ? 'multi_voice' : 'melody',
    recommended_track_ids: recommendedTrackIds,
    tempo_bpm: parsed.tempoBpm || 120,
    time_signature: '4/4',
    beats_per_bar: 4,
    estimated_key: 'C',
    source_hint: 'local_smf',
    title: String(fileName || 'import').replace(/\.mid(i)?$/i, ''),
    duration_seconds: 0,
    total_pitched_notes: totalPitchedNotes,
    reject_reason: totalPitchedNotes === 0 ? 'No pitched notes found in MIDI file' : '',
    parse_format: parsed.format,
    voice_count_client: tracks.filter(function(t) { return (t.note_count || 0) > 0; }).length,
  };
}
