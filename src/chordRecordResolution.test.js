import { rhythmFromTimeSignature } from './metronomeRhythmPresets';
import {
  CHORD_RECORD_RESOLUTION,
  DEFAULT_CHORD_RECORD_RESOLUTION,
  buildSlotOffsetsInBar,
  offsetSecForSlotInBar,
  recordingSlotIndexForTime,
  shouldAdvanceCaptureSlot,
  slotsPerBarForResolution,
} from './chordRecordResolution';

describe('chordRecordResolution', function() {
  const rhythm44 = rhythmFromTimeSignature('4/4');
  const rhythm68 = rhythmFromTimeSignature('6/8');

  test('defaults to half bar', function() {
    expect(DEFAULT_CHORD_RECORD_RESOLUTION).toBe(CHORD_RECORD_RESOLUTION.HALF_BAR);
  });

  test('slotsPerBarForResolution maps modes in 4/4', function() {
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.BAR, rhythm44)).toBe(1);
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.HALF_BAR, rhythm44)).toBe(2);
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.BEAT, rhythm44)).toBe(4);
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.PULSE, rhythm44)).toBe(8);
  });

  test('slotsPerBarForResolution uses pulse grid in 6/8', function() {
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.PULSE, rhythm68)).toBe(6);
    expect(slotsPerBarForResolution(CHORD_RECORD_RESOLUTION.BEAT, rhythm68)).toBe(2);
  });

  test('buildSlotOffsetsInBar spaces half-bar slots evenly', function() {
    const offsets = buildSlotOffsetsInBar(CHORD_RECORD_RESOLUTION.HALF_BAR, rhythm44, 120);
    expect(offsets).toEqual([0, 1]);
  });

  test('buildSlotOffsetsInBar uses eighth-note grid for pulse in 4/4', function() {
    const offsets = buildSlotOffsetsInBar(CHORD_RECORD_RESOLUTION.PULSE, rhythm44, 120);
    expect(offsets).toHaveLength(8);
    expect(offsets[1]).toBeCloseTo(0.25, 5);
    expect(offsets[7]).toBeCloseTo(1.75, 5);
  });

  test('offsetSecForSlotInBar returns beat offsets in beat mode', function() {
    expect(offsetSecForSlotInBar(2, CHORD_RECORD_RESOLUTION.BEAT, rhythm44, 120)).toBe(1);
  });

  test('recordingSlotIndexForTime tracks sub-beat slots after count-in', function() {
    const slotTimes = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25];
    expect(recordingSlotIndexForTime(slotTimes, 8, 2.1)).toEqual({
      absoluteSlotIndex: 8,
      currentSlotIndex: 0,
    });
    expect(recordingSlotIndexForTime(slotTimes, 8, 2.3)).toEqual({
      absoluteSlotIndex: 9,
      currentSlotIndex: 1,
    });
  });

  test('shouldAdvanceCaptureSlot follows beat downbeats in beat mode', function() {
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.BEAT, rhythm44, 0, 1)).toBe(true);
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.BEAT, rhythm68, 1, 1)).toBe(false);
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.BEAT, rhythm68, 3, 1)).toBe(true);
  });

  test('shouldAdvanceCaptureSlot advances compound pulses in pulse mode', function() {
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.PULSE, rhythm68, 3, 0)).toBe(true);
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.PULSE, rhythm68, 1, 0)).toBe(true);
    expect(shouldAdvanceCaptureSlot(CHORD_RECORD_RESOLUTION.PULSE, rhythm44, 0, 0)).toBe(true);
  });
});
