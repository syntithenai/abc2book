import {
  createBeatCapture,
  assignmentsToChordGrid,
} from './chordRecordCapture';

describe('chordRecordCapture', function() {
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

  test('assignmentsToChordGrid uses dots for held chords', function() {
    const grid = assignmentsToChordGrid({
      0: 'C',
      1: 'C',
      4: 'G',
    }, '4/4', { endBeatIndex: 4 });
    expect(grid).toContain('C');
    expect(grid).toContain('.');
    expect(grid).toContain('G');
  });

  test('assignmentsToChordGrid formats 3/4 bars', function() {
    const grid = assignmentsToChordGrid({
      0: 'D',
      3: 'A',
    }, '3/4', { endBeatIndex: 5 });
    expect(grid).toContain('D');
    expect(grid).toContain('A');
    expect(grid).toContain('|');
  });

  test('assignmentsToChordGrid returns empty for no assignments', function() {
    expect(assignmentsToChordGrid({}, '4/4')).toBe('');
  });
});
