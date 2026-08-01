import { rhythmFromTimeSignature } from './metronomeRhythmPresets';
import {
  CHORD_RECORD_RESOLUTION,
} from './chordRecordResolution';
import {
  createBeatCapture,
  createSlotCapture,
  assignmentsToChordGrid,
} from './chordRecordCapture';

describe('chordRecordCapture', function() {
  const rhythm44 = rhythmFromTimeSignature('4/4');

  test('assignChordOnNextBeat maps early tap to next beat', function() {
    const capture = createBeatCapture({ tempo: 120, beatsPerBar: 4 });
    capture.reset(10);
    const beatTimes = capture.getBeatTimes();
    const pressedAt = beatTimes[2] - 0.2;
    const result = capture.assignChordOnNextBeat(pressedAt, 'G');
    expect(result.beatIndex).toBe(2);
    expect(capture.getAssignments()[2]).toBe('G');
  });

  test('assignChordOnNextBeat extends beat grid when needed', function() {
    const capture = createBeatCapture({ tempo: 120, beatsPerBar: 4 });
    capture.reset(0);
    const beatTimes = capture.getBeatTimes();
    const farPress = beatTimes[beatTimes.length - 1] + 0.01;
    const result = capture.assignChordOnNextBeat(farPress, 'Am');
    expect(result.beatIndex).toBeGreaterThanOrEqual(beatTimes.length - 1);
    expect(capture.getAssignments()[result.beatIndex]).toBe('Am');
  });

  test('assignChordOnNextSlot maps early tap to next half-bar slot', function() {
    const capture = createSlotCapture({
      tempo: 120,
      rhythm: rhythm44,
      resolution: CHORD_RECORD_RESOLUTION.HALF_BAR,
      barDurationSec: 2,
    });
    capture.reset(0);
    const slotTimes = capture.getSlotTimes();
    const pressedAt = slotTimes[3] - 0.2;
    const result = capture.assignChordOnNextSlot(pressedAt, 'G');
    expect(result.slotIndex).toBe(3);
    expect(capture.getAssignments()[3]).toBe('G');
  });

  test('assignmentsToChordGrid uses dots for held chords', function() {
    const grid = assignmentsToChordGrid({
      0: 'C',
      1: 'C',
      4: 'G',
    }, '4/4', { endBeatIndex: 4, slotsPerBar: 4 });
    expect(grid).toContain('C');
    expect(grid).toContain('.');
    expect(grid).toContain('G');
  });

  test('assignmentsToChordGrid formats bar resolution', function() {
    const grid = assignmentsToChordGrid({
      0: 'C',
      1: 'G',
    }, '4/4', { slotsPerBar: 1, startSlotIndex: 0, endSlotIndex: 1 });
    expect(grid).toBe('C | G |');
  });

  test('assignmentsToChordGrid formats pulse resolution in 4/4', function() {
    const grid = assignmentsToChordGrid({
      0: 'C',
      7: 'G',
    }, '4/4', { slotsPerBar: 8, startSlotIndex: 0, endSlotIndex: 7 });
    expect(grid).toBe('C . . . . . . G |');
  });

  test('assignmentsToChordGrid formats half-bar resolution', function() {
    const grid = assignmentsToChordGrid({
      0: 'C',
      1: 'G',
    }, '4/4', { slotsPerBar: 2, startSlotIndex: 0, endSlotIndex: 1 });
    expect(grid).toBe('C G |');
  });

  test('assignmentsToChordGrid formats 3/4 bars', function() {
    const grid = assignmentsToChordGrid({
      0: 'D',
      3: 'A',
    }, '3/4', { endSlotIndex: 5, slotsPerBar: 4 });
    expect(grid).toContain('D');
    expect(grid).toContain('A');
    expect(grid).toContain('|');
  });

  test('assignmentsToChordGrid returns empty for no assignments', function() {
    expect(assignmentsToChordGrid({}, '4/4')).toBe('');
  });

  test('assignmentsToChordGrid skips count-in slots via startSlotIndex', function() {
    const grid = assignmentsToChordGrid({
      0: 'IGNORE',
      2: 'C',
      4: 'G',
    }, '4/4', { startSlotIndex: 2, endSlotIndex: 4, slotsPerBar: 2 });
    expect(grid).not.toContain('IGNORE');
    expect(grid).toContain('C');
    expect(grid).toContain('G');
  });
});
