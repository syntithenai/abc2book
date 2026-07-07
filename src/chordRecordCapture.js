import { beatsPerBarFromMeter } from './chordFillPattern';

export function createBeatCapture(options) {
  const opts = options || {};
  const tempo = opts.tempo > 0 ? opts.tempo : 120;
  const beatsPerBar = Math.max(1, opts.beatsPerBar || 4);
  const minLeadSec = opts.minLeadSec != null ? opts.minLeadSec : 0.08;
  const secondsPerBeat = 60 / tempo;

  let anchorTime = 0;
  let beatTimes = [];
  const assignments = {};

  function extendBeats(count) {
    const add = Math.max(1, count || beatsPerBar);
    const start = beatTimes.length;
    for (let i = start; i < start + add; i += 1) {
      beatTimes.push(anchorTime + i * secondsPerBeat);
    }
  }

  return {
    reset(anchor) {
      anchorTime = Number(anchor) || 0;
      beatTimes = [];
      Object.keys(assignments).forEach(function(key) { delete assignments[key]; });
      extendBeats(beatsPerBar * 4);
    },

    extendBeats: extendBeats,

    getBeatTimes() {
      return beatTimes.slice();
    },

    getAssignments() {
      return Object.assign({}, assignments);
    },

    assignChordOnNextBeat(pressedAtCtxTime, chordLabel) {
      const label = String(chordLabel || '').trim();
      if (!label) return null;

      const threshold = Number(pressedAtCtxTime) + minLeadSec;
      let targetIndex = -1;
      for (let i = 0; i < beatTimes.length; i += 1) {
        if (beatTimes[i] > threshold) {
          targetIndex = i;
          break;
        }
      }

      while (targetIndex < 0) {
        extendBeats(beatsPerBar);
        for (let i = 0; i < beatTimes.length; i += 1) {
          if (beatTimes[i] > threshold) {
            targetIndex = i;
            break;
          }
        }
      }

      assignments[targetIndex] = label;
      return {
        beatIndex: targetIndex,
        beatTime: beatTimes[targetIndex],
      };
    },
  };
}

export function assignmentsToChordGrid(assignments, meter, options) {
  const opts = options || {};
  const beatsPerBar = beatsPerBarFromMeter(meter);
  const barsPerLine = Math.max(1, opts.barsPerLine || 5);
  const indices = Object.keys(assignments || {})
    .map(function(key) { return parseInt(key, 10); })
    .filter(function(index) { return !isNaN(index); })
    .sort(function(a, b) { return a - b; });

  if (!indices.length) return '';

  const endBeat = opts.endBeatIndex != null
    ? Math.max(opts.endBeatIndex, indices[indices.length - 1])
    : indices[indices.length - 1];

  const bars = [];
  let previousChord = '';

  for (let globalIndex = 0; globalIndex <= endBeat; globalIndex += 1) {
    const barIndex = Math.floor(globalIndex / beatsPerBar);
    const beatInBar = globalIndex % beatsPerBar;
    while (bars.length <= barIndex) {
      bars.push(new Array(beatsPerBar).fill(''));
    }

    const chord = assignments[globalIndex];
    if (chord) {
      if (chord !== previousChord) {
        bars[barIndex][beatInBar] = chord;
        previousChord = chord;
      } else {
        bars[barIndex][beatInBar] = '.';
      }
    } else if (previousChord) {
      bars[barIndex][beatInBar] = '.';
    }
  }

  const trimmedBars = bars.filter(function(slots) {
    return slots.some(function(slot) { return String(slot).trim().length > 0; });
  });

  if (!trimmedBars.length) return '';

  return trimmedBars.map(function(slots, index) {
    const suffix = ((index + 1) % barsPerLine === 0) ? ' |\n' : ' | ';
    return slots.join(' ').replace(/\s+/g, ' ').trim() + suffix;
  }).join('').trim();
}
