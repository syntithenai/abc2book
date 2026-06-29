export function normalizeMeterChanges(meterChanges, fallbackMeter, fallbackBeatsPerBar) {
  const normalized = Array.isArray(meterChanges)
    ? meterChanges.map(function(change) {
      const beatsPerBar = parseInt(change && change.beatsPerBar, 10)
        || parseInt(String(change && change.meter ? change.meter : fallbackMeter || '').split('/')[0], 10)
        || parseInt(fallbackBeatsPerBar, 10)
        || 4;
      return {
        start: Number(change && change.start) || 0,
        meter: change && change.meter ? String(change.meter) : beatsPerBar + '/4',
        beatsPerBar: beatsPerBar,
      };
    }).filter(function(change) { return change.beatsPerBar > 0; })
    : [];

  if (normalized.length === 0) {
    const beatsPerBar = parseInt(fallbackBeatsPerBar, 10)
      || parseInt(String(fallbackMeter || '').split('/')[0], 10)
      || 4;
    return [{
      start: 0,
      meter: fallbackMeter || beatsPerBar + '/4',
      beatsPerBar: beatsPerBar,
    }];
  }

  normalized.sort(function(a, b) { return a.start - b.start; });
  if (normalized[0].start > 0) {
    normalized.unshift(Object.assign({}, normalized[0], { start: 0 }));
  }
  return normalized;
}

export function meterChangeAtTime(meterChanges, time) {
  if (!Array.isArray(meterChanges) || meterChanges.length === 0) return null;
  const probe = Number(time) || 0;
  let current = meterChanges[0];
  for (let i = 0; i < meterChanges.length; i++) {
    if ((Number(meterChanges[i].start) || 0) <= probe) {
      current = meterChanges[i];
    } else {
      break;
    }
  }
  return current;
}

export function buildVariableMeterBars(beatTimes, meterChanges, fallbackBeatsPerBar) {
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return [];
  const changes = normalizeMeterChanges(meterChanges, null, fallbackBeatsPerBar || 4);
  const bars = [];
  let currentBar = null;
  let nextChangeIndex = 1;

  beatTimes.forEach(function(time, beatIndex) {
    const nextChange = changes[nextChangeIndex];
    const changeAtTime = meterChangeAtTime(changes, time);
    const beatsPerBar = changeAtTime ? changeAtTime.beatsPerBar : (fallbackBeatsPerBar || 4);
    const meter = changeAtTime ? changeAtTime.meter : beatsPerBar + '/4';
    const shouldStartForMeterChange = currentBar
      && nextChange
      && time >= nextChange.start
      && currentBar.beats.length > 0;
    const shouldStartForBarFull = currentBar && currentBar.beats.length >= currentBar.beatsPerBar;

    if (!currentBar || shouldStartForMeterChange || shouldStartForBarFull) {
      if (shouldStartForMeterChange) {
        nextChangeIndex++;
      }
      currentBar = {
        index: bars.length,
        start: Number(time) || 0,
        end: Number(time) || 0,
        meter: meter,
        beatsPerBar: beatsPerBar,
        beats: [],
      };
      bars.push(currentBar);
    }

    const nextTime = beatIndex + 1 < beatTimes.length
      ? Number(beatTimes[beatIndex + 1]) || Number(time) || 0
      : Number(time) || 0;
    currentBar.beats.push({
      index: currentBar.beats.length,
      globalIndex: beatIndex,
      start: Number(time) || 0,
      end: nextTime,
    });
    currentBar.end = nextTime;
  });

  return bars;
}

export function prefixMeterChange(barText, bar, previousMeter) {
  if (!bar || !bar.meter || !previousMeter || bar.meter === previousMeter) return barText;
  return '[M:' + bar.meter + '] ' + barText;
}
