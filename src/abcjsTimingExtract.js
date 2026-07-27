import { notationBeatToAudioSeconds } from './playbackStateLogic';

/**
 * Build bar boundary timestamps (seconds) from an abcjs visual object.
 */
export function buildBarBoundariesSec(visualObj, barCount, tempoBpm) {
  const count = Math.max(0, parseInt(barCount, 10) || 0);
  const boundaries = [];
  const beatsPerBar = visualObj && typeof visualObj.getBeatsPerMeasure === 'function'
    ? parseFloat(visualObj.getBeatsPerMeasure()) || 4
    : 4;
  for (let bar = 0; bar <= count; bar += 1) {
    const beat = bar * beatsPerBar;
    boundaries.push(notationBeatToAudioSeconds(beat, visualObj, tempoBpm));
  }
  return boundaries;
}

/**
 * Total audio duration in seconds from abcjs visual timing.
 */
export function totalDurationSecFromVisual(visualObj, tempoBpm, barCount) {
  if (visualObj && typeof visualObj.getTotalTime === 'function') {
    const ms = parseFloat(visualObj.getTotalTime());
    if (ms > 0) return ms / 1000;
  }
  if (visualObj && typeof visualObj.millisecondsPerMeasure === 'function') {
    const msPerMeasure = parseFloat(visualObj.millisecondsPerMeasure());
    const bars = Math.max(0, parseInt(barCount, 10) || 0);
    if (msPerMeasure > 0 && bars > 0) {
      return (msPerMeasure * bars) / 1000;
    }
  }
  return 0;
}

/**
 * Tempo BPM from abcjs visual object with fallback.
 */
export function tempoBpmFromVisual(visualObj, tuneTempo) {
  if (visualObj && typeof visualObj.getBpm === 'function') {
    const bpm = parseFloat(visualObj.getBpm());
    if (bpm > 0) return bpm;
  }
  const headerTempo = parseFloat(tuneTempo);
  if (headerTempo > 0) return headerTempo;
  return 120;
}

export function extractAbcjsTiming(visualObj, barCount, tune) {
  const playbackFactor = tune && tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1;
  const headerTempo = tune && tune.tempo ? parseFloat(tune.tempo) : 0;
  const tempoBpm = tempoBpmFromVisual(visualObj, headerTempo) * playbackFactor;
  const totalDurationSec = totalDurationSecFromVisual(visualObj, tempoBpm, barCount);
  const barBoundariesSec = buildBarBoundariesSec(visualObj, barCount, tempoBpm);
  const durationFromBars = barBoundariesSec.length > 0
    ? barBoundariesSec[barBoundariesSec.length - 1]
    : 0;
  const resolvedDuration = totalDurationSec > 0 ? totalDurationSec : durationFromBars;

  if (!(resolvedDuration > 0) || barBoundariesSec.length < 2) {
    return null;
  }

  return {
    tempoBpm: tempoBpm,
    meter: tune && tune.meter ? String(tune.meter) : '4/4',
    totalDurationSec: resolvedDuration,
    barBoundariesSec: barBoundariesSec,
    source: 'abcjs',
  };
}
