import { parseChordChartBars, attachChordsToStrains, expandChordsPerBarForPlan } from './practiceTrackChordLayer';

describe('parseChordChartBars', function() {
  test('extracts chord names per bar', function() {
    const bars = parseChordChartBars('D Em | G A |');
    expect(bars).toEqual(['D', 'G']);
  });

  test('ignores dot-only bars', function() {
    const bars = parseChordChartBars('| . . . . | G |');
    expect(bars[bars.length - 1]).toBe('G');
  });

  test('ignores section marker tokens in chart', function() {
    const bars = parseChordChartBars('[Verse] . . . | C . . . |');
    expect(bars).toEqual(['C']);
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

describe('expandChordsPerBarForPlan', function() {
  test('tiles chord chart to full bar count from boundaries', function() {
    const plan = {
      chordsPerBar: ['D', 'G', 'A', 'Bm'],
      timing: {
        barBoundariesSec: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      },
    };
    const expanded = expandChordsPerBarForPlan(plan);
    expect(expanded).toEqual(['D', 'G', 'A', 'Bm', 'D', 'G', 'A', 'Bm']);
  });
});
