export function findBeatIndex(beatTimes, time) {
  const times = beatTimes || [];
  let index = 0;
  for (let i = 0; i < times.length; i += 1) {
    if (Number(times[i]) <= time) index = i;
    else break;
  }
  return index;
}

export function getBeatDuration(beatTimes, beatIndex) {
  const times = beatTimes || [];
  const start = Number(times[beatIndex]) || 0;
  const end = beatIndex + 1 < times.length
    ? Number(times[beatIndex + 1])
    : start + 0.5;
  return Math.max(0.05, end - start);
}

export function secondsToBeat(seconds, beatTimes, tempoFallback) {
  if (!beatTimes || !beatTimes.length) {
    const bpm = tempoFallback > 0 ? tempoFallback : 120;
    return (Number(seconds) || 0) * bpm / 60;
  }
  const time = Math.max(0, Number(seconds) || 0);
  const idx = findBeatIndex(beatTimes, time);
  const beatStart = Number(beatTimes[idx]) || 0;
  const beatDur = getBeatDuration(beatTimes, idx);
  const frac = beatDur > 0 ? (time - beatStart) / beatDur : 0;
  return idx + Math.max(0, Math.min(1, frac));
}

export function beatToSeconds(beat, beatTimes, tempoFallback) {
  if (!beatTimes || !beatTimes.length) {
    const bpm = tempoFallback > 0 ? tempoFallback : 120;
    return (Number(beat) || 0) * 60 / bpm;
  }
  const b = Math.max(0, Number(beat) || 0);
  const idx = Math.floor(b);
  const frac = b - idx;
  const beatStart = Number(beatTimes[idx]) || 0;
  const beatDur = getBeatDuration(beatTimes, idx);
  return beatStart + frac * beatDur;
}

export function buildRecordingGridLines(beatTimes, downbeatTimes, maxBeat) {
  const beatLines = [];
  const downbeatLines = [];
  if (!beatTimes || !beatTimes.length) return { beatLines, downbeatLines };

  const downbeatSet = {};
  (downbeatTimes || []).forEach(function(t) {
    downbeatSet[findBeatIndex(beatTimes, t)] = true;
  });

  const limit = Math.max(maxBeat || 0, beatTimes.length - 1);
  for (let i = 0; i < beatTimes.length && i <= limit; i += 1) {
    const beat = i;
    if (downbeatSet[i]) downbeatLines.push(beat);
    else beatLines.push(beat);
  }
  return { beatLines, downbeatLines };
}
