import { beatsPerBarFromMeter, metronomeBarDurationSec } from './chordFillPattern';
import {
  buildSlotOffsetsInBar,
  slotsPerBarForResolution,
} from './chordRecordResolution';

export function createSlotCapture(options) {
  const opts = options || {};
  const tempo = opts.tempo > 0 ? opts.tempo : 120;
  const rhythm = opts.rhythm;
  const resolution = opts.resolution;
  const slotsPerBar = Math.max(1, opts.slotsPerBar || slotsPerBarForResolution(resolution, rhythm));
  const minLeadSec = opts.minLeadSec != null ? opts.minLeadSec : 0.08;
  const slotOffsetsInBar = Array.isArray(opts.slotOffsetsInBar) && opts.slotOffsetsInBar.length
    ? opts.slotOffsetsInBar.slice()
    : buildSlotOffsetsInBar(resolution, rhythm, tempo);
  const beatsPerBar = Math.max(1, (rhythm && rhythm.beatsPerBar) || slotsPerBar);
  const barDurSec = opts.barDurationSec > 0
    ? opts.barDurationSec
    : metronomeBarDurationSec(tempo, beatsPerBar);

  let anchorTime = 0;
  let slotTimes = [];
  const assignments = {};

  function barDurationSec() {
    return barDurSec;
  }

  function timeForSlot(globalIndex) {
    const barIndex = Math.floor(globalIndex / slotsPerBar);
    const slotInBar = ((globalIndex % slotsPerBar) + slotsPerBar) % slotsPerBar;
    const barDur = barDurationSec();
    return anchorTime + barIndex * barDur + (slotOffsetsInBar[slotInBar] || 0);
  }

  function extendSlots(count) {
    const add = Math.max(1, count || slotsPerBar);
    const start = slotTimes.length;
    for (let i = start; i < start + add; i += 1) {
      slotTimes.push(timeForSlot(i));
    }
  }

  return {
    getSlotsPerBar: function() { return slotsPerBar; },

    reset(anchor) {
      anchorTime = Number(anchor) || 0;
      slotTimes = [];
      Object.keys(assignments).forEach(function(key) { delete assignments[key]; });
      extendSlots(slotsPerBar * 4);
    },

    extendSlots: extendSlots,

    getSlotTimes() {
      return slotTimes.slice();
    },

    getAssignments() {
      return Object.assign({}, assignments);
    },

    assignChordOnNextSlot(pressedAtCtxTime, chordLabel) {
      const label = String(chordLabel || '').trim();
      if (!label) return null;

      const threshold = Number(pressedAtCtxTime) + minLeadSec;
      let targetIndex = -1;
      for (let i = 0; i < slotTimes.length; i += 1) {
        if (slotTimes[i] > threshold) {
          targetIndex = i;
          break;
        }
      }

      while (targetIndex < 0) {
        extendSlots(slotsPerBar);
        for (let i = 0; i < slotTimes.length; i += 1) {
          if (slotTimes[i] > threshold) {
            targetIndex = i;
            break;
          }
        }
      }

      assignments[targetIndex] = label;
      const slotInBar = ((targetIndex % slotsPerBar) + slotsPerBar) % slotsPerBar;
      return {
        slotIndex: targetIndex,
        slotTime: slotTimes[targetIndex],
        slotInBar: slotInBar,
      };
    },
  };
}

/** @deprecated use createSlotCapture */
export function createBeatCapture(options) {
  const opts = options || {};
  const beatsPerBar = Math.max(1, opts.beatsPerBar || 4);
  const capture = createSlotCapture({
    tempo: opts.tempo,
    rhythm: { beatsPerBar: beatsPerBar, pulsesPerBeat: new Array(beatsPerBar).fill(1) },
    resolution: 'beat',
    slotsPerBar: beatsPerBar,
    minLeadSec: opts.minLeadSec,
  });
  return {
    reset: capture.reset,
    extendBeats: function(count) { capture.extendSlots(count); },
    getBeatTimes: capture.getSlotTimes,
    getAssignments: capture.getAssignments,
    assignChordOnNextBeat: function(pressedAt, chordLabel) {
      const result = capture.assignChordOnNextSlot(pressedAt, chordLabel);
      if (!result) return null;
      return {
        beatIndex: result.slotIndex,
        beatTime: result.slotTime,
      };
    },
  };
}

export function assignmentsToChordGrid(assignments, meter, options) {
  const opts = options || {};
  const beatsPerBar = Math.max(1, opts.beatsPerBar || beatsPerBarFromMeter(meter));
  const slotsPerBar = Math.max(1, opts.slotsPerBar || beatsPerBar);
  const barsPerLine = Math.max(1, opts.barsPerLine || 5);
  const startSlot = Math.max(0, opts.startSlotIndex != null ? opts.startSlotIndex : (opts.startBeatIndex || 0));
  const indices = Object.keys(assignments || {})
    .map(function(key) { return parseInt(key, 10); })
    .filter(function(index) { return !isNaN(index) && index >= startSlot; })
    .sort(function(a, b) { return a - b; });

  if (!indices.length) return '';

  const endSlot = opts.endSlotIndex != null
    ? Math.max(opts.endSlotIndex, indices[indices.length - 1])
    : (opts.endBeatIndex != null
      ? Math.max(opts.endBeatIndex, indices[indices.length - 1])
      : indices[indices.length - 1]);

  const bars = [];
  let previousChord = '';

  for (let absoluteIndex = startSlot; absoluteIndex <= endSlot; absoluteIndex += 1) {
    const globalIndex = absoluteIndex - startSlot;
    const barIndex = Math.floor(globalIndex / slotsPerBar);
    const slotInBar = globalIndex % slotsPerBar;
    while (bars.length <= barIndex) {
      bars.push(new Array(slotsPerBar).fill(''));
    }

    const chord = assignments[absoluteIndex];
    if (chord) {
      if (chord !== previousChord) {
        bars[barIndex][slotInBar] = chord;
        previousChord = chord;
      } else {
        bars[barIndex][slotInBar] = '.';
      }
    } else if (previousChord) {
      bars[barIndex][slotInBar] = '.';
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
