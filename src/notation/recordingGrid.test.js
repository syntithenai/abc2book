import { secondsToBeat, beatToSeconds, findBeatIndex } from './recordingGrid';

describe('recordingGrid', function() {
  const beatTimes = [0, 0.5, 1.0, 1.5, 2.0];

  test('findBeatIndex maps seconds to beat index', function() {
    expect(findBeatIndex(beatTimes, 0.7)).toBe(1);
    expect(findBeatIndex(beatTimes, 1.0)).toBe(2);
  });

  test('secondsToBeat interpolates within beat', function() {
    expect(secondsToBeat(0.75, beatTimes, 120)).toBeCloseTo(1.5, 2);
  });

  test('beatToSeconds inverts with beatTimes', function() {
    expect(beatToSeconds(1.5, beatTimes, 120)).toBeCloseTo(0.75, 2);
  });

  test('secondsToBeat falls back to tempo', function() {
    expect(secondsToBeat(1, null, 120)).toBeCloseTo(2, 2);
  });
});
