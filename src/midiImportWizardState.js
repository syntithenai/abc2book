import { DEFAULT_CLEANUP_OPTIONS, LIGHT_CLEANUP_OPTIONS } from './midiCleanupPreview';

export function pitchedTracksWithNotes(tracks) {
  return (tracks || []).filter(function(t) {
    return !t.is_drum && (t.note_count || 0) > 0;
  });
}

export function sortTracksByNoteCount(tracks) {
  return (tracks || []).slice().sort(function(a, b) {
    return (b.note_count || 0) - (a.note_count || 0);
  });
}

export function defaultSelectedTrackIds(profile) {
  const pitched = sortTracksByNoteCount(pitchedTracksWithNotes(profile && profile.tracks));
  if (!pitched.length) return [];

  const recommended = Array.isArray(profile.recommended_track_ids)
    ? profile.recommended_track_ids.filter(function(id) {
      const track = pitched.find(function(t) { return t.index === id; });
      return track && (track.note_count || 0) > 0;
    })
    : [];

  const ranked = sortTracksByNoteCount(pitched);
  const ordered = [];
  recommended.forEach(function(id) {
    if (ordered.indexOf(id) < 0) ordered.push(id);
  });
  ranked.forEach(function(track) {
    if (ordered.indexOf(track.index) < 0) ordered.push(track.index);
  });
  return ordered;
}

export function countSelectedVoices(draft) {
  const pitched = (draft.selectedTrackIds || []).length;
  const percussion = Object.keys(draft.drumTrackModes || {}).filter(function(trackId) {
    return draft.drumTrackModes[trackId] === 'percussion';
  }).length;
  return pitched + percussion;
}

export function createMidiImportDraft(options) {
  const opts = options || {};
  return {
    fileName: opts.fileName || 'import.mid',
    sourceUrl: opts.sourceUrl || '',
    midiBytes: opts.midiBytes || null,
    profile: opts.profile || null,
    selectedTrackIds: opts.selectedTrackIds || [],
    drumTrackModes: opts.drumTrackModes || {},
    mode: opts.mode || 'melody',
    strategy: opts.strategy || 'auto',
    includeChords: opts.includeChords === true,
    quantSlotsPerBeat: opts.quantSlotsPerBeat || 2,
    quantStrength: opts.quantStrength != null ? opts.quantStrength : 0.7,
    rhythmDetail: opts.rhythmDetail || 'standard',
    noteLength: opts.noteLength || '1/8',
    tempoBpm: opts.tempoBpm || null,
    timeSignature: opts.timeSignature || '',
    estimatedKey: opts.estimatedKey || '',
    cleanupOptions: opts.cleanupOptions ? Object.assign({}, opts.cleanupOptions) : null,
    cleanupSkipped: opts.cleanupSkipped === true,
    previewResult: null,
    importResult: null,
  };
}

export function initDraftFromProfile(draft, profile) {
  if (!profile) return draft;
  const next = Object.assign({}, draft, { profile: profile });
  next.selectedTrackIds = defaultSelectedTrackIds(profile);
  next.mode = next.selectedTrackIds.length >= 2 ? 'multi_voice'
    : (profile.recommended_mode === 'multi_voice' ? 'multi_voice' : 'melody');
  next.tempoBpm = profile.tempo_bpm || null;
  next.timeSignature = profile.time_signature || '';
  next.estimatedKey = profile.estimated_key || '';
  const drumModes = {};
  (profile.tracks || []).forEach(function(track) {
    if (track.is_drum) {
      drumModes[track.index] = 'percussion';
    }
  });
  next.drumTrackModes = drumModes;
  if (!next.cleanupOptions && !next.cleanupSkipped) {
    next.cleanupOptions = defaultCleanupOptions();
  }
  return next;
}

export function buildImportOptionsFromDraft(draft) {
  const drumTrackIds = Object.keys(draft.drumTrackModes || {}).filter(function(trackId) {
    return draft.drumTrackModes[trackId] === 'percussion';
  }).map(function(id) { return parseInt(id, 10); });

  return {
    mode: draft.mode,
    strategy: draft.strategy,
    includeChords: draft.includeChords,
    trackIds: draft.selectedTrackIds,
    drumTrackIds: drumTrackIds,
    includeDrums: drumTrackIds.length > 0,
    quantSlotsPerBeat: draft.quantSlotsPerBeat,
    quantStrength: draft.quantStrength,
    rhythmDetail: draft.rhythmDetail,
    noteLength: draft.noteLength,
    tempoBpm: draft.tempoBpm,
    timeSignature: draft.timeSignature || undefined,
    estimatedKey: draft.estimatedKey || undefined,
    cleanupOptions: draft.cleanupSkipped ? null : (draft.cleanupOptions || null),
    maxVoices: countSelectedVoices(draft) || 0,
  };
}

export function defaultCleanupOptions() {
  return Object.assign({}, LIGHT_CLEANUP_OPTIONS);
}
