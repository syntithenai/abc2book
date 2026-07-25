/**
 * Minimal MIDI parser for client-side piano-roll preview.
 * Returns { tracks: [{ index, name, isDrum, program, notes: [{start,end,midi,velocity}] }] }
 */

function readUint32BE(view, offset) {
  return view.getUint32(offset, false);
}

function readUint16BE(view, offset) {
  return view.getUint16(offset, false);
}

function readVarLen(view, state) {
  let value = 0;
  let byte = 0;
  do {
    byte = view.getUint8(state.offset);
    state.offset += 1;
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return value;
}

function parseTrackEvents(data, trackOffset, trackLength, ticksPerBeat, tempoUs) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = trackOffset + trackLength;
  let offset = trackOffset;
  let absTicks = 0;
  let currentTempo = tempoUs;
  const active = {};
  const notes = [];
  let program = 0;
  let isDrum = false;
  let trackName = '';

  function ticksToSeconds(ticks) {
    return (ticks * currentTempo) / (ticksPerBeat * 1000000);
  }

  const state = { offset: trackOffset };
  while (state.offset < end) {
    const delta = readVarLen(view, state);
    absTicks += delta;
    const status = view.getUint8(state.offset);
    let channel = 0;
    let eventType = status;

    if (status < 0x80) {
      // running status not fully supported; skip byte
      state.offset += 1;
      continue;
    }

    state.offset += 1;
    if ((status & 0xf0) === 0xf0) {
      if (status === 0xff) {
        const metaType = view.getUint8(state.offset);
        state.offset += 1;
        const len = readVarLen(view, state);
        if (metaType === 0x03) {
          const bytes = new Uint8Array(data.buffer, data.byteOffset + state.offset, len);
          trackName = new TextDecoder().decode(bytes);
        } else if (metaType === 0x51 && len === 3) {
          currentTempo = (view.getUint8(state.offset) << 16)
            | (view.getUint8(state.offset + 1) << 8)
            | view.getUint8(state.offset + 2);
        }
        state.offset += len;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(view, state);
        state.offset += len;
      }
      continue;
    }

    channel = status & 0x0f;
    eventType = status & 0xf0;
    if (channel === 9) {
      isDrum = true;
    }

    if (eventType === 0xc0) {
      const prog = view.getUint8(state.offset);
      state.offset += 1;
      program = prog;
      continue;
    }

    const data1 = view.getUint8(state.offset);
    state.offset += 1;
    let data2 = 0;
    if (eventType === 0xd0) {
      continue;
    }
    data2 = view.getUint8(state.offset);
    state.offset += 1;

    const timeSec = ticksToSeconds(absTicks);

    if (eventType === 0x90 && data2 > 0) {
      active[data1] = { start: timeSec, velocity: data2 };
    } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
      const started = active[data1];
      if (started) {
        delete active[data1];
        const end = timeSec;
        notes.push({
          start: started.start,
          end: end > started.start ? end : started.start + 0.05,
          midi: data1,
          velocity: started.velocity,
          confidence: started.velocity / 127,
        });
      }
    }
  }

  return { notes: notes, isDrum: isDrum, trackName: trackName, program: program };
}

export function parseMidiBytesToTracks(midiBytes) {
  const data = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes);
  if (data.length < 14) return { tracks: [], tempoBpm: 120 };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'MThd') return { tracks: [], tempoBpm: 120 };

  const headerLength = readUint32BE(view, 4);
  const format = readUint16BE(view, 8);
  const numTracks = readUint16BE(view, 10);
  const ticksPerBeat = readUint16BE(view, 12);
  let offset = 8 + headerLength;
  let tempoUs = 500000;
  const tracks = [];

  for (let i = 0; i < numTracks; i += 1) {
    if (offset + 8 > data.length) break;
    const trackMagic = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (trackMagic !== 'MTrk') break;
    const trackLength = readUint32BE(view, offset + 4);
    const parsed = parseTrackEvents(data, offset + 8, trackLength, ticksPerBeat, tempoUs);
    tracks.push({
      index: i,
      name: parsed.trackName || ('Track ' + (i + 1)),
      isDrum: parsed.isDrum,
      program: parsed.program || 0,
      notes: parsed.notes,
    });
    offset += 8 + trackLength;
  }

  const tempoBpm = 60000000 / tempoUs;
  return { tracks: tracks, tempoBpm: tempoBpm, format: format };
}

export function notesForTrack(midiBytes, trackIndex) {
  const parsed = parseMidiBytesToTracks(midiBytes);
  const track = parsed.tracks.find(function(t) { return t.index === trackIndex; });
  return track ? track.notes : [];
}

function resolveParsedTrackForProfileTrack(parsedTracks, profileTracks, trackId, usedParsed, pitchedIds) {
  const profileTrack = profileTracks.find(function(t) { return t.index === trackId; });
  const byIndex = parsedTracks.find(function(t) {
    return t.index === trackId && t.notes && t.notes.length;
  });
  if (byIndex && !usedParsed.has(byIndex.index)) {
    return byIndex;
  }
  if (!profileTrack) {
    return null;
  }

  if (profileTrack.name) {
    const byName = parsedTracks.find(function(t) {
      return !usedParsed.has(t.index) && t.notes && t.notes.length
        && t.name === profileTrack.name;
    });
    if (byName) return byName;
  }

  const count = profileTrack.note_count || 0;
  if (count > 0) {
    const byCount = parsedTracks.find(function(t) {
      return !usedParsed.has(t.index) && t.notes && t.notes.length
        && !!t.isDrum === !!profileTrack.is_drum
        && t.notes.length === count;
    });
    if (byCount) return byCount;
  }

  const pitchedParsed = parsedTracks.filter(function(t) {
    return !usedParsed.has(t.index) && t.notes && t.notes.length && !t.isDrum;
  });
  const pitchedProfile = profileTracks.filter(function(t) {
    return !t.is_drum && pitchedIds.indexOf(t.index) >= 0;
  });
  const pos = pitchedProfile.findIndex(function(t) { return t.index === trackId; });
  if (pos >= 0 && pitchedParsed[pos]) {
    return pitchedParsed[pos];
  }
  return null;
}

/**
 * Resolve one parsed track per selected import voice (pitched + percussion).
 */
export function resolveCleanupPreviewVoices(parsed, profile, selectedTrackIds, drumTrackModes) {
  const parsedTracks = (parsed && parsed.tracks) || [];
  const profileTracks = (profile && profile.tracks) || [];
  const pitchedIds = Array.isArray(selectedTrackIds) ? selectedTrackIds.slice() : [];
  const usedParsed = new Set();
  const voices = [];
  let voiceId = 1;

  function claimParsedTrack(parsedTrack, profileTrackId) {
    if (!parsedTrack || !parsedTrack.notes || !parsedTrack.notes.length || usedParsed.has(parsedTrack.index)) {
      return false;
    }
    usedParsed.add(parsedTrack.index);
    const profileTrack = profileTracks.find(function(t) { return t.index === profileTrackId; });
    voices.push({
      id: voiceId,
      trackId: profileTrackId,
      name: (profileTrack && profileTrack.name) || parsedTrack.name || '',
      isDrum: !!(profileTrack && profileTrack.is_drum) || !!parsedTrack.isDrum,
      roleHint: (profileTrack && profileTrack.role_hint) || 'unknown',
      program: profileTrack ? profileTrack.program : (parsedTrack.program || 0),
      notes: parsedTrack.notes.slice(),
    });
    voiceId += 1;
    return true;
  }

  function tryAddVoice(trackId) {
    const parsedTrack = resolveParsedTrackForProfileTrack(
      parsedTracks,
      profileTracks,
      trackId,
      usedParsed,
      pitchedIds
    );
    return claimParsedTrack(parsedTrack, trackId);
  }

  pitchedIds.forEach(function(trackId) { tryAddVoice(trackId); });

  const unmappedIds = pitchedIds.filter(function(trackId) {
    return !voices.some(function(voice) { return voice.trackId === trackId; });
  });
  if (unmappedIds.length) {
    const unusedParsed = parsedTracks
      .filter(function(t) {
        return !usedParsed.has(t.index) && t.notes && t.notes.length && !t.isDrum;
      })
      .sort(function(a, b) { return b.notes.length - a.notes.length; });
    unmappedIds.forEach(function(trackId, index) {
      claimParsedTrack(unusedParsed[index], trackId);
    });
  }

  Object.keys(drumTrackModes || {}).forEach(function(trackIdStr) {
    if (drumTrackModes[trackIdStr] !== 'percussion') return;
    const trackId = parseInt(trackIdStr, 10);
    if (voices.some(function(voice) { return voice.trackId === trackId; })) return;
    tryAddVoice(trackId);
  });

  return voices;
}

/**
 * Map resolver profile track ids onto locally parsed note events. The minimal
 * client parser and server-side music21 analysis can disagree on empty meta
 * tracks at the start of a file, so index-only lookup often returns [].
 */
export function resolveCleanupPreviewNotes(parsed, profile, selectedTrackIds) {
  const voices = resolveCleanupPreviewVoices(parsed, profile, selectedTrackIds, {});
  const notes = [];
  voices.forEach(function(voice) {
    notes.push.apply(notes, voice.notes);
  });

  if (notes.length) {
    return notes;
  }

  const parsedTracks = (parsed && parsed.tracks) || [];
  parsedTracks.forEach(function(t) {
    if (t.notes && t.notes.length) {
      notes.push.apply(notes, t.notes);
    }
  });
  return notes;
}
