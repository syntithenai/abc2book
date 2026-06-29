import { buildVariableMeterBars, prefixMeterChange } from './timingGridUtils';

function normalizeChordLabel(label) {
  const raw = String(label || '').trim();
  if (!raw || raw === 'N') return '';

  const parts = raw.split(':');
  const root = parts[0] || '';
  const quality = (parts[1] || '').toLowerCase();

  if (!quality || quality === 'maj') return root;
  if (quality === 'min') return root + 'm';
  if (quality === '7') return root + '7';
  if (quality === 'maj7') return root + 'maj7';
  if (quality === 'min7') return root + 'm7';

  return root + quality.replace(/[^a-z0-9#/+()-]/gi, '');
}

function getChordAtTime(segments, time) {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;
    if (time >= segment.start && time < segment.end) {
      return normalizeChordLabel(segment.label);
    }
  }
  return '';
}

export function formatDiscoveredChords(options) {
  const {
    segments,
    beatTimes,
    beatsPerBar,
    slotsPerBeat,
    barsPerLine = 5,
    meterChanges,
    includeMeterChanges = true,
  } = options || {};

  if (!Array.isArray(segments) || segments.length === 0) return '';
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return '';

  const safeBeatsPerBar = Math.max(1, parseInt(beatsPerBar, 10) || 4);
  const safeSlotsPerBeat = Math.max(1, parseInt(slotsPerBeat, 10) || 1);
  const safeBarsPerLine = Math.max(1, parseInt(barsPerLine, 10) || 5);
  const bars = buildVariableMeterBars(beatTimes, meterChanges, safeBeatsPerBar)
    .map(function(bar) {
      return Object.assign({}, bar, {
        slots: new Array(bar.beatsPerBar * safeSlotsPerBeat).fill('.'),
      });
    });
  let previousChord = '';

  for (let barIndex = 0; barIndex < bars.length; barIndex++) {
    const bar = bars[barIndex];
    for (let beatNumber = 0; beatNumber < bar.beats.length; beatNumber++) {
      const beat = bar.beats[beatNumber];
      const beatIndex = beat.globalIndex;
      const beatInBar = beat.index;
      const slotIndex = beatInBar * safeSlotsPerBeat;
    const currentTime = Number(beatTimes[beatIndex]) || 0;
    const nextTime = beatIndex + 1 < beatTimes.length
      ? Number(beatTimes[beatIndex + 1])
      : currentTime + 0.5;
    const probeTime = currentTime + Math.max(0.01, (nextTime - currentTime) / 2);
    const currentChord = getChordAtTime(segments, probeTime);

    if (currentChord && currentChord !== previousChord) {
        bar.slots[slotIndex] = currentChord;
    }
    previousChord = currentChord;
    }
  }

  let previousMeter = null;
  return bars.map(function(bar, index) {
    const suffix = ((index + 1) % safeBarsPerLine === 0) ? ' |\n' : ' | ';
    const barText = includeMeterChanges
      ? prefixMeterChange(bar.slots.join(' '), bar, previousMeter)
      : bar.slots.join(' ');
    const text = barText + suffix;
    previousMeter = bar.meter;
    return text;
  }).join('').trim();
}
