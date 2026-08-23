import { parseMidiBytesToTracks, parseMidiFileMeta } from './midiParseClient';

function sortByTick(changes) {
  return (changes || []).slice().sort(function(a, b) {
    return (a.tick || 0) - (b.tick || 0);
  });
}

function buildTempoMap(tempoChanges, defaultTempoUs, ticksPerBeat) {
  const sorted = sortByTick(tempoChanges);
  if (!sorted.length) {
    return [{ tick: 0, tempoUs: defaultTempoUs, bpm: 60000000 / defaultTempoUs }];
  }
  return sorted.map(function(change) {
    return {
      tick: change.tick || 0,
      tempoUs: change.tempoUs,
      bpm: change.bpm,
      sourceTrackIndex: change.sourceTrackIndex,
    };
  });
}

export function tickToSeconds(tick, tempoMap, ticksPerBeat) {
  const tpb = ticksPerBeat || 480;
  let seconds = 0;
  let prevTick = 0;
  let tempoUs = tempoMap[0] ? tempoMap[0].tempoUs : 500000;
  for (let i = 0; i < tempoMap.length; i += 1) {
    const entry = tempoMap[i];
    const boundary = entry.tick || 0;
    if (tick < boundary) break;
    if (i > 0) {
      seconds += ((boundary - prevTick) * tempoUs) / (tpb * 1000000);
    }
    tempoUs = entry.tempoUs;
    prevTick = boundary;
  }
  seconds += ((tick - prevTick) * tempoUs) / (tpb * 1000000);
  return seconds;
}

export function tickToBar(tick, tempoMap, ticksPerBeat, meterChanges, defaultMeter) {
  const seconds = tickToSeconds(tick, tempoMap, ticksPerBeat);
  const meter = resolveMeterAtTick(tick, meterChanges, defaultMeter);
  const beatsPerBar = meter.numerator || 4;
  const tempoBpm = tempoAtTick(tick, tempoMap);
  const beatDuration = 60 / Math.max(tempoBpm, 1);
  const barDuration = beatDuration * beatsPerBar;
  return Math.max(0, Math.floor(seconds / barDuration));
}

function tempoAtTick(tick, tempoMap) {
  let bpm = 120;
  sortByTick(tempoMap).forEach(function(entry) {
    if ((entry.tick || 0) <= tick) bpm = entry.bpm || bpm;
  });
  return bpm;
}

function resolveMeterAtTick(tick, meterChanges, defaultMeter) {
  const meter = defaultMeter || '4/4';
  const parts = String(meter).split('/');
  let numerator = parseInt(parts[0], 10) || 4;
  let denominator = parseInt(parts[1], 10) || 4;
  sortByTick(meterChanges).forEach(function(change) {
    if ((change.tick || 0) <= tick) {
      numerator = change.numerator || numerator;
      denominator = change.denominator || denominator;
    }
  });
  return { numerator: numerator, denominator: denominator, meter: numerator + '/' + denominator };
}

export function buildFileMetaFromBytes(midiBytes) {
  const parsed = parseMidiBytesToTracks(midiBytes);
  const raw = parseMidiFileMeta(midiBytes);
  const defaultTempoUs = parsed.tempoUs || 500000;
  const tempoMap = buildTempoMap(raw.tempoChanges, defaultTempoUs, raw.ticksPerBeat);
  const defaultMeter = raw.meterChanges.length
    ? raw.meterChanges[0].meter
    : '4/4';

  function enrich(changes, kind) {
    return sortByTick(changes).map(function(change) {
      const bar = tickToBar(change.tick, tempoMap, raw.ticksPerBeat, raw.meterChanges, defaultMeter);
      return Object.assign({}, change, {
        bar: bar,
        seconds: tickToSeconds(change.tick, tempoMap, raw.ticksPerBeat),
      });
    });
  }

  const tempoChanges = enrich(raw.tempoChanges, 'tempo');
  const meterChanges = enrich(raw.meterChanges, 'meter');
  const keyChanges = enrich(raw.keyChanges, 'key');

  const sourceTracks = {
    tempo: uniqueSourceTracks(tempoChanges),
    meter: uniqueSourceTracks(meterChanges),
    key: uniqueSourceTracks(keyChanges),
  };

  return {
    ticksPerBeat: raw.ticksPerBeat,
    tempoBpm: parsed.tempoBpm || 120,
    defaultMeter: defaultMeter,
    tempoChanges: tempoChanges,
    meterChanges: meterChanges,
    keyChanges: keyChanges,
    sourceTracks: sourceTracks,
    tempoMap: tempoMap,
  };
}

function uniqueSourceTracks(changes) {
  const ids = [];
  (changes || []).forEach(function(change) {
    const id = change.sourceTrackIndex;
    if (id != null && ids.indexOf(id) < 0) ids.push(id);
  });
  return ids;
}

export function formatMetaLine(changes, valueKey) {
  if (!changes || !changes.length) return '';
  return changes.map(function(change) {
    const val = change[valueKey];
    const bar = change.bar != null ? change.bar : 0;
    return String(val) + ' (bar ' + bar + ')';
  }).join(', ');
}

export function metaSourceLabel(sourceTrackIds, profileTracks) {
  if (!sourceTrackIds || !sourceTrackIds.length) return '';
  const tracks = profileTracks || [];
  return sourceTrackIds.map(function(id) {
    const track = tracks.find(function(t) { return t.smf_track_index === id || t.index === id; });
    return track ? (track.name || 'Track ' + (id + 1)) : 'Track ' + (id + 1);
  }).join(', ');
}
