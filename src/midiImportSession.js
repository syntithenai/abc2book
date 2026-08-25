import {
  defaultStaffForTrack,
  slotsPerBeatFromRhythmDetail,
  noteLengthFromRhythmDetail,
  noteLengthFromSlotsPerBeat,
  rhythmDetailFromSlotsPerBeat,
} from './midiImportWizardState';
import { buildFileMetaFromBytes, formatMetaLine, metaSourceLabel } from './midiImportMetaTimeline';
import { detectVoiceMetrics } from './midiImportVoiceDetect';
import {
  mergeNoteLists,
  parseMidiBytesToTracks,
  resolveCleanupPreviewVoices,
} from './midiParseClient';

const VOICE_COLORS = [
  '#4e9af5', '#f5a623', '#50c878', '#e85d75', '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
];

export function defaultVoiceFilters() {
  return {
    pitchEnabled: false,
    velocityEnabled: false,
    positionEnabled: false,
    lengthEnabled: false,
    pitchMin: 0,
    pitchMax: 127,
    velocityMin: 0,
    velocityMax: 127,
    startBar: 0,
    startPulse: 0,
    endBar: 9999,
    endPulse: 9999,
    lengthMinSlots: 0,
    lengthMaxSlots: 9999,
    positionRepeat: { enabled: false, unit: 'measure', lowPulse: 0, highPulse: 9999 },
    filterInvert: false,
    showOnlyPassing: true,
    soloFiltered: false,
    legatoTrim: false,
    retriggerMergeMs: 0,
    allowChords: true,
    quantize: true,
    quantStrength: 1,
    rhythmDetail: 'standard',
    keySnap: false,
  };
}

function nextVoiceId(voices) {
  let n = (voices || []).length + 1;
  while ((voices || []).some(function(v) { return v.id === 'v' + n; })) n += 1;
  return 'v' + n;
}

function profileTrackForId(profile, trackId) {
  return ((profile && profile.tracks) || []).find(function(t) { return t.index === trackId; });
}

export function rawNotesForVoice(session, voice) {
  if (!session || !voice || !session.midiBytes) return [];
  const parsed = parseMidiBytesToTracks(session.midiBytes);
  const drumModes = {};
  if (voice.isDrum && voice.sourceTrackIds.length) {
    drumModes[voice.sourceTrackIds[0]] = 'percussion';
  }
  const baseVoices = resolveCleanupPreviewVoices(
    parsed,
    session.profile,
    voice.sourceTrackIds,
    drumModes
  );
  const lists = voice.sourceTrackIds.map(function(trackId) {
    const found = baseVoices.find(function(v) { return v.trackId === trackId; });
    return (found && found.notes) || [];
  });
  return mergeNoteLists(lists);
}

export function createVoiceFromTrack(profile, track, fileMeta, enabled, voiceIndex) {
  const tempoBpm = fileMeta.tempoBpm || (profile && profile.tempo_bpm) || 120;
  const meter = fileMeta.defaultMeter || (profile && profile.time_signature) || '4/4';
  const idx = track.index;
  return {
    id: 'v' + ((voiceIndex != null ? voiceIndex : idx) + 1),
    enabled: enabled !== false,
    sourceTrackIds: [idx],
    displayName: track.name || ('Track ' + (idx + 1)),
    program: track.program || 0,
    isDrum: !!track.is_drum,
    staff: defaultStaffForTrack({ is_drum: track.is_drum, role_hint: track.role_hint }),
    system: 'own',
    grid: {
      tempoBpm: tempoBpm,
      timeSignature: meter,
      estimatedKey: (profile && profile.estimated_key) || 'C',
      tempoSource: 'detected',
      meterSource: 'midi',
      keySource: 'detected',
    },
    detected: {
      tempoBpm: tempoBpm,
      timeSignature: meter,
      estimatedKey: (profile && profile.estimated_key) || 'C',
      anacrusis: { hasAnacrusis: false, label: 'No anacrusis' },
    },
    filters: defaultVoiceFilters(),
    color: VOICE_COLORS[idx % VOICE_COLORS.length],
  };
}

export async function createMidiImportSession(options) {
  const opts = options || {};
  const midiBytes = opts.midiBytes;
  const profile = opts.profile;
  if (!midiBytes || !profile) {
    throw new Error('MIDI bytes and profile required');
  }
  const fileMeta = buildFileMetaFromBytes(midiBytes);
  const parsed = parseMidiBytesToTracks(midiBytes);
  const recommended = profile.recommended_track_ids || [];
  const tracksWithNotes = (profile.tracks || []).filter(function(t) {
    return (t.note_count || 0) > 0;
  });
  const voices = [];
  tracksWithNotes.forEach(function(track, i) {
    const parsedTrack = parsed.tracks.find(function(t) { return t.index === track.index; });
    const notes = (parsedTrack && parsedTrack.notes) || [];
    const enabled = recommended.indexOf(track.index) >= 0;
    const voice = createVoiceFromTrack(profile, track, fileMeta, enabled, i);
    voice.color = VOICE_COLORS[i % VOICE_COLORS.length];
    const detected = detectVoiceMetrics(notes, {
      tempoBpm: fileMeta.tempoBpm,
      timeSignature: fileMeta.defaultMeter,
    });
    voice.detected = {
      tempoBpm: detected.tempoBpm,
      timeSignature: fileMeta.defaultMeter,
      estimatedKey: detected.estimatedKey,
      anacrusis: detected.anacrusis,
    };
    voice.grid.tempoBpm = detected.tempoBpm || voice.grid.tempoBpm;
    voice.grid.estimatedKey = detected.estimatedKey || voice.grid.estimatedKey;
    voices.push(voice);
  });

  const firstSelected = (voices.find(function(v) { return v.enabled; }) || voices[0] || null);
  const sharedTempo = fileMeta.tempoBpm || parsed.tempoBpm || 120;
  return {
    fileName: opts.fileName || 'import.mid',
    sourceUrl: opts.sourceUrl || '',
    midiBytes: midiBytes,
    profile: profile,
    fileMeta: Object.assign({}, fileMeta, {
      ticksPerBeat: fileMeta.ticksPerBeat || parsed.ticksPerBeat || 480,
    }),
    voices: voices,
    selectedVoiceId: firstSelected ? firstSelected.id : null,
    sharedGrid: {
      tempoBpm: sharedTempo,
      timeSignature: fileMeta.defaultMeter || '4/4',
      estimatedKey: (profile && profile.estimated_key) || 'C',
    },
    anacrusisBeats: 0,
    previewZoom: { beatWidth: 48, rowHeight: 14 },
    previewSnapEnabled: true,
    previewSnapSlotsPerBeat: 4,
    returnPath: opts.returnPath || '/tunes',
  };
}

export function duplicateVoice(session, voiceId) {
  const voice = session.voices.find(function(v) { return v.id === voiceId; });
  if (!voice) return session;
  const copy = JSON.parse(JSON.stringify(voice));
  copy.id = nextVoiceId(session.voices);
  copy.displayName = voice.displayName + ' (copy)';
  copy.color = VOICE_COLORS[session.voices.length % VOICE_COLORS.length];
  const voices = session.voices.slice();
  voices.push(copy);
  return Object.assign({}, session, { voices: voices, selectedVoiceId: copy.id });
}

export function mergeVoices(session, voiceIdA, voiceIdB) {
  const a = session.voices.find(function(v) { return v.id === voiceIdA; });
  const b = session.voices.find(function(v) { return v.id === voiceIdB; });
  if (!a || !b || voiceIdA === voiceIdB) return session;
  if (a.isDrum !== b.isDrum) return session;
  const sourceTrackIds = a.sourceTrackIds.slice();
  b.sourceTrackIds.forEach(function(id) {
    if (sourceTrackIds.indexOf(id) < 0) sourceTrackIds.push(id);
  });
  const merged = Object.assign({}, a, {
    id: nextVoiceId(session.voices),
    displayName: a.displayName + ' + ' + b.displayName,
    sourceTrackIds: sourceTrackIds,
    enabled: a.enabled || b.enabled,
    system: '1',
    color: a.color,
    filters: JSON.parse(JSON.stringify(a.filters)),
  });
  const notes = mergeNoteLists([
    rawNotesForVoice(session, a),
    rawNotesForVoice(session, b),
  ]);
  const detected = detectVoiceMetrics(notes, {
    tempoBpm: merged.grid.tempoBpm,
    timeSignature: merged.grid.timeSignature,
  });
  merged.detected = {
    tempoBpm: detected.tempoBpm,
    timeSignature: merged.grid.timeSignature,
    estimatedKey: detected.estimatedKey,
    anacrusis: detected.anacrusis,
  };
  const voices = session.voices.filter(function(v) {
    return v.id !== voiceIdA && v.id !== voiceIdB;
  });
  voices.push(merged);
  return Object.assign({}, session, {
    voices: voices,
    selectedVoiceId: merged.id,
  });
}

export function updateVoice(session, voiceId, patch) {
  const voices = session.voices.map(function(voice) {
    if (voice.id !== voiceId) return voice;
    return Object.assign({}, voice, patch, {
      grid: Object.assign({}, voice.grid, patch.grid || {}),
      filters: Object.assign({}, voice.filters, patch.filters || {}),
      detected: Object.assign({}, voice.detected, patch.detected || {}),
    });
  });
  return Object.assign({}, session, { voices: voices });
}

export function voiceMetaLines(session, voice) {
  const fileMeta = session.fileMeta || {};
  const tracks = (session.profile && session.profile.tracks) || [];
  return {
    tempoMidi: formatMetaLine(fileMeta.tempoChanges, 'bpm'),
    meterMidi: formatMetaLine(fileMeta.meterChanges, 'meter'),
    keyMidi: formatMetaLine(fileMeta.keyChanges, 'key'),
    tempoSrc: metaSourceLabel(fileMeta.sourceTracks && fileMeta.sourceTracks.tempo, tracks),
    meterSrc: metaSourceLabel(fileMeta.sourceTracks && fileMeta.sourceTracks.meter, tracks),
    keySrc: metaSourceLabel(fileMeta.sourceTracks && fileMeta.sourceTracks.key, tracks),
  };
}

export function sessionAsDraft(session) {
  const voices = session.voices || [];
  const selectedTrackIds = [];
  voices.forEach(function(voice) {
    if (!voice.isDrum) {
      voice.sourceTrackIds.forEach(function(id) {
        if (selectedTrackIds.indexOf(id) < 0) selectedTrackIds.push(id);
      });
    }
  });
  const first = voices.find(function(v) { return v.enabled; }) || voices[0];
  return {
    fileName: session.fileName,
    sourceUrl: session.sourceUrl,
    midiBytes: session.midiBytes,
    profile: session.profile,
    selectedTrackIds: selectedTrackIds,
    mode: voices.filter(function(v) { return v.enabled && !v.isDrum; }).length > 1 ? 'multi_voice' : 'melody',
    strategy: 'auto',
    tempoBpm: first && first.grid ? first.grid.tempoBpm : 120,
    timeSignature: first && first.grid ? first.grid.timeSignature : '4/4',
    estimatedKey: first && first.grid ? first.grid.estimatedKey : 'C',
    quantStrength: first && first.filters ? first.filters.quantStrength : 0.7,
    rhythmDetail: rhythmDetailFromSlotsPerBeat(session.previewSnapSlotsPerBeat || 4),
    noteLength: noteLengthFromSlotsPerBeat(session.previewSnapSlotsPerBeat || 4),
    quantSlotsPerBeat: session.previewSnapSlotsPerBeat || 4,
    importSession: session,
  };
}

export function buildImportOptionsFromSession(session) {
  const voices = (session.voices || []).filter(function(v) { return v.enabled; });
  const trackIds = [];
  const drumTrackIds = [];
  voices.forEach(function(voice) {
    if (voice.isDrum) {
      voice.sourceTrackIds.forEach(function(id) { drumTrackIds.push(id); });
    } else {
      voice.sourceTrackIds.forEach(function(id) {
        if (trackIds.indexOf(id) < 0) trackIds.push(id);
      });
    }
  });
  const first = voices[0];
  const firstFilters = (first && first.filters) || defaultVoiceFilters();
  const sharedGrid = session.sharedGrid || {};
  const snapSlots = session.previewSnapSlotsPerBeat || slotsPerBeatFromRhythmDetail(firstFilters.rhythmDetail || 'standard');
  const rhythmDetail = rhythmDetailFromSlotsPerBeat(snapSlots);
  return {
    mode: voices.filter(function(v) { return !v.isDrum; }).length > 1 ? 'multi_voice' : 'melody',
    strategy: 'auto',
    includeChords: false,
    trackIds: trackIds,
    drumTrackIds: drumTrackIds,
    includeDrums: drumTrackIds.length > 0,
    quantSlotsPerBeat: snapSlots,
    quantStrength: firstFilters.quantStrength != null ? firstFilters.quantStrength : 1,
    rhythmDetail: rhythmDetail,
    noteLength: noteLengthFromSlotsPerBeat(snapSlots),
    tempoBpm: sharedGrid.tempoBpm || 120,
    timeSignature: sharedGrid.timeSignature || '4/4',
    estimatedKey: sharedGrid.estimatedKey || 'C',
    cleanupOptions: null,
    maxVoices: voices.length,
    importVoices: voices.map(function(v) {
      return {
        sourceIds: v.sourceTrackIds,
        displayName: v.displayName,
        staff: v.staff,
        system: v.system,
        isDrum: v.isDrum,
      };
    }),
    staffByVoice: voices.map(function(v) { return v.staff; }),
    systemByVoice: voices.map(function(v) { return v.system; }),
    splitVoices: {},
    mergeGroups: voices.filter(function(v) { return v.sourceTrackIds.length > 1; }).map(function(v) {
      return { sourceIds: v.sourceTrackIds, name: v.displayName, staff: v.staff };
    }),
    importSession: session,
  };
}

export function updateSharedGrid(session, patch) {
  return Object.assign({}, session, {
    sharedGrid: Object.assign({}, session.sharedGrid || {}, patch),
  });
}

export function selectVoice(session, voiceId) {
  if (!session || !voiceId) return session;
  const exists = (session.voices || []).some(function(v) { return v.id === voiceId; });
  if (!exists) return session;
  return Object.assign({}, session, { selectedVoiceId: voiceId });
}

export function getSelectedVoice(session) {
  if (!session || !session.voices || !session.voices.length) return null;
  const id = session.selectedVoiceId;
  const found = id && session.voices.find(function(v) { return v.id === id; });
  return found || session.voices.find(function(v) { return v.enabled; }) || session.voices[0];
}

export function audibleSmfTrackIndices(session, voice) {
  if (!voice) {
    const ids = [];
    (session.voices || []).forEach(function(v) {
      if (!v.enabled) return;
      v.sourceTrackIds.forEach(function(trackId) {
        const profileTrack = profileTrackForId(session.profile, trackId);
        const smf = profileTrack && profileTrack.smf_track_index != null
          ? profileTrack.smf_track_index
          : trackId;
        if (ids.indexOf(smf) < 0) ids.push(smf);
      });
    });
    return ids;
  }
  return voice.sourceTrackIds.map(function(trackId) {
    const profileTrack = profileTrackForId(session.profile, trackId);
    return profileTrack && profileTrack.smf_track_index != null
      ? profileTrack.smf_track_index
      : trackId;
  });
}
