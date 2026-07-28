function parseMeter(meterText) {
  const trimmed = String(meterText || '4/4').trim();
  if (trimmed === 'C' || trimmed === 'C|') return { num: 4, den: 4 };
  const parts = trimmed.split('/');
  if (parts.length === 2 && parts[1] !== '0') {
    return { num: parseFloat(parts[0]) || 4, den: parseFloat(parts[1]) || 4 };
  }
  return { num: 4, den: 4 };
}

export function meterToDefaultNoteLength(meterText) {
  const meter = parseMeter(meterText);
  const meterValue = meter.num / meter.den;
  return meterValue < 0.75 ? 0.0625 : 0.125;
}

export function beatsPerBarFromMeter(meterText) {
  const m = parseMeter(meterText);
  return m.num * (4 / m.den);
}

export function parseNoteLengthDecimal(noteLengthText, meterText) {
  if (noteLengthText) {
    const parts = String(noteLengthText).trim().split('/');
    if (parts.length === 2 && parts[0] !== '' && parts[1] !== '') {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
  }
  return meterToDefaultNoteLength(meterText);
}

export function durationToBeats(duration, unitLengthDecimal) {
  if (!duration || !unitLengthDecimal) return 0;
  let beats = (duration.num / duration.den) * (unitLengthDecimal * 4);
  if (duration.dotted) beats *= 1.5;
  return beats;
}

export function beatsToDuration(beats, unitLengthDecimal) {
  const unitBeats = unitLengthDecimal * 4;
  const units = beats / unitBeats;
  const rounded = Math.max(1 / 64, units);
  return { num: Math.round(rounded * 1000), den: 1000, dotted: false };
}

export function buildSyntheticBeatTimes(beatsPerBar, numBars, tempoBpm) {
  const bpm = tempoBpm > 0 ? tempoBpm : 120;
  const secondsPerBeat = 60 / bpm;
  const totalBeats = beatsPerBar * numBars;
  const times = [];
  for (let i = 0; i < totalBeats; i += 1) {
    times.push(i * secondsPerBeat);
  }
  return times;
}

export function tupletBeatScale(tuplet) {
  if (!tuplet || !tuplet.num) return 1;
  const den = tuplet.den != null ? tuplet.den : 2;
  return den / tuplet.num;
}

export function assignTimingToEvents(events, meterText, unitLengthDecimal) {
  let currentMeter = meterText;
  let beatsPerBar = beatsPerBarFromMeter(currentMeter);
  let cursor = 0;
  return events.map(function(event, index) {
    if (event.type === 'meterChange' && event.meter) {
      currentMeter = event.meter;
      beatsPerBar = beatsPerBarFromMeter(currentMeter);
    }
    let durationBeats = durationToBeats(event.duration, unitLengthDecimal);
    if (event.tuplet) durationBeats *= tupletBeatScale(event.tuplet);
    const measureIndex = Math.floor(cursor / beatsPerBar);
    const next = Object.assign({}, event, {
      id: event.id || 'e-' + index,
      startBeat: cursor,
      durationBeats: durationBeats,
      measureIndex: measureIndex,
    });
    if (event.type !== 'barline'
      && event.type !== 'lineBreak'
      && event.type !== 'keyChange'
      && event.type !== 'meterChange') {
      cursor += durationBeats;
    }
    return next;
  });
}

export function measureCapacityBeats(meterText) {
  return beatsPerBarFromMeter(meterText);
}

export function validateMeasureFits(events, meterText, unitLengthDecimal) {
  return findMeasureDurationIssues(events, meterText, unitLengthDecimal).length === 0;
}

/**
 * Returns measures whose total duration does not match one full bar (within tolerance).
 * @returns {Array<{ measureIndex: number, beats: number, capacity: number, type: 'underfull'|'overfull' }>}
 */
export function findMeasureDurationIssues(events, meterText, unitLengthDecimal) {
  const cap = measureCapacityBeats(meterText);
  const byMeasure = {};
  events.forEach(function(ev) {
    if (ev.type === 'barline') return;
    const m = ev.measureIndex || 0;
    byMeasure[m] = (byMeasure[m] || 0) + durationToBeats(ev.duration, unitLengthDecimal);
  });
  const issues = [];
  Object.keys(byMeasure).forEach(function(key) {
    const beats = byMeasure[key];
    const diff = beats - cap;
    if (Math.abs(diff) <= 0.001) return;
    issues.push({
      measureIndex: parseInt(key, 10),
      beats: beats,
      capacity: cap,
      type: diff < 0 ? 'underfull' : 'overfull',
    });
  });
  return issues;
}
