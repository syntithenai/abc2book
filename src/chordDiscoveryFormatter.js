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
  } = options || {};

  if (!Array.isArray(segments) || segments.length === 0) return '';
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return '';

  const safeBeatsPerBar = Math.max(1, parseInt(beatsPerBar, 10) || 4);
  const safeSlotsPerBeat = Math.max(1, parseInt(slotsPerBeat, 10) || 1);
  const safeBarsPerLine = Math.max(1, parseInt(barsPerLine, 10) || 5);
  const totalSlotsPerBar = safeBeatsPerBar * safeSlotsPerBeat;
  const bars = [];
  let previousChord = '';

  for (let beatIndex = 0; beatIndex < beatTimes.length; beatIndex++) {
    if (beatIndex % safeBeatsPerBar === 0) {
      bars.push(new Array(totalSlotsPerBar).fill('.'));
    }

    const barIndex = bars.length - 1;
    const beatInBar = beatIndex % safeBeatsPerBar;
    const slotIndex = beatInBar * safeSlotsPerBeat;
    const currentTime = Number(beatTimes[beatIndex]) || 0;
    const nextTime = beatIndex + 1 < beatTimes.length
      ? Number(beatTimes[beatIndex + 1])
      : currentTime + 0.5;
    const probeTime = currentTime + Math.max(0.01, (nextTime - currentTime) / 2);
    const currentChord = getChordAtTime(segments, probeTime);

    if (currentChord && currentChord !== previousChord) {
      bars[barIndex][slotIndex] = currentChord;
    }
    previousChord = currentChord;
  }

  return bars.map(function(bar, index) {
    const suffix = ((index + 1) % safeBarsPerLine === 0) ? ' |\n' : ' | ';
    return bar.join(' ') + suffix;
  }).join('').trim();
}
