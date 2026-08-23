import { DEFAULT_CLEANUP_OPTIONS, LIGHT_CLEANUP_OPTIONS } from './midiCleanupPreview';
import {
  mergeNoteLists,
  parseMidiBytesToTracks,
  resolveCleanupPreviewVoices,
} from './midiParseClient';


export const STAFF_OPTIONS = ['auto', 'treble', 'bass', 'alto', 'tenor', 'perc'];

export const KEY_OPTIONS = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db',
  'Am', 'Em', 'Bm', 'F#m', 'Cm', 'Dm', 'Gm',
];

export const METER_OPTIONS = ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8', '2/2', '5/4', '7/8'];

export function slotsPerBeatFromRhythmDetail(rhythmDetail) {
  if (rhythmDetail === 'simple') return 1;
  if (rhythmDetail === 'detailed') return 4;
  return 2;
}

export function noteLengthFromRhythmDetail(rhythmDetail) {
  if (rhythmDetail === 'simple') return '1/4';
  if (rhythmDetail === 'detailed') return '1/16';
  return '1/8';
}

/** Map snap/grid slots-per-beat (including triplets) to ABC L: value. */
export function noteLengthFromSlotsPerBeat(slotsPerBeat) {
  const slots = Math.max(1, Number(slotsPerBeat) || 4);
  if (slots <= 1) return '1/4';
  if (slots <= 3) return '1/8';
  if (slots <= 6) return '1/16';
  return '1/32';
}

export function rhythmDetailFromSlotsPerBeat(slotsPerBeat) {
  const slots = Math.max(1, Number(slotsPerBeat) || 4);
  if (slots <= 1) return 'simple';
  if (slots >= 4) return 'detailed';
  return 'standard';
}

export function midiNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const n = Math.max(0, Math.min(127, Math.round(Number(midi) || 0)));
  const octave = Math.floor(n / 12) - 1;
  return names[n % 12] + octave;
}

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

/** Prefer recommended / role-based picks; do not auto-select every pitched track. */
export function defaultSelectedTrackIds(profile) {
  const pitched = sortTracksByNoteCount(pitchedTracksWithNotes(profile && profile.tracks));
  if (!pitched.length) return [];

  const recommended = Array.isArray(profile.recommended_track_ids)
    ? profile.recommended_track_ids.filter(function(id) {
      const track = pitched.find(function(t) { return t.index === id; });
      return track && (track.note_count || 0) > 0;
    })
    : [];

  if (recommended.length) {
    return recommended.slice();
  }

  const byRole = function(role) {
    return pitched.filter(function(t) { return t.role_hint === role; });
  };
  const picks = [];
  const melody = byRole('melody')[0] || pitched[0];
  if (melody) picks.push(melody.index);
  const bass = byRole('bass')[0];
  if (bass && picks.indexOf(bass.index) < 0) picks.push(bass.index);
  const harmony = byRole('harmony')[0];
  if (harmony && picks.indexOf(harmony.index) < 0) picks.push(harmony.index);
  return picks.length ? picks : [pitched[0].index];
}

export function defaultStaffForTrack(track) {
  if (!track) return 'auto';
  if (track.is_drum) return 'perc';
  if (track.role_hint === 'bass') return 'bass';
  return 'auto';
}

export function countSelectedVoices(draft) {
  if (draft && draft.profile) {
    return resolveImportVoices(draft).length;
  }
  const pitched = (draft && draft.selectedTrackIds || []).length;
  const percussion = Object.keys((draft && draft.drumTrackModes) || {}).filter(function(trackId) {
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
    mergeGroupId: opts.mergeGroupId || {},
    groups: opts.groups || {},
    trackStaff: opts.trackStaff || {},
    trackSystem: opts.trackSystem || {},
    mutedTrackIds: opts.mutedTrackIds || [],
    soloTrackIds: opts.soloTrackIds || [],
    trackFilter: opts.trackFilter || {
      role: 'all',
      minNotes: 0,
      hideEmpty: true,
    },
    collapseChordsByVoice: opts.collapseChordsByVoice || {},
    splitVoices: opts.splitVoices || {},
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
    detectedTempoBpm: opts.detectedTempoBpm || null,
    detectedKey: opts.detectedKey || '',
    tempoLocked: opts.tempoLocked === true,
    meterLocked: opts.meterLocked === true,
    showAdvancedTracks: opts.showAdvancedTracks === true,
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
  next.detectedTempoBpm = profile.tempo_bpm || null;
  next.detectedKey = profile.estimated_key || 'C';
  if (!next.tempoLocked) next.tempoBpm = profile.tempo_bpm || null;
  if (!next.meterLocked) next.timeSignature = profile.time_signature || '4/4';
  if (!next.estimatedKey) next.estimatedKey = profile.estimated_key || 'C';
  next.splitVoices = {};
  next.mergeGroupId = {};
  next.groups = {};
  next.mutedTrackIds = [];
  next.soloTrackIds = [];
  next.previewResult = null;
  next.cleanupSkipped = false;
  const drumModes = {};
  const trackStaff = {};
  const trackSystem = {};
  (profile.tracks || []).forEach(function(track) {
    if (track.is_drum) {
      drumModes[track.index] = 'skip';
    }
    trackStaff[track.index] = defaultStaffForTrack(track);
    trackSystem[track.index] = 'own';
  });
  next.drumTrackModes = drumModes;
  next.trackStaff = trackStaff;
  next.trackSystem = trackSystem;
  if (!next.cleanupOptions) {
    next.cleanupOptions = defaultCleanupOptions();
  }
  const detail = next.rhythmDetail || 'standard';
  next.quantSlotsPerBeat = slotsPerBeatFromRhythmDetail(detail);
  next.noteLength = noteLengthFromRhythmDetail(detail);
  return next;
}

export function nextMergeGroupId(draft) {
  const existing = Object.keys((draft && draft.groups) || {});
  let n = existing.length + 1;
  while (draft.groups && draft.groups['g' + n]) n += 1;
  return 'g' + n;
}

export function assignTracksToMergeGroup(draft, trackIds, groupId) {
  const next = Object.assign({}, draft);
  const mergeGroupId = Object.assign({}, draft.mergeGroupId || {});
  const groups = Object.assign({}, draft.groups || {});
  let gid = groupId;
  if (!gid || gid === '__new__') {
    gid = nextMergeGroupId(draft);
  }
  if (!groups[gid]) {
    const first = ((draft.profile && draft.profile.tracks) || []).find(function(t) {
      return trackIds.indexOf(t.index) >= 0;
    });
    groups[gid] = {
      name: (first && first.name) || ('Group ' + gid.replace(/^g/, '')),
      staff: defaultStaffForTrack(first),
      system: 'own',
      memberIds: [],
    };
  }
  trackIds.forEach(function(id) {
    mergeGroupId[id] = gid;
  });
  groups[gid].memberIds = Object.keys(mergeGroupId)
    .filter(function(id) { return mergeGroupId[id] === gid; })
    .map(function(id) { return parseInt(id, 10); });
  next.mergeGroupId = mergeGroupId;
  next.groups = groups;
  return next;
}

export function ungroupTracks(draft, trackIds) {
  const next = Object.assign({}, draft);
  const mergeGroupId = Object.assign({}, draft.mergeGroupId || {});
  const groups = Object.assign({}, draft.groups || {});
  const touched = {};
  trackIds.forEach(function(id) {
    const gid = mergeGroupId[id];
    if (gid) touched[gid] = true;
    delete mergeGroupId[id];
  });
  Object.keys(touched).forEach(function(gid) {
    if (!groups[gid]) return;
    groups[gid].memberIds = Object.keys(mergeGroupId)
      .filter(function(id) { return mergeGroupId[id] === gid; })
      .map(function(id) { return parseInt(id, 10); });
    if (!groups[gid].memberIds.length) {
      delete groups[gid];
    }
  });
  next.mergeGroupId = mergeGroupId;
  next.groups = groups;
  return next;
}

/**
 * Resolve selected sources into import voices (one per ungrouped track or merge group).
 */
export function resolveImportVoices(draft) {
  const profile = draft && draft.profile;
  const tracks = (profile && profile.tracks) || [];
  const byIndex = {};
  tracks.forEach(function(t) { byIndex[t.index] = t; });

  const selected = (draft.selectedTrackIds || []).slice();
  const drumIds = Object.keys(draft.drumTrackModes || {}).filter(function(id) {
    return draft.drumTrackModes[id] === 'percussion';
  }).map(function(id) { return parseInt(id, 10); });

  const seenGroups = {};
  const voices = [];

  function staffFor(ids, isDrum, staffKey) {
    if (staffKey && draft.trackStaff && draft.trackStaff[staffKey]) {
      return draft.trackStaff[staffKey];
    }
    const g = draft.mergeGroupId && draft.mergeGroupId[ids[0]];
    if (g && draft.groups && draft.groups[g] && draft.groups[g].staff) {
      const staff = draft.groups[g].staff;
      if (staff === 'auto' && isDrum) return 'perc';
      return staff;
    }
    const staff = (draft.trackStaff && draft.trackStaff[ids[0]]) || (isDrum ? 'perc' : 'auto');
    return staff;
  }

  function systemFor(ids, systemKey) {
    if (systemKey && draft.trackSystem && draft.trackSystem[systemKey]) {
      return draft.trackSystem[systemKey];
    }
    const g = draft.mergeGroupId && draft.mergeGroupId[ids[0]];
    if (g && draft.groups && draft.groups[g] && draft.groups[g].system) {
      return draft.groups[g].system;
    }
    return (draft.trackSystem && draft.trackSystem[ids[0]]) || 'own';
  }

  function pushVoice(sourceIds, isDrum, splitMeta) {
    const members = sourceIds.map(function(id) { return byIndex[id]; }).filter(Boolean);
    if (!members.length) return;
    const g = draft.mergeGroupId && draft.mergeGroupId[sourceIds[0]];
    const group = g && draft.groups ? draft.groups[g] : null;
    const baseName = group && group.name
      ? group.name
      : (members[0].name || ('Track ' + (members[0].index + 1)));
    const half = splitMeta && splitMeta.splitHalf;
    const voiceKey = half ? (sourceIds[0] + ':' + half) : null;
    const name = half === 'high' ? (baseName + ' (high)')
      : (half === 'low' ? (baseName + ' (low)') : baseName);
    const defaultStaff = half === 'high' ? 'treble' : (half === 'low' ? 'bass' : staffFor(sourceIds, isDrum));
    voices.push({
      sourceIds: sourceIds.slice(),
      displayName: name,
      staff: voiceKey ? staffFor(sourceIds, isDrum, voiceKey) || defaultStaff : defaultStaff,
      system: voiceKey ? systemFor(sourceIds, voiceKey) : systemFor(sourceIds),
      isDrum: !!isDrum,
      program: members[0].program || 0,
      roleHint: half === 'low' ? 'bass' : (members[0].role_hint || 'unknown'),
      collapseChords: !!(draft.collapseChordsByVoice
        && draft.collapseChordsByVoice[group ? g : sourceIds[0]]),
      groupId: group ? g : null,
      splitHalf: half || null,
      pitchCutoff: splitMeta && splitMeta.pitchCutoff != null ? splitMeta.pitchCutoff : null,
      voiceKey: voiceKey || String(sourceIds[0]),
      parentTrackId: half ? sourceIds[0] : null,
    });
  }

  function pushPossiblySplit(trackId) {
    const split = draft.splitVoices && draft.splitVoices[trackId];
    if (split && split.pitch != null) {
      pushVoice([trackId], false, { splitHalf: 'high', pitchCutoff: split.pitch });
      pushVoice([trackId], false, { splitHalf: 'low', pitchCutoff: split.pitch });
      return;
    }
    pushVoice([trackId], false);
  }

  selected.forEach(function(trackId) {
    const gid = draft.mergeGroupId && draft.mergeGroupId[trackId];
    if (gid) {
      if (seenGroups[gid]) return;
      seenGroups[gid] = true;
      const members = ((draft.groups[gid] && draft.groups[gid].memberIds) || [trackId])
        .filter(function(id) { return selected.indexOf(id) >= 0; });
      if (members.length) pushVoice(members, false);
      return;
    }
    pushPossiblySplit(trackId);
  });

  drumIds.forEach(function(trackId) {
    const gid = draft.mergeGroupId && draft.mergeGroupId[trackId];
    if (gid) {
      if (seenGroups[gid]) return;
      seenGroups[gid] = true;
      const members = ((draft.groups[gid] && draft.groups[gid].memberIds) || [trackId])
        .filter(function(id) { return drumIds.indexOf(id) >= 0; });
      if (members.length) pushVoice(members, true);
      return;
    }
    pushVoice([trackId], true);
  });

  return voices;
}

export function resolveImportVoiceNotes(draft) {
  if (!draft || !draft.midiBytes) return [];
  const parsed = parseMidiBytesToTracks(draft.midiBytes);
  const baseVoices = resolveCleanupPreviewVoices(
    parsed,
    draft.profile,
    draft.selectedTrackIds,
    draft.drumTrackModes
  );
  const byTrackId = {};
  baseVoices.forEach(function(voice) {
    byTrackId[voice.trackId] = voice;
  });

  return resolveImportVoices(draft).map(function(voice, index) {
    const noteLists = voice.sourceIds.map(function(id) {
      return (byTrackId[id] && byTrackId[id].notes) || [];
    });
    let notes = mergeNoteLists(noteLists);
    if (voice.splitHalf && voice.pitchCutoff != null) {
      const cutoff = Number(voice.pitchCutoff);
      notes = notes.filter(function(note) {
        const midi = Number(note.midi) || 0;
        return voice.splitHalf === 'low' ? midi < cutoff : midi >= cutoff;
      });
    }
    return Object.assign({}, voice, {
      id: index + 1,
      notes: notes,
    });
  });
}

/** Apply a pitch split: original track stays selected but resolves to two voices. */
export function applyPitchSplitToDraft(draft, sourceTrackId, pitchCutoff) {
  const trackId = parseInt(sourceTrackId, 10);
  let next = ungroupTracks(draft, [trackId]);
  const splitVoices = Object.assign({}, next.splitVoices || {});
  splitVoices[trackId] = { pitch: Math.max(1, Math.min(127, Math.round(Number(pitchCutoff) || 60))) };
  const trackStaff = Object.assign({}, next.trackStaff || {});
  trackStaff[trackId + ':high'] = 'treble';
  trackStaff[trackId + ':low'] = 'bass';
  const trackSystem = Object.assign({}, next.trackSystem || {});
  trackSystem[trackId + ':high'] = '1';
  trackSystem[trackId + ':low'] = '1';
  const selected = (next.selectedTrackIds || []).slice();
  if (selected.indexOf(trackId) < 0) selected.push(trackId);
  return Object.assign({}, next, {
    splitVoices: splitVoices,
    trackStaff: trackStaff,
    trackSystem: trackSystem,
    selectedTrackIds: selected,
    mode: 'multi_voice',
    previewResult: null,
  });
}

export function clearPitchSplit(draft, sourceTrackId) {
  const trackId = parseInt(sourceTrackId, 10);
  const splitVoices = Object.assign({}, draft.splitVoices || {});
  delete splitVoices[trackId];
  const trackStaff = Object.assign({}, draft.trackStaff || {});
  delete trackStaff[trackId + ':high'];
  delete trackStaff[trackId + ':low'];
  const trackSystem = Object.assign({}, draft.trackSystem || {});
  delete trackSystem[trackId + ':high'];
  delete trackSystem[trackId + ':low'];
  return Object.assign({}, draft, {
    splitVoices: splitVoices,
    trackStaff: trackStaff,
    trackSystem: trackSystem,
    previewResult: null,
  });
}

/** Median-IOI tempo estimate from note onsets (offline). */
export function estimateTempoFromNotes(notesList) {
  const onsets = [];
  (notesList || []).forEach(function(notes) {
    (notes || []).forEach(function(note) {
      onsets.push(Number(note.start) || 0);
    });
  });
  onsets.sort(function(a, b) { return a - b; });
  const gaps = [];
  for (let i = 1; i < onsets.length; i += 1) {
    const gap = onsets[i] - onsets[i - 1];
    if (gap >= 0.12 && gap <= 1.5) gaps.push(gap);
  }
  if (gaps.length < 4) return null;
  gaps.sort(function(a, b) { return a - b; });
  const median = gaps[Math.floor(gaps.length / 2)];
  // Treat median gap as a beat or half-beat; prefer BPM in musical range.
  let bpm = 60 / median;
  if (bpm < 60) bpm *= 2;
  if (bpm > 200) bpm /= 2;
  if (bpm < 40 || bpm > 240) return null;
  return Math.round(bpm);
}

export function estimateTempoFromDraft(draft) {
  if (!draft || !draft.midiBytes) return null;
  const voices = resolveImportVoiceNotes(draft).filter(function(v) { return !v.isDrum; });
  return estimateTempoFromNotes(voices.map(function(v) { return v.notes; }));
}

export function wizardSummary(draft) {
  const voices = resolveImportVoices(draft);
  const groups = Object.keys(draft.groups || {}).length;
  const drumsIncluded = voices.filter(function(v) { return v.isDrum; }).length;
  const drumsSkipped = Object.keys(draft.drumTrackModes || {}).filter(function(id) {
    return draft.drumTrackModes[id] === 'skip';
  }).length;
  return {
    voiceCount: voices.length,
    groupCount: groups,
    drumsIncluded: drumsIncluded,
    drumsSkipped: drumsSkipped,
    key: draft.estimatedKey || (draft.profile && draft.profile.estimated_key) || 'C',
    meter: draft.timeSignature || (draft.profile && draft.profile.time_signature) || '4/4',
    tempoBpm: draft.tempoBpm || (draft.profile && draft.profile.tempo_bpm) || 120,
  };
}

export function buildScoreDirective(voices) {
  const systems = {};
  const order = [];
  (voices || []).forEach(function(voice, index) {
    const voiceNum = index + 1;
    const system = voice.system && voice.system !== 'own' ? voice.system : null;
    if (!system) {
      order.push(String(voiceNum));
      return;
    }
    if (!systems[system]) {
      systems[system] = [];
      order.push('sys:' + system);
    }
    systems[system].push(String(voiceNum));
  });
  const parts = order.map(function(token) {
    if (token.indexOf('sys:') === 0) {
      const ids = systems[token.slice(4)] || [];
      if (ids.length === 1) return ids[0];
      return '(' + ids.join(' ') + ')';
    }
    return token;
  });
  if (!parts.length) return '';
  // A single braced system like "(1 2)" is still a useful score directive.
  if (parts.length === 1 && parts[0].charAt(0) !== '(') return '';
  return '%%score ' + parts.join(' ');
}

export function buildImportOptionsFromDraft(draft) {
  const voices = resolveImportVoices(draft);
  const trackIds = [];
  const drumTrackIds = [];
  voices.forEach(function(voice) {
    if (voice.isDrum) {
      voice.sourceIds.forEach(function(id) { drumTrackIds.push(id); });
    } else {
      voice.sourceIds.forEach(function(id) {
        if (trackIds.indexOf(id) < 0) trackIds.push(id);
      });
    }
  });

  const rhythmDetail = draft.rhythmDetail || 'standard';
  const slots = draft.quantSlotsPerBeat || slotsPerBeatFromRhythmDetail(rhythmDetail);
  let cleanup = draft.cleanupSkipped ? null : (draft.cleanupOptions ? Object.assign({}, draft.cleanupOptions) : null);
  if (cleanup && cleanup.keepPolyphonicChords === false) {
    cleanup.collapseChords = true;
  }

  return {
    mode: draft.mode,
    strategy: draft.strategy,
    includeChords: draft.includeChords,
    trackIds: trackIds,
    drumTrackIds: drumTrackIds,
    includeDrums: drumTrackIds.length > 0,
    quantSlotsPerBeat: slots,
    quantStrength: draft.quantStrength,
    rhythmDetail: rhythmDetail,
    noteLength: draft.noteLength || noteLengthFromRhythmDetail(rhythmDetail),
    tempoBpm: draft.tempoBpm,
    timeSignature: draft.timeSignature || undefined,
    estimatedKey: draft.estimatedKey || undefined,
    cleanupOptions: cleanup,
    maxVoices: voices.length || 0,
    importVoices: voices,
    staffByVoice: voices.map(function(v) { return v.staff; }),
    systemByVoice: voices.map(function(v) { return v.system; }),
    splitVoices: draft.splitVoices || {},
    mergeGroups: voices.filter(function(v) { return v.sourceIds.length > 1; }).map(function(v) {
      return { sourceIds: v.sourceIds, name: v.displayName, staff: v.staff };
    }),
  };
}

export function defaultCleanupOptions() {
  return Object.assign({}, LIGHT_CLEANUP_OPTIONS || DEFAULT_CLEANUP_OPTIONS);
}

export function filterTracksForDisplay(tracks, filter) {
  const opts = filter || {};
  return (tracks || []).filter(function(track) {
    const noteCount = track.note_count || 0;
    if (opts.hideEmpty !== false && noteCount === 0) return false;
    if (opts.minNotes && noteCount < opts.minNotes) return false;
    if (opts.role && opts.role !== 'all') {
      if (opts.role === 'drum') return !!track.is_drum;
      if (track.is_drum) return false;
      if ((track.role_hint || 'unknown') !== opts.role) return false;
    }
    return true;
  });
}

export function audibleTrackIds(draft) {
  const selected = (draft.selectedTrackIds || []).slice();
  Object.keys(draft.drumTrackModes || {}).forEach(function(id) {
    if (draft.drumTrackModes[id] === 'percussion') {
      const n = parseInt(id, 10);
      if (selected.indexOf(n) < 0) selected.push(n);
    }
  });
  const solos = draft.soloTrackIds || [];
  if (solos.length) {
    return selected.filter(function(id) { return solos.indexOf(id) >= 0; });
  }
  const muted = draft.mutedTrackIds || [];
  return selected.filter(function(id) { return muted.indexOf(id) < 0; });
}

