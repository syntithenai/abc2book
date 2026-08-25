/**
 * Client-side SMF parser for MIDI import preview / local analyze.
 * Returns { tracks, tempoBpm, format } where tracks are SMF-track (+ channel for type-0) voices.
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

function voiceIdFor(smfTrackIndex, channel) {
  return 't' + smfTrackIndex + '-c' + channel;
}

/** Build a sorted tempo map; always includes a tick-0 entry. */
export function buildTempoMapFromChanges(tempoChanges, defaultTempoUs) {
  const fallback = defaultTempoUs || 500000;
  const sorted = (tempoChanges || []).slice().sort(function(a, b) {
    return (a.tick || 0) - (b.tick || 0);
  });
  const map = [];
  if (!sorted.length || (sorted[0].tick || 0) > 0) {
    map.push({ tick: 0, tempoUs: fallback, bpm: 60000000 / fallback });
  }
  sorted.forEach(function(change) {
    const tempoUs = change.tempoUs || fallback;
    map.push({
      tick: change.tick || 0,
      tempoUs: tempoUs,
      bpm: change.bpm || (60000000 / tempoUs),
      sourceTrackIndex: change.sourceTrackIndex,
    });
  });
  return map;
}

/** Convert absolute MIDI ticks to seconds using a tempo map. */
export function tickToSeconds(tick, tempoMap, ticksPerBeat) {
  const tpb = ticksPerBeat || 480;
  const map = tempoMap && tempoMap.length
    ? tempoMap
    : [{ tick: 0, tempoUs: 500000 }];
  let seconds = 0;
  let prevTick = 0;
  let tempoUs = map[0].tempoUs || 500000;
  const target = Math.max(0, Number(tick) || 0);
  for (let i = 0; i < map.length; i += 1) {
    const entry = map[i];
    const boundary = entry.tick || 0;
    if (target < boundary) break;
    if (i > 0) {
      seconds += ((boundary - prevTick) * tempoUs) / (tpb * 1000000);
    }
    tempoUs = entry.tempoUs || tempoUs;
    prevTick = boundary;
  }
  seconds += ((target - prevTick) * tempoUs) / (tpb * 1000000);
  return seconds;
}

/**
 * Parse one MTrk into per-channel note bags (supports running status).
 * Notes store startTick/endTick; seconds are filled later from the global tempo map.
 */
function parseTrackEventsByChannel(data, trackOffset, trackLength, ticksPerBeat, tempoUs) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = trackOffset + trackLength;
  let absTicks = 0;
  let timeSec = 0;
  let currentTempo = tempoUs;
  let runningStatus = 0;
  let trackName = '';
  const channelState = {};
  const localTempoChanges = [];

  function ensureChannel(channel) {
    if (!channelState[channel]) {
      channelState[channel] = {
        notes: [],
        active: {},
        program: 0,
        isDrum: channel === 9,
      };
    }
    return channelState[channel];
  }

  const state = { offset: trackOffset };
  while (state.offset < end) {
    const delta = readVarLen(view, state);
    absTicks += delta;
    timeSec += (delta * currentTempo) / (ticksPerBeat * 1000000);
    if (state.offset >= end) break;

    let status = view.getUint8(state.offset);
    if (status < 0x80) {
      if (!runningStatus) {
        state.offset += 1;
        continue;
      }
      status = runningStatus;
    } else {
      state.offset += 1;
      if ((status & 0xf0) !== 0xf0) {
        runningStatus = status;
      } else {
        runningStatus = 0;
      }
    }

    if ((status & 0xf0) === 0xf0) {
      if (status === 0xff) {
        if (state.offset >= end) break;
        const metaType = view.getUint8(state.offset);
        state.offset += 1;
        const len = readVarLen(view, state);
        if (metaType === 0x03 && len > 0) {
          const bytes = new Uint8Array(data.buffer, data.byteOffset + state.offset, len);
          trackName = new TextDecoder().decode(bytes);
        } else if (metaType === 0x51 && len === 3) {
          currentTempo = (view.getUint8(state.offset) << 16)
            | (view.getUint8(state.offset + 1) << 8)
            | view.getUint8(state.offset + 2);
          localTempoChanges.push({
            tick: absTicks,
            tempoUs: currentTempo,
            bpm: 60000000 / currentTempo,
          });
        }
        state.offset += len;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(view, state);
        state.offset += len;
      }
      continue;
    }

    const channel = status & 0x0f;
    const eventType = status & 0xf0;
    const ch = ensureChannel(channel);

    if (eventType === 0xc0 || eventType === 0xd0) {
      if (state.offset >= end) break;
      const data1 = view.getUint8(state.offset);
      state.offset += 1;
      if (eventType === 0xc0) {
        ch.program = data1;
      }
      continue;
    }

    if (state.offset + 1 >= end) break;
    const data1 = view.getUint8(state.offset);
    state.offset += 1;
    const data2 = view.getUint8(state.offset);
    state.offset += 1;

    const activeKey = data1;

    if (eventType === 0x90 && data2 > 0) {
      ch.active[activeKey] = {
        startTick: absTicks,
        start: timeSec,
        velocity: data2,
      };
    } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
      const started = ch.active[activeKey];
      if (started) {
        delete ch.active[activeKey];
        const endTick = absTicks;
        const endSec = timeSec > started.start ? timeSec : started.start + 0.05;
        ch.notes.push({
          start: started.start,
          end: endSec,
          startTick: started.startTick,
          endTick: endTick > started.startTick ? endTick : started.startTick + 1,
          midi: data1,
          velocity: started.velocity,
          confidence: started.velocity / 127,
          channel: channel,
        });
      }
    }
  }

  return {
    channelState: channelState,
    trackName: trackName,
    tempoUs: currentTempo,
    localTempoChanges: localTempoChanges,
  };
}

function flattenTrackChannels(smfTrackIndex, trackName, channelState, splitByChannel) {
  const channels = Object.keys(channelState).map(function(key) { return parseInt(key, 10); }).sort(function(a, b) {
    return a - b;
  });
  const nonEmpty = channels.filter(function(ch) {
    return (channelState[ch].notes || []).length > 0;
  });

  if (!splitByChannel || nonEmpty.length <= 1) {
    const notes = [];
    let program = 0;
    let isDrum = false;
    let primaryChannel = nonEmpty.length ? nonEmpty[0] : 0;
    nonEmpty.forEach(function(ch) {
      const bag = channelState[ch];
      if (bag.isDrum) isDrum = true;
      if (bag.notes.length && !program) program = bag.program || 0;
      notes.push.apply(notes, bag.notes);
    });
    notes.sort(function(a, b) { return a.start - b.start; });
    return [{
      index: smfTrackIndex,
      smfTrackIndex: smfTrackIndex,
      channel: primaryChannel,
      voiceId: voiceIdFor(smfTrackIndex, primaryChannel),
      name: trackName || ('Track ' + (smfTrackIndex + 1)),
      isDrum: isDrum,
      program: program || 0,
      notes: notes,
    }];
  }

  return nonEmpty.map(function(ch, offset) {
    const bag = channelState[ch];
    const notes = bag.notes.slice().sort(function(a, b) { return a.start - b.start; });
    return {
      index: smfTrackIndex * 1000 + ch,
      smfTrackIndex: smfTrackIndex,
      channel: ch,
      voiceId: voiceIdFor(smfTrackIndex, ch),
      name: (trackName || ('Track ' + (smfTrackIndex + 1))) + ' ch' + (ch + 1),
      isDrum: !!bag.isDrum || ch === 9,
      program: bag.program || 0,
      notes: notes,
      channelSplitOffset: offset,
    };
  });
}

export function parseMidiBytesToTracks(midiBytes) {
  const data = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes);
  if (data.length < 14) return { tracks: [], tempoBpm: 120, format: 1, ticksPerBeat: 480 };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'MThd') return { tracks: [], tempoBpm: 120, format: 1, ticksPerBeat: 480 };

  const headerLength = readUint32BE(view, 4);
  const format = readUint16BE(view, 8);
  const numTracks = readUint16BE(view, 10);
  const ticksPerBeat = readUint16BE(view, 12);
  let offset = 8 + headerLength;
  let tempoUs = 500000;
  const tracks = [];
  const splitByChannel = format === 0 || numTracks === 1;

  // Global tempo map (tempos often live on conductor track 0).
  const meta = parseMidiFileMeta(midiBytes);
  const tempoMap = buildTempoMapFromChanges(meta.tempoChanges, tempoUs);

  for (let i = 0; i < numTracks; i += 1) {
    if (offset + 8 > data.length) break;
    const trackMagic = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (trackMagic !== 'MTrk') break;
    const trackLength = readUint32BE(view, offset + 4);
    const parsed = parseTrackEventsByChannel(data, offset + 8, trackLength, ticksPerBeat, tempoUs);
    if (parsed.tempoUs) tempoUs = parsed.tempoUs;
    const flattened = flattenTrackChannels(i, parsed.trackName, parsed.channelState, splitByChannel);
    flattened.forEach(function(track) {
      (track.notes || []).forEach(function(note) {
        if (note.startTick == null) return;
        note.start = tickToSeconds(note.startTick, tempoMap, ticksPerBeat);
        note.end = tickToSeconds(
          note.endTick != null ? note.endTick : note.startTick + 1,
          tempoMap,
          ticksPerBeat
        );
        if (note.end <= note.start) {
          note.end = note.start + (60 / 120) / 4;
        }
      });
      tracks.push(track);
    });
    offset += 8 + trackLength;
  }

  // Re-index densely while preserving voiceId / smfTrackIndex / channel.
  tracks.forEach(function(track, index) {
    track.index = index;
  });

  const primaryTempoUs = (tempoMap[0] && tempoMap[0].tempoUs) || tempoUs || 500000;
  return {
    tracks: tracks,
    tempoBpm: 60000000 / primaryTempoUs,
    format: format,
    ticksPerBeat: ticksPerBeat,
    tempoUs: primaryTempoUs,
    tempoMap: tempoMap,
  };
}

const KEY_SIG_NAMES_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const KEY_SIG_NAMES_MINOR = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];

function midiKeySignatureToAbc(sf, mi) {
  const idx = (-sf) + 7;
  if (idx < 0 || idx >= KEY_SIG_NAMES_MAJOR.length) return mi ? 'Am' : 'C';
  return mi ? KEY_SIG_NAMES_MINOR[idx] : KEY_SIG_NAMES_MAJOR[idx];
}

/**
 * Scan all MTrk chunks for tempo / time-signature / key-signature meta events.
 */
export function parseMidiFileMeta(midiBytes) {
  const data = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes);
  if (data.length < 14) {
    return { ticksPerBeat: 480, tempoChanges: [], meterChanges: [], keyChanges: [] };
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'MThd') {
    return { ticksPerBeat: 480, tempoChanges: [], meterChanges: [], keyChanges: [] };
  }
  const headerLength = readUint32BE(view, 4);
  const numTracks = readUint16BE(view, 10);
  const ticksPerBeat = readUint16BE(view, 12);
  let offset = 8 + headerLength;
  const tempoChanges = [];
  const meterChanges = [];
  const keyChanges = [];

  for (let trackIndex = 0; trackIndex < numTracks; trackIndex += 1) {
    if (offset + 8 > data.length) break;
    const trackMagic = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (trackMagic !== 'MTrk') break;
    const trackLength = readUint32BE(view, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLength;
    let absTicks = 0;
    const state = { offset: trackStart };
    while (state.offset < trackEnd) {
      const delta = readVarLen(view, state);
      absTicks += delta;
      if (state.offset >= trackEnd) break;
      let status = view.getUint8(state.offset);
      if (status < 0x80) {
        state.offset += 1;
        continue;
      }
      state.offset += 1;
      if (status !== 0xff) continue;
      if (state.offset >= trackEnd) break;
      const metaType = view.getUint8(state.offset);
      state.offset += 1;
      const len = readVarLen(view, state);
      if (metaType === 0x51 && len === 3) {
        const tempoUs = (view.getUint8(state.offset) << 16)
          | (view.getUint8(state.offset + 1) << 8)
          | view.getUint8(state.offset + 2);
        const bpm = 60000000 / (tempoUs || 500000);
        tempoChanges.push({ tick: absTicks, tempoUs: tempoUs, bpm: bpm, sourceTrackIndex: trackIndex });
      } else if (metaType === 0x58 && len >= 4) {
        const numerator = view.getUint8(state.offset);
        const denominator = 1 << view.getUint8(state.offset + 1);
        meterChanges.push({
          tick: absTicks,
          numerator: numerator,
          denominator: denominator,
          meter: numerator + '/' + denominator,
          sourceTrackIndex: trackIndex,
        });
      } else if (metaType === 0x59 && len >= 2) {
        const sf = view.getInt8(state.offset);
        const mi = view.getUint8(state.offset + 1);
        keyChanges.push({
          tick: absTicks,
          sf: sf,
          mi: mi,
          key: midiKeySignatureToAbc(sf, mi),
          sourceTrackIndex: trackIndex,
        });
      }
      state.offset += len;
    }
    offset += 8 + trackLength;
  }

  return {
    ticksPerBeat: ticksPerBeat || 480,
    tempoChanges: tempoChanges,
    meterChanges: meterChanges,
    keyChanges: keyChanges,
  };
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

  if (profileTrack.voice_id) {
    const byVoiceId = parsedTracks.find(function(t) {
      return !usedParsed.has(t.index) && t.notes && t.notes.length
        && t.voiceId === profileTrack.voice_id;
    });
    if (byVoiceId) return byVoiceId;
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
      voiceId: (profileTrack && profileTrack.voice_id) || parsedTrack.voiceId || null,
      name: (profileTrack && profileTrack.name) || parsedTrack.name || '',
      isDrum: !!(profileTrack && profileTrack.is_drum) || !!parsedTrack.isDrum,
      roleHint: (profileTrack && profileTrack.role_hint) || 'unknown',
      program: profileTrack ? profileTrack.program : (parsedTrack.program || 0),
      channel: parsedTrack.channel != null ? parsedTrack.channel : (profileTrack && profileTrack.channel),
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

/** Union notes from several source tracks; merge overlapping same-pitch notes. */
export function mergeNoteLists(noteLists) {
  const combined = [];
  (noteLists || []).forEach(function(list) {
    (list || []).forEach(function(note) {
      combined.push({
        start: note.start,
        end: note.end,
        startTick: note.startTick,
        endTick: note.endTick,
        midi: note.midi,
        velocity: note.velocity != null ? note.velocity : 80,
        confidence: note.confidence,
        channel: note.channel,
      });
    });
  });
  combined.sort(function(a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return a.midi - b.midi;
  });
  const merged = [];
  combined.forEach(function(note) {
    const prev = merged.length ? merged[merged.length - 1] : null;
    if (
      prev
      && prev.midi === note.midi
      && note.start <= prev.end + 0.01
    ) {
      prev.end = Math.max(prev.end, note.end);
      prev.velocity = Math.max(prev.velocity || 0, note.velocity || 0);
      if (note.endTick != null) {
        prev.endTick = Math.max(prev.endTick != null ? prev.endTick : 0, note.endTick);
      }
      return;
    }
    merged.push(note);
  });
  return merged;
}
