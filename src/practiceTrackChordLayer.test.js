import { parseChordChartBars } from './practiceTrackChordLayer';
import { attachChordsToStrains } from './practiceTrackChordLayer';

describe('parseChordChartBars', function() {
  test('extracts chord names per bar', function() {
    const bars = parseChordChartBars('D Em | G A |');
    expect(bars).toEqual(['D', 'G']);
  });

  test('ignores dot-only bars', function() {
    const bars = parseChordChartBars('| . . . . | G |');
    expect(bars[bars.length - 1]).toBe('G');
  });
});

describe('attachChordsToStrains', function() {
  test('maps bar chords onto strain sections', function() {
    const strains = [{
      strainLabel: 'A',
      startBar: 0,
      endBar: 1,
      chords: [],
    }];
    const chordsPerBar = ['D', 'Em', 'G'];
    const updated = attachChordsToStrains(strains, chordsPerBar);
    expect(updated[0].chords).toEqual(['D', 'Em']);
  });
});
