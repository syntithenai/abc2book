import { metronomeBarDurationSec } from './chordFillPattern';
import { slotPulseIndex, slotsPerBar as rhythmSlotsPerBar } from './metronomeRhythmPresets';
import { slotDurationSec } from './rhythmGrid';
import { normalizeRhythmConfig } from './rhythmEngineTypes';

export const CHORD_RECORD_RESOLUTION = {
  BAR: 'bar',
  HALF_BAR: 'halfBar',
  BEAT: 'beat',
  PULSE: 'pulse',
};

export const CHORD_RECORD_RESOLUTION_OPTIONS = [
  { value: CHORD_RECORD_RESOLUTION.BAR, label: 'Per bar' },
  { value: CHORD_RECORD_RESOLUTION.HALF_BAR, label: 'Half bar' },
  { value: CHORD_RECORD_RESOLUTION.BEAT, label: 'Beat' },
  { value: CHORD_RECORD_RESOLUTION.PULSE, label: 'Pulse' },
];

export const DEFAULT_CHORD_RECORD_RESOLUTION = CHORD_RECORD_RESOLUTION.HALF_BAR;

export const PULSE_SUBDIVISIONS_PER_BEAT = 2;

export function normalizeChordRecordResolution(value) {
  const raw = String(value || '').trim();
  if (raw === CHORD_RECORD_RESOLUTION.BAR
    || raw === CHORD_RECORD_RESOLUTION.HALF_BAR
    || raw === CHORD_RECORD_RESOLUTION.BEAT
    || raw === CHORD_RECORD_RESOLUTION.PULSE) {
    return raw;
  }
  return DEFAULT_CHORD_RECORD_RESOLUTION;
}

export function rhythmUsesSimplePulseGrid(rhythm) {
  const config = normalizeRhythmConfig(rhythm);
  const pulses = config.pulsesPerBeat || [];
  if (!pulses.length) return true;
  return pulses.every(function(value) { return (value || 1) === 1; });
}

export function slotsPerBarForResolution(resolution, rhythm) {
  const config = normalizeRhythmConfig(rhythm);
  const beats = Math.max(1, config.beatsPerBar || 4);
  switch (normalizeChordRecordResolution(resolution)) {
    case CHORD_RECORD_RESOLUTION.BAR:
      return 1;
    case CHORD_RECORD_RESOLUTION.HALF_BAR:
      return 2;
    case CHORD_RECORD_RESOLUTION.BEAT:
      return beats;
    case CHORD_RECORD_RESOLUTION.PULSE:
    default:
      if (rhythmUsesSimplePulseGrid(config)) {
        return beats * PULSE_SUBDIVISIONS_PER_BEAT;
      }
      return Math.max(1, rhythmSlotsPerBar(config));
  }
}

export function buildSlotOffsetsInBar(resolution, rhythm, tempo) {
  const config = normalizeRhythmConfig(rhythm);
  const beats = Math.max(1, config.beatsPerBar || 4);
  const bpm = tempo > 0 ? tempo : 120;
  const barDur = metronomeBarDurationSec(bpm, beats);
  const secPerBeat = 60 / bpm;
  const slots = slotsPerBarForResolution(resolution, config);
  const normalized = normalizeChordRecordResolution(resolution);

  if (normalized === CHORD_RECORD_RESOLUTION.PULSE) {
    if (rhythmUsesSimplePulseGrid(config)) {
      const offsets = [];
      const slotDur = barDur / slots;
      for (let slot = 0; slot < slots; slot += 1) {
        offsets.push(slot * slotDur);
      }
      return offsets;
    }
    const offsets = [];
    let elapsed = 0;
    const pulseSlots = rhythmSlotsPerBar(config);
    for (let slot = 0; slot < pulseSlots; slot += 1) {
      offsets.push(elapsed);
      elapsed += slotDurationSec(config, slot, secPerBeat, 0);
    }
    return offsets;
  }

  if (normalized === CHORD_RECORD_RESOLUTION.BEAT) {
    const offsets = [];
    for (let beat = 0; beat < slots; beat += 1) {
      offsets.push(beat * secPerBeat);
    }
    return offsets;
  }

  const offsets = [];
  for (let slot = 0; slot < slots; slot += 1) {
    offsets.push((barDur * slot) / slots);
  }
  return offsets;
}

export function offsetSecForSlotInBar(slotInBar, resolution, rhythm, tempo) {
  const offsets = buildSlotOffsetsInBar(resolution, rhythm, tempo);
  const index = Math.max(0, Math.min(offsets.length - 1, slotInBar));
  return offsets[index] || 0;
}

export function recordingSlotIndexForTime(slotTimes, countInSlots, now) {
  if (!Array.isArray(slotTimes) || !slotTimes.length || !(now >= 0)) {
    return { absoluteSlotIndex: -1, currentSlotIndex: -1 };
  }
  const startAt = Math.max(0, countInSlots);
  let absoluteSlotIndex = startAt - 1;
  for (let i = startAt; i < slotTimes.length; i += 1) {
    if (slotTimes[i] <= now + 0.001) {
      absoluteSlotIndex = i;
    } else {
      break;
    }
  }
  if (absoluteSlotIndex < startAt) {
    return { absoluteSlotIndex: -1, currentSlotIndex: -1 };
  }
  return {
    absoluteSlotIndex: absoluteSlotIndex,
    currentSlotIndex: absoluteSlotIndex - startAt,
  };
}

/**
 * Whether a metronome slot callback should extend the capture timeline.
 */
export function shouldAdvanceCaptureSlot(resolution, rhythm, metronomeSlotInBar, recordingBeat) {
  const config = normalizeRhythmConfig(rhythm);
  const beats = Math.max(1, config.beatsPerBar || 4);
  const normalized = normalizeChordRecordResolution(resolution);

  if (normalized === CHORD_RECORD_RESOLUTION.PULSE) {
    if (rhythmUsesSimplePulseGrid(config)) {
      return slotPulseIndex(config, metronomeSlotInBar) === 0;
    }
    return true;
  }

  if (slotPulseIndex(config, metronomeSlotInBar) !== 0) {
    return false;
  }

  if (normalized === CHORD_RECORD_RESOLUTION.BEAT) {
    return true;
  }

  if (normalized === CHORD_RECORD_RESOLUTION.BAR) {
    return recordingBeat % beats === 0;
  }

  if (normalized === CHORD_RECORD_RESOLUTION.HALF_BAR) {
    return recordingBeat % Math.max(1, Math.ceil(beats / 2)) === 0;
  }

  return true;
}

export function resolutionStatusHint(resolution) {
  switch (normalizeChordRecordResolution(resolution)) {
    case CHORD_RECORD_RESOLUTION.BAR:
      return 'each bar change';
    case CHORD_RECORD_RESOLUTION.HALF_BAR:
      return 'each half bar';
    case CHORD_RECORD_RESOLUTION.BEAT:
      return 'each beat';
    case CHORD_RECORD_RESOLUTION.PULSE:
      return 'each pulse';
    default:
      return 'each half bar';
  }
}
