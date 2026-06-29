import { buildVariableMeterBars, prefixMeterChange } from './timingGridUtils';
import { midiToAbcPitch } from './melodyPitchSpelling';

const SUBDIVISION_OPTIONS = [2, 3, 4];

function getBeatDuration(beatTimes, beatIndex) {
  const start = Number(beatTimes[beatIndex]) || 0;
  const end = beatIndex + 1 < beatTimes.length
    ? Number(beatTimes[beatIndex + 1])
    : start + 0.5;
  return Math.max(0.05, end - start);
}

function quantizeDuration(duration, beatDuration, slotsPerBeat) {
  const slotDuration = beatDuration / Math.max(1, slotsPerBeat);
  const slots = Math.max(1, Math.round(duration / slotDuration));
  if (slots === 1) return '';
  if (slots === 2) return '2';
  if (slots === 3) return '3';
  if (slots === 4) return '4';
  if (slots === 6) return '6';
  return String(slots);
}

function chooseSlotsPerBeat(notes, beatTimes, beatIndex) {
  const beatDuration = getBeatDuration(beatTimes, beatIndex);
  const beatStart = Number(beatTimes[beatIndex]) || 0;
  const beatEnd = beatIndex + 1 < beatTimes.length
    ? Number(beatTimes[beatIndex + 1])
    : beatStart + beatDuration;
  const beatNotes = notes.filter(function(note) {
    const start = Number(note.start) || 0;
    return start >= beatStart - 0.001 && start < beatEnd - 0.001;
  });
  if (beatNotes.length === 0) {
    return 2;
  }
  let bestSlots = 2;
  let bestError = Number.POSITIVE_INFINITY;
  SUBDIVISION_OPTIONS.forEach(function(slotsPerBeat) {
    let error = 0;
    beatNotes.forEach(function(note) {
      const duration = Math.max(0.05, (Number(note.end) || 0) - (Number(note.start) || 0));
      const slotDuration = beatDuration / slotsPerBeat;
      const roundedSlots = Math.max(1, Math.round(duration / slotDuration));
      error += Math.abs(duration - roundedSlots * slotDuration);
    });
    if (error < bestError) {
      bestError = error;
      bestSlots = slotsPerBeat;
    }
  });
  return bestSlots;
}

function findBeatIndex(beatTimes, time) {
  let index = 0;
  for (let i = 0; i < beatTimes.length; i++) {
    if (Number(beatTimes[i]) <= time) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

function slotForTime(start, beatTimes, beatIndex, slotsPerBeat) {
  const beatStart = Number(beatTimes[beatIndex]) || 0;
  const beatDuration = getBeatDuration(beatTimes, beatIndex);
  const slotDuration = beatDuration / Math.max(1, slotsPerBeat);
  const offset = Math.max(0, start - beatStart);
  return Math.max(0, Math.min(slotsPerBeat - 1, Math.round(offset / slotDuration)));
}

export function formatMelodyNotes(options) {
  const {
    notes,
    beatTimes,
    beatsPerBar,
    slotsPerBeat,
    meterChanges,
    key,
    snapToScale,
  } = options || {};

  if (!Array.isArray(notes) || notes.length === 0) return '';
  if (!Array.isArray(beatTimes) || beatTimes.length === 0) return '';

  const safeBeatsPerBar = Math.max(1, parseInt(beatsPerBar, 10) || 4);
  const defaultSlotsPerBeat = Math.max(1, parseInt(slotsPerBeat, 10) || 2);
  const bars = buildVariableMeterBars(beatTimes, meterChanges, safeBeatsPerBar)
    .map(function(bar) {
      return Object.assign({}, bar, { notes: [] });
    });

  notes.forEach(function(note) {
    const start = Number(note.start) || 0;
    const end = Number(note.end) || start;
    const beatIndex = findBeatIndex(beatTimes, start);
    let barNumber = 0;
    let beatInBar = 0;
    for (let i = 0; i < bars.length; i++) {
      const found = bars[i].beats.find(function(beat) { return beat.globalIndex === beatIndex; });
      if (found) {
        barNumber = i;
        beatInBar = found.index;
        break;
      }
    }
    const beatSlots = slotsPerBeat || chooseSlotsPerBeat(notes, beatTimes, beatIndex) || defaultSlotsPerBeat;
    const beatDuration = getBeatDuration(beatTimes, beatIndex);
    const duration = quantizeDuration(end - start, beatDuration, beatSlots);
    const pitch = midiToAbcPitch(note.midi, {
      key: key,
      snapToScale: snapToScale,
      confidence: note.confidence,
    });
    const slotOffset = slotForTime(start, beatTimes, beatIndex, beatSlots);

    if (!bars[barNumber]) return;
    bars[barNumber].notes.push({
      slot: beatInBar * beatSlots + slotOffset,
      token: pitch + duration,
      slotsPerBeat: beatSlots,
    });
  });

  let previousMeter = null;
  return bars.map(function(bar, barIndex) {
    const barSlots = Math.max(
      defaultSlotsPerBeat,
      bar.notes.reduce(function(max, entry) {
        return Math.max(max, entry.slotsPerBeat || defaultSlotsPerBeat);
      }, defaultSlotsPerBeat)
    );
    const slots = new Array(bar.beatsPerBar * barSlots).fill('z');
    bar.notes.forEach(function(entry) {
      if (entry.slot >= 0 && entry.slot < slots.length) {
        if (slots[entry.slot] === 'z') {
          slots[entry.slot] = entry.token;
        }
      }
    });
    const suffix = ((barIndex + 1) % 4 === 0) ? ' |\n' : ' | ';
    const text = prefixMeterChange(slots.join(' '), bar, previousMeter) + suffix;
    previousMeter = bar.meter;
    return text;
  }).join('').trim();
}
